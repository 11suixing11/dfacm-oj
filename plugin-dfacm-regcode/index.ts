/* swpu-regcode — 无密码验证码单流登录（d&f算法网定制插件；仓库目录名 dfacm，服务器 addon 目录保留 swpu- 前缀以兼容现网）
 * GET  /reg            登录/注册单页（读取同目录 reg.html；学生=验证码流，管理员可 ?tab=pwd 进密码面板）
 * POST /reg/code       {mail, purpose:reg|login|auto}  发送 6 位验证码（auto=按注册状态自动判 reg 或 login）
 * POST /reg/complete   {mail, code, uname, [password]}  注册并登录（无密码=随机不可用散列）
 * POST /reg/login      {mail, code}     验证码免密登录
 * 脚本 swpuIssueCode   {mail, purpose}  管理员人工发码兜底（邮件通道故障时经 /manage/script 或 CLI 取码转告）
 * 发信：系统 smtp.* 为主通道；dfacm.regcode.smtp2_* 六键配置备用通道，主通道失败时自动切换
 */
import fs from 'fs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { join } from 'path';
import {
    BlackListModel, Context, db, DomainModel, Handler, Logger, OplogModel, PERM, post, PRIV,
    Schema, sendMail, SettingModel, SystemModel, Types, UserAlreadyExistError, UserModel,
} from 'hydrooj';
import { loginPolicyFailure } from './auth';
import { createCodeStore } from './codes';
import type { CodeCollection, CodeFailureReason, CodePurpose } from './codes';
import { DEFAULTS, localRedirect, positiveLimit } from './config';
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, normalizeMail, resolveClientIp } from './logic';

const logger = new Logger('swpu-regcode');
const codes = createCodeStore(
    db.collection('regcode') as unknown as CodeCollection,
    { ttlMs: CODE_TTL_MS, maxAttempts: MAX_CODE_ATTEMPTS },
);
const PAGE = fs.readFileSync(join(__dirname, 'reg.html'), 'utf-8');

// Caddy rewrites bare GET /login to /reg?tab=pwd without changing the browser
// URL, so the initial tab cannot come from location.search — Hydro merges the
// rewritten query into handler args and the page boots from this marker.
const TABS = ['reg', 'login', 'pwd'];
const BOOT_MARK = '/*__SWPU_BOOT__*/';

// Third-party login buttons come from the same source Hydro's own login page
// uses (handler.loginMethods = registered oauth providers), so an unconfigured
// provider never renders a dead button on the branded page.
function oauthEntries(handler: Handler) {
    const methods = (handler as unknown as { loginMethods?: Array<{ id: string; text: string; icon: string }> }).loginMethods;
    if (!Array.isArray(methods)) return [];
    return methods.filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string' && typeof m.icon === 'string')
        .map((m) => ({ id: m.id, text: m.text, icon: m.icon }));
}

// Caddy is the only trusted proxy; resolve the real client IP for rate limits,
// login records and contest IP binding.
function getClientIp(handler: Handler): string {
    return resolveClientIp(handler.request.ip, handler.request.headers['x-forwarded-for']);
}

function fail(handler: Handler, message: string) {
    handler.response.body = { ok: false, message };
}

const codeMessages: Record<CodeFailureReason, string> = {
    missing: '验证码不存在或已使用，请重新获取。',
    expired: '验证码已过期，请重新获取。',
    invalid: '验证码错误，请重试。',
    attempts: '尝试次数过多，请重新获取验证码。',
    pending: '验证码邮件正在发送，请稍后再试。',
    binding: '验证码与当前账号或用途不匹配，请重新获取。',
};

function loginPolicy(handler: Handler, udoc: Awaited<ReturnType<typeof UserModel.getById>>) {
    return loginPolicyFailure(udoc, {
        enabled: !!SystemModel.get('server.login'),
        contestMode: SystemModel.get('system.contestmode'),
        ip: getClientIp(handler),
        profilePrivilege: PRIV.PRIV_USER_PROFILE,
        editSystemPrivilege: PRIV.PRIV_EDIT_SYSTEM,
        hasOtherUserAtIp: async (uid, ip) => !!await UserModel.getMulti({ loginip: ip, _id: { $ne: uid } })
            .project({ _id: 1 }).limit(1).next(),
    });
}

