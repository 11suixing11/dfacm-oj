/* swpu-regcode — 数字验证码注册/登录（SWPU ACM 定制插件）
 * GET  /reg            注册+验证码登录双标签页（读取同目录 reg.html）
 * POST /reg/code       {mail, purpose}  发送 6 位验证码（purpose: reg|login）
 * POST /reg/complete   {mail, code, uname, password}   注册并登录
 * POST /reg/login      {mail, code}     验证码免密登录
 */
import fs from 'fs';
import { join } from 'path';
import {
    BlackListModel, Context, db, Handler, Logger, PERM, post, sendMail, Types, UserModel,
} from 'hydrooj';

const logger = new Logger('swpu-regcode');
const coll = db.collection('regcode');
const PAGE = fs.readFileSync(join(__dirname, 'reg.html'), 'utf-8');

function mailHtml(title: string, code: string, note: string) {
    return `<div style="font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a1322;color:#e8edf5;border-radius:16px">
<div style="font-size:12px;letter-spacing:4px;color:#c9a227;margin-bottom:12px">SWPU ACM · TRAINING GROUND</div>
<h2 style="font-size:20px;margin:0 0 18px;color:#e8edf5">${title}</h2>
<div style="font-size:38px;font-weight:700;letter-spacing:12px;color:#e9c455;font-family:Consolas,monospace;margin:18px 0">${code}</div>
<p style="color:#a7b4c7;font-size:14px;margin:6px 0">${note}</p>
<p style="color:#66748c;font-size:12px;margin-top:24px">向山顶，提交你的答案 —— swpuacm.xyz</p>
</div>`;
}

async function issueCode(mail: string, purpose: 'reg' | 'login') {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await coll.updateOne(
        { _id: mail.toLowerCase() },
        { $set: { code, purpose, expireAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 } },
        { upsert: true },
    );
    return code;
}

class RegPageHandler extends Handler {
    noCheckPermView = true;
    async get() {
        this.response.body = PAGE;
        this.response.type = 'text/html; charset=utf-8';
    }
}

class RegCodeHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('purpose', Types.String, true)
    async post(domainId: string, mail: string, purpose: string) {
        const mode = purpose === 'login' ? 'login' : 'reg';
        const registered = await UserModel.getByEmail('system', mail);
        if (mode === 'reg' && registered) {
            this.response.body = { ok: false, message: '该邮箱已注册过账号，请直接登录或找回密码。' };
            return;
        }
        if (mode === 'login' && !registered) {
            this.response.body = { ok: false, message: '该邮箱未注册，请先注册账号。' };
            return;
        }
        const mailDomain = mail.split('@')[1];
        if (await BlackListModel.get(`mail::${mailDomain}`)) {
            this.response.body = { ok: false, message: '该邮箱域名暂不支持。' };
            return;
        }
        await this.limitRate('regcode_send', 60, 1, mail);
        await this.limitRate('regcode_send_ip', 3600, 20);
        const code = await issueCode(mail, mode);
        try {
            if (mode === 'reg') {
                await sendMail(mail, '【SWPU OJ】注册验证码',
                    `您的验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件。`,
                    mailHtml('你的注册验证码', code, '验证码 5 分钟内有效。如非本人操作，请忽略本邮件。'));
            } else {
                await sendMail(mail, '【SWPU OJ】登录验证码',
                    `您的登录验证码是 ${code}，5 分钟内有效。如非本人操作请忽略本邮件并建议修改密码。`,
                    mailHtml('你的登录验证码', code, '验证码 5 分钟内有效。如非本人操作，请忽略本邮件并建议尽快修改密码。'));
            }
        } catch (e) {
            await coll.deleteOne({ _id: mail.toLowerCase() });
            logger.error('send code failed:', e.message);
            this.response.body = { ok: false, message: '验证码邮件发送失败，请稍后再试。' };
            return;
        }
        this.response.body = { ok: true, message: '验证码已发送，请查收邮箱（5 分钟内有效）。' };
    }
}

