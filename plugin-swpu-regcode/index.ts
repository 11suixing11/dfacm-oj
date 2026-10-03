/* swpu-regcode — 数字验证码注册/登录（SWPU ACM 定制插件）
 * GET  /reg            注册+验证码登录双标签页（读取同目录 reg.html）
 * POST /reg/code       {mail, purpose}  发送 6 位验证码（purpose: reg|login）
 * POST /reg/complete   {mail, code, uname, password}   注册并登录
 * POST /reg/login      {mail, code}     验证码免密登录
 */
import fs from 'fs';
import { join } from 'path';
import {
    BlackListModel, Context, db, Handler, Logger, OplogModel, PERM, post, PRIV,
    sendMail, SettingModel, SystemModel, Types, UserAlreadyExistError, UserModel,
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

async function limitVerification(handler: Handler, mailKey: string) {
    await handler.limitRate('regcode_verify_ip', 60,
        positiveLimit(SystemModel.get('limit.regcode_verify_ip'), DEFAULTS.verifyIpMinute), getClientIp(handler));
    await handler.limitRate('regcode_verify_account', 60,
        positiveLimit(SystemModel.get('limit.regcode_verify_account'), DEFAULTS.verifyAccountMinute), mailKey);
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
<div style="font-size:12px;letter-spacing:4px;color:#c9a227;margin-bottom:12px">SWPU ACM · TRAINING GROUND</div>
<h2 style="font-size:20px;margin:0 0 18px;color:#e8edf5">${title}</h2>
<div style="font-size:38px;font-weight:700;letter-spacing:12px;color:#e9c455;font-family:Consolas,monospace;margin:18px 0">${code}</div>
<p style="color:#a7b4c7;font-size:14px;margin:6px 0">${note}</p>
<p style="color:#66748c;font-size:12px;margin-top:24px">向山顶，提交你的答案 —— swpuacm.xyz</p>
</div>`;
}

class RegPageHandler extends Handler {
    noCheckPermView = true;
    async get() {
        const tab = String(this.args.tab ?? '');
        this.response.body = TABS.includes(tab)
            ? PAGE.replace(BOOT_MARK, `window.__SWPU_BOOT.tab=${JSON.stringify(tab)};`)
            : PAGE;
        this.response.type = 'text/html; charset=utf-8';
        this.response.addHeader('Cache-Control', 'no-store');
    }
}

class RegCodeHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('purpose', Types.String, true)
    async post(domainId: string, mail: string, purpose: string) {
        if (purpose && purpose !== 'reg' && purpose !== 'login') {
            fail(this, '验证码用途不合法。');
            return;
        }
        const mode: CodePurpose = purpose === 'login' ? 'login' : 'reg';
        if (mode === 'reg' && !checkRegistration(this)) return;
        const registered = await UserModel.getByEmail('system', mail);
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
        try {
            if (mode === 'reg') {
                await sendMail(recipient, '【SWPU OJ】注册验证码',
                    `您的验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件。`,
                    mailHtml('你的注册验证码', code, '验证码 5 分钟内有效。如非本人操作，请忽略本邮件。'));
            } else {
                await sendMail(recipient, '【SWPU OJ】登录验证码',
                    `您的登录验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件并建议修改密码。`,
                    mailHtml('你的登录验证码', code, '验证码 5 分钟内有效。如非本人操作，请忽略本邮件并建议尽快修改密码。'));
            }
        } catch (e) {
            await codes.discard(issued);
            logger.error('send code failed:', e instanceof Error ? e.message : String(e));
            this.response.body = { ok: false, message: '验证码邮件发送失败，请稍后再试。' };
            return;
        }
        if (!await codes.activate(issued)) {
            fail(this, '本次验证码已失效，请使用最新邮件中的验证码或重新获取。');
            return;
        }
        this.response.body = { ok: true, message: '验证码已发送，请查收邮箱（5 分钟内有效）。' };
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
    @post('password', Types.Password)
    async post(domainId: string, mail: string, code: string, uname: string, password: string) {
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
            uid = await UserModel.create(recipient, uname, password, undefined, getClientIp(this));
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
        await authAudit(this, 'user.register', uid);
        if (!await loginAs(this, domainId, uid)) {
            const response = this.response.body as { ok: boolean; message: string };
            response.message = `账号已创建，但未能自动登录：${response.message}`;
            return;
        }
        this.response.body = { ok: true, redirect: localRedirect(
            SystemModel.get('swpu.regcode.register_redirect'), DEFAULTS.registerRedirect,
        ) };
    }
}

class CodeLoginHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('code', Types.String)
    async post(domainId: string, mail: string, code: string) {
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
            SystemModel.get('swpu.regcode.login_redirect'), DEFAULTS.loginRedirect,
        ) };
    }
}

export const inject = ['db'];

export async function apply(ctx: Context) {
    const { Setting, SystemSetting } = SettingModel;
    const isPositive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 100000;
    ctx.effect(() => SystemSetting(
        Setting('setting_swpu_regcode', 'limit.regcode_send_ip', DEFAULTS.sendIpHourly, 'number',
            '验证码发送：每 IP 每小时上限', '校园网共用出口默认 200；邮箱仍每 60 秒最多一次。', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_send_global', DEFAULTS.sendGlobalHourly, 'number',
            '验证码发送：全站每小时上限', '请按发件邮箱额度调整，默认 500。', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_verify_ip', DEFAULTS.verifyIpMinute, 'number',
            '验证码校验：每 IP 每分钟上限', '', 0, isPositive),
        Setting('setting_swpu_regcode', 'limit.regcode_verify_account', DEFAULTS.verifyAccountMinute, 'number',
            '验证码校验：每邮箱每分钟上限', '', 0, isPositive),
        Setting('setting_swpu_regcode', 'swpu.regcode.register_redirect', DEFAULTS.registerRedirect, 'text',
            '注册成功跳转路径', '站内路径，如 /training；可填写已有训练路线地址。', 0,
            (value) => localRedirect(value, '') !== ''),
        Setting('setting_swpu_regcode', 'swpu.regcode.login_redirect', DEFAULTS.loginRedirect, 'text',
            '验证码登录成功跳转路径', '仅允许站内路径。', 0, (value) => localRedirect(value, '') !== ''),
    ));
    await codes.ensureIndexes();
    ctx.Route('reg_page', '/reg', RegPageHandler);
    ctx.Route('reg_code', '/reg/code', RegCodeHandler);
    ctx.Route('reg_complete', '/reg/complete', RegCompleteHandler, PRIV.PRIV_REGISTER_USER);
    ctx.Route('code_login', '/reg/login', CodeLoginHandler);
    logger.info('swpu-regcode routes ready: /reg, /reg/code, /reg/complete, /reg/login');
}