function checkRegistration(handler: Handler) {
    if (!SystemModel.get('server.login')) {
        fail(handler, '当前已关闭站内注册和登录。');
        return false;
    }
    handler.checkPriv(PRIV.PRIV_REGISTER_USER);
    return true;
}

// --- CSRF -----------------------------------------------------------------
// /reg/complete creates an account and /reg/login calls ctx.serial('auth/login')
// then establishes a session. Both are reachable with nothing but the visitor's
// own cookie, so the token has to come from the session rather than from
// anything the requester controls. Defined locally because each addon ships as an
// independently-installed directory.
const CSRF_SESSION_KEY = 'swpuRegcodeCsrf';

function csrfToken(handler: Handler): string {
    const session = handler.session;
    if (!session) return '';
    const existing = session[CSRF_SESSION_KEY];
    if (typeof existing === 'string' && existing.length === 64) return existing;
    const token = randomBytes(32).toString('hex');
    session[CSRF_SESSION_KEY] = token;
    return token;
}

function csrfRejected(handler: Handler, sent: unknown): boolean {
    const expected = handler.session && handler.session[CSRF_SESSION_KEY];
    if (typeof expected !== 'string' || typeof sent !== 'string') return true;
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    return a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b);
}

async function limitVerification(handler: Handler, mailKey: string) {
    await handler.limitRate('regcode_verify_ip', 60,
        positiveLimit(SystemModel.get('limit.regcode_verify_ip'), DEFAULTS.verifyIpMinute), getClientIp(handler));
    await handler.limitRate('regcode_verify_account', 60,
        positiveLimit(SystemModel.get('limit.regcode_verify_account'), DEFAULTS.verifyAccountMinute), mailKey);
}

// Both /reg/code and /reg/login answer differently depending on whether the
// address exists, so UserModel.getByEmail must never be reachable at request
// rate. Keyed on the submitted address and the real client IP - never on the
// resolved account - so the budget cannot be aimed at one victim, and kept
// separate from the send/verify counters so probing cannot silently eat a
// legitimate user's own quota.
async function limitProbe(handler: Handler, mail: string) {
    const budget = positiveLimit(SystemModel.get('limit.regcode_send_ip'), DEFAULTS.sendIpHourly);
    // Hydro's canonical mail normalization, not a bare lowercase: a per-address
    // budget keyed on the raw string would be trivially evaded with +tag variants.
    await handler.limitRate('regcode_probe_ip', 3600, budget, getClientIp(handler));
    await handler.limitRate('regcode_probe_mail', 3600, budget, UserModel._handleMailLower(mail));
}

// OplogModel.log copies handler.args. Remove the one-time secret before logging.
async function authAudit(handler: Handler, type: string, uid: number) {
    const originalArgs = handler.args;
    const { code, password, verifyPassword, ...safeArgs } = originalArgs;
    handler.args = safeArgs;
    try {
        await OplogModel.log(handler, type, { uid, method: 'swpu-mail-code' });
    } finally {
        handler.args = originalArgs;
    }
}

function mailHtml(title: string, code: string, note: string) {
    return `<div style="font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a1322;color:#e8edf5;border-radius:16px">
<div style="font-size:12px;letter-spacing:4px;color:#c9a227;margin-bottom:12px">d&amp;f算法网 · ONLINE JUDGE</div>
<h2 style="font-size:20px;margin:0 0 18px;color:#e8edf5">${title}</h2>
<div style="font-size:38px;font-weight:700;letter-spacing:12px;color:#e9c455;font-family:Consolas,monospace;margin:18px 0">${code}</div>
<p style="color:#a7b4c7;font-size:14px;margin:6px 0">${note}</p>
<p style="color:#66748c;font-size:12px;margin-top:24px">每个人都能在算法竞赛这条路上找到属于自己的 final。 —— dfacm.website</p>
</div>`;
}