async function checkCode(mail: string, code: string) {
    const key = mail.toLowerCase();
    const doc = await coll.findOne({ _id: key });
    if (!doc) return { fail: '请先获取验证码。' };
    if (doc.attempts >= 5) {
        await coll.deleteOne({ _id: key });
        return { fail: '尝试次数过多，请重新获取验证码。' };
    }
    if (String(doc.code) !== String(code).trim()) {
        await coll.updateOne({ _id: key }, { $inc: { attempts: 1 } });
        return { fail: '验证码错误，请重试。' };
    }
    return {};
}

async function loginAs(handler: Handler, domainId: string, uid: number) {
    const udoc = await UserModel.getById(domainId, uid);
    await UserModel.setById(uid, { loginat: new Date(), loginip: handler.request.ip });
    handler.context.HydroContext.user = udoc;
    handler.session.uid = udoc._id;
    handler.session.sudo = null;
    handler.session.sudoUid = null;
    handler.session.scope = PERM.PERM_ALL.toString();
    handler.session.oauthBind = null;
    handler.session.recreate = true;
}

class RegCompleteHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('code', Types.String)
    @post('uname', Types.String)
    @post('password', Types.Password)
    async post(domainId: string, mail: string, code: string, uname: string, password: string) {
        const key = mail.toLowerCase();
        const chk = await checkCode(mail, code);
        if (chk.fail) {
            this.response.body = { ok: false, message: chk.fail };
            return;
        }
        if (await UserModel.getByEmail('system', mail)) {
            this.response.body = { ok: false, message: '该邮箱已注册过账号，请直接登录。' };
            return;
        }
        if (!Types.Username[1](uname)) {
            this.response.body = { ok: false, message: '用户名不合法：2–16 位，支持中文、字母、数字、下划线。' };
            return;
        }
        let uid: number;
        try {
            uid = await UserModel.create(mail, uname, password, undefined, this.request.ip);
        } catch (e) {
            if (e.code === 11000) {
                this.response.body = { ok: false, message: '用户名已被占用，换一个试试。' };
                return;
            }
            throw e;
        }
        const [id, mailDomain] = mail.split('@');
        const $set: any = {};
        if (mailDomain === 'qq.com' && !Number.isNaN(+id)) {
            $set.avatar = `qq:${id}`;
            $set.qq = `${id}`;
        }
        if (Object.keys($set).length) await UserModel.setById(uid, $set);
        await coll.deleteOne({ _id: key });
        await loginAs(this, domainId, uid);
        this.response.body = { ok: true, redirect: '/training/6abf5251aaa235606eedfb84' };
    }
}

class CodeLoginHandler extends Handler {
    noCheckPermView = true;
    @post('mail', Types.Email)
    @post('code', Types.String)
    async post(domainId: string, mail: string, code: string) {
        const key = mail.toLowerCase();
        const udoc = await UserModel.getByEmail('system', mail);
        if (!udoc) {
            this.response.body = { ok: false, message: '该邮箱未注册，请先注册账号。' };
            return;
        }
        const chk = await checkCode(mail, code);
        if (chk.fail) {
            this.response.body = { ok: false, message: chk.fail };
            return;
        }
        await coll.deleteOne({ _id: key });
        await loginAs(this, domainId, udoc._id);
        this.response.body = { ok: true, redirect: '/' };
    }
}

export async function apply(ctx: Context) {
    await coll.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    ctx.Route('reg_page', '/reg', RegPageHandler);
    ctx.Route('reg_code', '/reg/code', RegCodeHandler);
    ctx.Route('reg_complete', '/reg/complete', RegCompleteHandler);
    ctx.Route('code_login', '/reg/login', CodeLoginHandler);
    logger.info('swpu-regcode routes ready: /reg, /reg/code, /reg/complete, /reg/login');
}