// 发信双通道：先走 Hydro 的 sendMail（系统 smtp.* 主通道）；失败时切换到插件自有的
// 备用通道（dfacm.regcode.smtp2_* 设置键），Gmail 整体故障也不能把学生锁在门外。
// smtp2_host 留空 = 备用通道停用。
async function deliverCode(recipient: string, mode: CodePurpose, code: string): Promise<boolean> {
    const subject = mode === 'reg' ? '【d&f算法网】注册验证码' : '【d&f算法网】登录验证码';
    const text = mode === 'reg'
        ? `您的验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件。`
        : `您的登录验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件并建议修改密码。`;
    const html = mailHtml(
        mode === 'reg' ? '你的注册验证码' : '你的登录验证码',
        code,
        mode === 'reg'
            ? '验证码 5 分钟内有效。如非本人操作，请忽略本邮件。'
            : '验证码 5 分钟内有效。如非本人操作，请忽略本邮件并建议尽快修改密码。',
    );
    try {
        await sendMail(recipient, subject, text, html);
        return true;
    } catch (e) {
        logger.error('primary mail channel failed:', e instanceof Error ? e.message : String(e));
    }
    const host = String(SystemModel.get('dfacm.regcode.smtp2_host') || '');
    const user = String(SystemModel.get('dfacm.regcode.smtp2_user') || '');
    const pass = String(SystemModel.get('dfacm.regcode.smtp2_pass') || '');
    if (!host || !user || !pass) return false;
    try {
        // nodemailer 位于 yarn global 树（与 hydrooj 同级）；插件目录内的
        // node_modules/nodemailer 软链由部署清单保证（见 deployment.md）。
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodemailer = require('nodemailer');
        const port = positiveLimit(SystemModel.get('dfacm.regcode.smtp2_port'), 465);
        const secure = String(SystemModel.get('dfacm.regcode.smtp2_secure')) !== 'false';
        const from = String(SystemModel.get('dfacm.regcode.smtp2_from') || user);
        const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
        await transport.sendMail({ from, to: recipient, subject, text, html });
        logger.info('code delivered via backup smtp channel');
        return true;
    } catch (e) {
        logger.error('backup mail channel failed:', e instanceof Error ? e.message : String(e));
    }
    return false;
}

// 邮件通道整体故障时的管理员兜底：经 /manage/script 或
// `hydrooj cli script swpuIssueCode '{"mail":"..."}'` 直接生成验证码，由管理员
// 经 QQ/口头转告学生。全程不经过邮件。
async function issueCodeManually(
    args: { mail?: string; purpose?: string },
    report: (payload: Record<string, unknown>) => void,
): Promise<boolean> {
    const mail = normalizeMail(String(args?.mail || ''));
    const raw = String(args?.purpose || 'auto');
    if (raw !== 'auto' && raw !== 'reg' && raw !== 'login') {
        report({ message: 'purpose 只支持 auto / reg / login。' });
        return false;
    }
    if (!mail.includes('@')) {
        report({ message: '邮箱地址不合法。' });
        return false;
    }
    const registered = await UserModel.getByEmail('system', mail);
    const mode: CodePurpose = raw === 'auto' ? (registered ? 'login' : 'reg')
        : (raw === 'login' ? 'login' : 'reg');
    if (mode === 'reg' && registered) {
        report({ message: `该邮箱已注册（${registered.uname}），请改用 purpose=login 发登录码。` });
        return false;
    }
    if (mode === 'login' && !registered) {
        report({ message: '该邮箱未注册，请改用 purpose=reg 发注册码。' });
        return false;
    }
    const issued = mode === 'login'
        ? await codes.prepare(UserModel._handleMailLower(registered!.mail), 'login', registered!._id)
        : await codes.prepare(mail, 'reg', undefined);
    if (!await codes.activate(issued)) {
        report({ message: '发码失败：该邮箱已有更新的验证码，请使用最新一封邮件中的验证码。' });
        return false;
    }
    report({ message: `已发码（purpose=${mode}）：${issued.code}，5 分钟内有效——请经 QQ/口头转告用户，勿在群内公开。` });
    return true;
}

class RegPageHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const boot: string[] = [];
        // /reg/complete creates an account and /reg/login establishes a session,
        // both reachable with nothing but the visitor's cookie. The token is
        // minted into the session (a guest still gets one) and handed to the page
        // through the same boot payload as the tab.
        boot.push(`window.__SWPU_BOOT.csrf=${JSON.stringify(csrfToken(this))};`);
        // Student accounts are passwordless: the break-glass password pane exists
        // only for operators. The flag also drives the footer links that expose
        // password login / password recovery, so they never render for students.
        const canPwd = !!this.user?.hasPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (canPwd) boot.push('window.__SWPU_BOOT.canPwd=true;');
        const tab = String(this.args.tab ?? '');
        // A student asking for ?tab=pwd is silently routed to the default flow
        // (the param carries no privilege and must not reveal the pane).
        if (tab === 'pwd' ? canPwd : TABS.includes(tab)) boot.push(`window.__SWPU_BOOT.tab=${JSON.stringify(tab)};`);
        // The in-place auth modal embeds this page in a same-origin iframe.
        if (String(this.args.embed ?? '') === '1') boot.push('window.__SWPU_BOOT.embed=true;');
        const oauth = oauthEntries(this);
        if (oauth.length) boot.push(`window.__SWPU_BOOT.oauth=${JSON.stringify(oauth)};`);
        // A function replacer is mandatory, not stylistic: with a string
        // replacement, boot's JSON (which embeds operator-supplied OAuth
        // provider text) would have $&/$`/$'/$$ expanded, splicing the
        // remainder of reg.html into the inline <script>.
        this.response.body = boot.length ? PAGE.replace(BOOT_MARK, () => boot.join('')) : PAGE;
        this.response.type = 'text/html; charset=utf-8';
        this.response.addHeader('Cache-Control', 'no-store');
    }
}

class RegCodeHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('purpose', Types.String, true)
    async post(domainId: string, mail: string, purpose: string) {
        if (purpose && purpose !== 'reg' && purpose !== 'login' && purpose !== 'auto') {
            fail(this, '验证码用途不合法。');
            return;
        }
        const raw = purpose || 'auto';
        await limitProbe(this, mail);
        const registered = await UserModel.getByEmail('system', mail);
        // The unified page does not know the address state up front: 'auto'
        // resolves server-side — an existing account gets a login code bound to
        // its real mailbox, a new address gets a registration code.
        const mode: CodePurpose = raw === 'auto'
            ? (registered ? 'login' : 'reg')
            : (raw === 'login' ? 'login' : 'reg');
        if (mode === 'reg' && !checkRegistration(this)) return;
        if (mode === 'reg' && registered) {
            this.response.body = { ok: false, message: '该邮箱已注册过账号，请直接登录或找回密码。' };
            return;
        }
        if (mode === 'login' && !registered) {
            this.response.body = { ok: false, message: '该邮箱未注册，请先注册账号。' };
            return;
        }
        if (mode === 'login') {
            const blocked = await loginPolicy(this, registered);
            if (blocked) { fail(this, blocked); return; }
        }
        // The delivery address must be the existing account's bound email, not
        // an input alias that happens to match Hydro's normalized lookup key.
        const recipient = mode === 'login' ? registered.mail : normalizeMail(mail);
        const mailKey = UserModel._handleMailLower(recipient);
        const mailDomain = recipient.split('@')[1].toLowerCase();
        if (await BlackListModel.get(`mail::${mailDomain}`)) {
            this.response.body = { ok: false, message: '该邮箱域名暂不支持。' };
            return;
        }
        await this.limitRate('regcode_send', 60, 1, mailKey);
        await this.limitRate('regcode_send_ip', 3600,
            positiveLimit(SystemModel.get('limit.regcode_send_ip'), DEFAULTS.sendIpHourly), getClientIp(this));
        await this.limitRate('regcode_send_global', 3600,
            positiveLimit(SystemModel.get('limit.regcode_send_global'), DEFAULTS.sendGlobalHourly), 'site');
        // New accounts must finish with the exact address that received the
        // registration email. Hydro's lookup normalization is only a rate key.
        const issued = await codes.prepare(mode === 'reg' ? recipient : mailKey, mode,
            mode === 'login' ? registered._id : undefined);
        const { code } = issued;
        if (!await deliverCode(recipient, mode, code)) {
            await codes.discard(issued);
            this.response.body = { ok: false, message: '验证码邮件发送失败，请稍后再试。' };
            return;
        }
        if (!await codes.activate(issued)) {
            fail(this, '本次验证码已失效，请使用最新邮件中的验证码或重新获取。');
            return;
        }
        this.response.body = { ok: true, message: '验证码已发送，请查收邮箱（5 分钟内有效）。', registered: mode === 'login' };
    }
}

async function loginAs(handler: Handler, domainId: string, uid: number) {
    const udoc = await UserModel.getById(domainId, uid);
    const blocked = await loginPolicy(handler, udoc);
    if (blocked) { fail(handler, blocked); return false; }
    await handler.ctx.serial('auth/before-login', handler, udoc);
    await UserModel.setById(uid, { loginat: new Date(), loginip: getClientIp(handler) });
    handler.context.HydroContext.user = udoc;
    handler.session.viewLang = '';
    handler.session.uid = udoc._id;
    handler.session.sudo = null;
    handler.session.sudoUid = null;
    handler.session.scope = PERM.PERM_ALL.toString();
    handler.session.oauthBind = null;
    handler.session.recreate = true;
    await authAudit(handler, 'user.loginSuccess', uid);
    await handler.ctx.serial('auth/login', handler, udoc);
    return true;
}

class RegCompleteHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('code', Types.String)
    @post('uname', Types.String)
    @post('password', Types.Password, true)
    @post('csrf', Types.String, true)
    async post(domainId: string, mail: string, code: string, uname: string, password: string | undefined, csrf?: string) {
        if (csrfRejected(this, csrf)) { fail(this, '会话已过期，请刷新页面后重试。'); return; }
        if (!checkRegistration(this)) return;
        const recipient = normalizeMail(mail);
        const mailKey = UserModel._handleMailLower(recipient);
        await limitVerification(this, mailKey);
        if (await UserModel.getByEmail('system', mail)) {
            this.response.body = { ok: false, message: '该邮箱已注册过账号，请直接登录。' };
            return;
        }
        if (!Types.Username[1](uname)) {
            this.response.body = { ok: false, message: '用户名不符合站点规则，请修改后重试。' };
            return;
        }
        uname = Types.Username[0](uname);
        if (await UserModel.getByUname('system', uname)) {
            fail(this, '用户名已被占用，换一个试试。');
            return;
        }
        const checked = await codes.consume(recipient, 'reg', code);
        if (!checked.ok) { fail(this, codeMessages[checked.reason]); return; }
        let uid: number;
        try {
            // Passwordless accounts: students never set a password. A random
            // secret they never see keeps the stored hash format valid while
            // making password login practically unreachable — the mailbox code
            // is their only key.
            const finalPassword = (typeof password === 'string' && password.length >= 6)
                ? password
                : randomBytes(32).toString('hex');
            uid = await UserModel.create(recipient, uname, finalPassword, undefined, getClientIp(this));
        } catch (e) {
            if (e instanceof UserAlreadyExistError || (e as { code?: number }).code === 11000) {
                fail(this, '用户名或邮箱已被占用，请修改后重新获取验证码。');
                return;
            }
            throw e;
        }
        const [id, mailDomain] = recipient.split('@');
        const $set: any = {};
        if (mailDomain === 'qq.com' && !Number.isNaN(+id)) {
            $set.avatar = `qq:${id}`;
            $set.qq = `${id}`;
        }
        if (Object.keys($set).length) await UserModel.setById(uid, $set);
        // Hydro's ranking board lists only domain users with join=true, and neither
        // native registration nor UserModel.create sets it (the flag normally comes
        // from an explicit domain join or an admin role assignment) — new students
        // would solve problems yet never appear on /ranking. Auto-join the system
        // domain and the POJ mirror so the boards pick members up once they solve.
        try {
            await DomainModel.setUserRole(domainId, uid, 'default', true);
            await DomainModel.setUserRole('poj', uid, 'default', true);
        } catch (e) {
            logger.error('auto-join domain failed:', e instanceof Error ? e.message : String(e));
        }
        await authAudit(this, 'user.register', uid);
        if (!await loginAs(this, domainId, uid)) {
            const response = this.response.body as { ok: boolean; message: string };
            response.message = `账号已创建，但未能自动登录：${response.message}`;
            return;
        }
        this.response.body = { ok: true, redirect: localRedirect(
            SystemModel.get('dfacm.regcode.register_redirect'), DEFAULTS.registerRedirect,
        ) };
    }
}

class CodeLoginHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('code', Types.String)
    @post('csrf', Types.String, true)
    async post(domainId: string, mail: string, code: string, csrf?: string) {
        if (csrfRejected(this, csrf)) { fail(this, '会话已过期，请刷新页面后重试。'); return; }
        await limitProbe(this, mail);
        const udoc = await UserModel.getByEmail('system', mail);
        if (!udoc) {
            this.response.body = { ok: false, message: '该邮箱未注册，请先注册账号。' };
            return;
        }
        const blocked = await loginPolicy(this, udoc);
        if (blocked) { fail(this, blocked); return; }
        const mailKey = UserModel._handleMailLower(udoc.mail);
        await limitVerification(this, mailKey);
        const checked = await codes.consume(mailKey, 'login', code, udoc._id);
        if (!checked.ok) { fail(this, codeMessages[checked.reason]); return; }
        if (!await loginAs(this, domainId, udoc._id)) return;
        this.response.body = { ok: true, redirect: localRedirect(
            SystemModel.get('dfacm.regcode.login_redirect'), DEFAULTS.loginRedirect,
        ) };
    }
}

export const inject = ['db'];

export async function apply(ctx: Context) {
    const { Setting, SystemSetting } = SettingModel;
    const isPositive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100000;
    ctx.effect(() => SystemSetting(
        Setting('setting_swpu_regcode', 'limit.regcode_send_ip', DEFAULTS.sendIpHourly, 'number',
            '验证码发送：每 IP 每小时上限', '共享出口默认 200；邮箱仍每 60 秒最多一次。', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_send_global', DEFAULTS.sendGlobalHourly, 'number',
            '验证码发送：全站每小时上限', '请按发件邮箱额度调整，默认 500。', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_verify_ip', DEFAULTS.verifyIpMinute, 'number',
            '验证码校验：每 IP 每分钟上限', '', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_verify_account', DEFAULTS.verifyAccountMinute, 'number',
            '验证码校验：每邮箱每分钟上限', '', 0, isPositive),
        Setting('setting_swpu_regcode', 'dfacm.regcode.register_redirect', DEFAULTS.registerRedirect, 'text',
            '注册成功跳转路径', '站内路径，如 /training；可填写已有训练路线地址。', 0,
            (value) => localRedirect(value, '') !== ''),
        Setting('setting_swpu_regcode', 'dfacm.regcode.login_redirect', DEFAULTS.loginRedirect, 'text',
            '验证码登录成功跳转路径', '仅允许站内路径。', 0, (value) => localRedirect(value, '') !== ''),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_host', '', 'text',
            '备用发信 SMTP 主机', '主通道（系统 smtp.*）故障时自动切换；留空停用备用通道。', 0),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_port', 465, 'number',
            '备用发信 SMTP 端口', '465=SSL，587=STARTTLS。', 0, isPositive),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_secure', true, 'boolean',
            '备用通道是否 SSL', '465 端口必须勾选。', 0),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_user', '', 'text',
            '备用发信账号', '完整邮箱地址。', 0),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_pass', '', 'text',
            '备用发信密码/授权码', 'QQ 邮箱填授权码（非登录密码）。', 0),
        Setting('setting_swpu_regcode', 'dfacm.regcode.smtp2_from', '', 'text',
            '备用发件人显示', '如 "d&f算法网" <user@example.com>；留空则用账号地址。', 0),
    ));
    await codes.ensureIndexes();
    ctx.Route('reg_page', '/reg', RegPageHandler);
    ctx.Route('reg_code', '/reg/code', RegCodeHandler);
    ctx.Route('reg_complete', '/reg/complete', RegCompleteHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('code_login', '/reg/login', CodeLoginHandler);
    ctx.addScript('swpuIssueCode', 'd&f算法网：人工发码（邮件通道故障时管理员兜底，码转告用户）', Schema.object({
        mail: Schema.string(),
        purpose: Schema.string().default('auto'),
    }), issueCodeManually);
    logger.info('swpu-regcode routes ready: /reg, /reg/code, /reg/complete, /reg/login');
}
