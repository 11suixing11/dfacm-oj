const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginPath = path.resolve(__dirname, '../plugin-swpu-regcode/index.ts');
const compiled = esbuild.buildSync({
    entryPoints: [pluginPath], bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;

class Collection {
    docs = new Map();
    matches(doc, filter) {
        return Object.entries(filter).every(([key, expected]) => {
            const actual = doc[key];
            if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
                return (!('$gt' in expected) || actual > expected.$gt)
                    && (!('$lt' in expected) || actual < expected.$lt);
            }
            return actual === expected;
        });
    }
    find(filter) { return [...this.docs.values()].find((doc) => this.matches(doc, filter)); }
    update(doc, update) {
        Object.assign(doc, structuredClone(update.$set || {}));
        for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
    }
    async createIndex() { return 'expireAt_1'; }
    async updateOne(filter, update, options) {
        let doc = this.find(filter);
        const matchedCount = Number(!!doc);
        if (!doc && options?.upsert) { doc = { _id: filter._id }; this.docs.set(doc._id, doc); }
        if (doc) this.update(doc, update);
        return { matchedCount };
    }
    async findOne(filter) { const doc = this.find(filter); return doc ? structuredClone(doc) : null; }
    async deleteOne(filter) { const doc = this.find(filter); if (doc) this.docs.delete(doc._id); }
    async findOneAndUpdate(filter, update) {
        const doc = this.find(filter);
        if (!doc) return null;
        this.update(doc, update);
        return structuredClone(doc);
    }
    async findOneAndDelete(filter) {
        const doc = this.find(filter);
        if (!doc) return null;
        this.docs.delete(doc._id);
        return structuredClone(doc);
    }
}

async function fixture() {
    const collection = new Collection();
    const users = new Map();
    const events = [], audits = [], mails = [], limits = [], routes = new Map();
    const settings = { 'server.login': true };
    const privilege = { PRIV_USER_PROFILE: 1, PRIV_REGISTER_USER: 8, PRIV_EDIT_SYSTEM: 1024 };
    const normalize = (mail) => {
        const [name, domain] = mail.trim().toLowerCase().split('@');
        return `${name.split('+')[0].replace(/\./g, '')}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
    };
    function user(uid = 42, overrides = {}) {
        const record = {
            _id: uid, mail: 'a.b@school.example', uname: 'student', priv: 1,
            tfa: false, authn: false, ...overrides,
            hasPriv(bit) { return (this.priv & bit) === bit; },
        };
        users.set(uid, record);
        return record;
    }
    class Handler {
        constructor() {
            this.args = {};
            this.response = { body: {}, headers: {}, addHeader: (key, value) => { this.response.headers[key] = value; } };
            this.session = {};
            this.request = { ip: '192.0.2.1', headers: {} };
            this.context = { HydroContext: {} };
            this.ctx = { async serial(event, handler, udoc) { events.push([event, udoc._id]); } };
            this.canRegister = true;
        }
        checkPriv(bit) { if (bit === 8 && !this.canRegister) throw new Error('registration disabled'); }
        async limitRate(...args) { limits.push(args); }
    }
    class UserAlreadyExistError extends Error {}
    const state = { sendMailError: null, createError: null, missingAtFinalLogin: false };
    const stub = {
        BlackListModel: { async get() { return null; } },
        db: { collection() { return collection; } }, Handler,
        Logger: class { info() {} error() {} }, PERM: { PERM_ALL: 123n }, PRIV: privilege,
        post: () => () => {},
        OplogModel: { async log(handler, type, data) { audits.push({ type, data, args: structuredClone(handler.args) }); } },
        SettingModel: { Setting: (...args) => args, SystemSetting: () => () => {} },
        SystemModel: { get(key) { return settings[key]; } },
        Types: { Email: [], String: [], Password: [], Username: [(v) => v.trim(), (v) => v.trim().length >= 3] },
        UserAlreadyExistError,
        UserModel: {
            _handleMailLower: normalize,
            async getByEmail(domain, mail) { return [...users.values()].find((u) => normalize(u.mail) === normalize(mail)) || null; },
            async getByUname(domain, uname) { return [...users.values()].find((u) => u.uname === uname) || null; },
            async getById(domain, uid) { return state.missingAtFinalLogin ? null : users.get(uid); },
            async setById(uid, fields) { Object.assign(users.get(uid), fields); },
            getMulti(filter) { return { project() { return this; }, limit() { return this; }, async next() {
                return [...users.values()].find((u) => u.loginip === filter.loginip && u._id !== filter._id.$ne) || null;
            } }; },
            async create(mail, uname) {
                if (state.createError) throw state.createError;
                return user(50, { mail, uname })._id;
            },
        },
        async sendMail(to, subject, text) {
            if (state.sendMailError) throw state.sendMailError;
            mails.push({ to, subject, code: text.match(/\b\d{6}\b/)[0] });
        },
    };
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => id === 'hydrooj' ? stub : require(id);
    loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({ effect(fn) { fn(); }, Route(name, url, HandlerClass, priv) { routes.set(url, { HandlerClass, priv }); } });
    function handler(url, args = {}) { const h = new (routes.get(url).HandlerClass)(); h.args = args; return h; }
    async function issue(mail, purpose) {
        const h = handler('/reg/code', { mail, purpose });
        await h.post('system', mail, purpose);
        return h;
    }
    return { collection, users, user, handler, issue, routes, events, audits, mails, limits, settings, state, UserAlreadyExistError };
}

test('input alias delivers the login code only to the bound account mailbox', async () => {
    const f = await fixture(); f.user();
    const issued = await f.issue('ab@school.example', 'login');
    assert.equal(issued.response.body.ok, true);
    assert.equal(f.mails[0].to, 'a.b@school.example');
    const login = f.handler('/reg/login', { mail: 'ab@school.example', code: f.mails[0].code });
    await login.post('system', 'ab@school.example', f.mails[0].code);
    assert.equal(login.session.uid, 42);
    assert.deepEqual(f.events, [['auth/before-login', 42], ['auth/login', 42]]);
    assert.equal(f.audits[0].type, 'user.loginSuccess');
    assert.equal('code' in f.audits[0].args, false);
    assert.equal('password' in f.audits[0].args, false);
});

test('registration page uses Hydro addHeader to disable caching', async () => {
    const f = await fixture(); const h = f.handler('/reg'); await h.get();
    assert.equal(h.response.headers['Cache-Control'], 'no-store');
    assert.match(h.response.type, /text\/html/);
});

test('2FA, passkey, disabled accounts and disabled built-in login cannot issue login codes', async () => {
    for (const override of [{ tfa: true }, { authn: true }, { priv: 0 }]) {
        const f = await fixture(); f.user(42, override);
        assert.equal((await f.issue('ab@school.example', 'login')).response.body.ok, false);
        assert.equal(f.mails.length, 0);
    }
    const f = await fixture(); f.user(); f.settings['server.login'] = false;
    assert.equal((await f.issue('ab@school.example', 'login')).response.body.ok, false);
});

test('an account enabling 2FA after issuance cannot use an earlier email code', async () => {
    const f = await fixture(); const user = f.user();
    await f.issue(user.mail, 'login'); user.tfa = true;
    const login = f.handler('/reg/login');
    await login.post('system', user.mail, f.mails[0].code);
    assert.equal(login.response.body.ok, false);
    assert.equal(login.session.uid, undefined);
});

test('registration closure is enforced during both send and completion', async () => {
    const f = await fixture();
    assert.equal(f.routes.get('/reg/complete').priv, 8);
    const send = f.handler('/reg/code'); send.canRegister = false;
    await assert.rejects(send.post('system', 'new@school.example', 'reg'), /registration disabled/);
    const complete = f.handler('/reg/complete'); complete.canRegister = false;
    await assert.rejects(complete.post('system', 'new@school.example', '123456', 'student', 'password'), /registration disabled/);
    assert.equal(f.users.size, 0);
});

test('strict contest mode rejects another account on the same IP', async () => {
    const f = await fixture(); f.user(); f.user(43, { mail: 'other@school.example', loginip: '192.0.2.1' });
    f.settings['system.contestmode'] = 'strict';
    assert.equal((await f.issue('ab@school.example', 'login')).response.body.ok, false);
    assert.equal(f.mails.length, 0);
});

test('SMTP failure leaves no usable code and does not create a session', async () => {
    const f = await fixture(); f.user(); f.state.sendMailError = new Error('smtp unavailable');
    assert.equal((await f.issue('ab@school.example', 'login')).response.body.ok, false);
    assert.equal(f.collection.docs.size, 0);
});

test('registration succeeds with audit, hooks, QQ avatar and configurable local redirect', async () => {
    const f = await fixture(); f.settings['swpu.regcode.register_redirect'] = '/training/team';
    await f.issue('123456@qq.com', 'reg');
    const args = { mail: '123456@qq.com', code: f.mails[0].code, uname: 'newuser', password: 'secret-password' };
    const h = f.handler('/reg/complete', args);
    await h.post('system', args.mail, args.code, args.uname, args.password);
    assert.deepEqual(h.response.body, { ok: true, redirect: '/training/team' });
    assert.equal(h.session.uid, 50);
    assert.equal(f.users.get(50).avatar, 'qq:123456');
    assert.equal(f.collection.docs.size, 0);
    assert.equal(f.audits.length, 2);
    assert.equal(f.audits.every((log) => !('code' in log.args) && !('password' in log.args)), true);
    assert.equal(h.args, args);
});

test('Hydro business duplicate error becomes an actionable JSON response', async () => {
    const f = await fixture(); await f.issue('new@school.example', 'reg');
    f.state.createError = new f.UserAlreadyExistError('duplicate');
    const h = f.handler('/reg/complete');
    await h.post('system', 'new@school.example', f.mails[0].code, 'newuser', 'password');
    assert.equal(h.response.body.ok, false);
    assert.match(h.response.body.message, /重新获取验证码/);
});

test('registration cannot replace the verified delivery address with a normalized alias', async () => {
    const f = await fixture(); await f.issue('a.b@school.example', 'reg');
    const h = f.handler('/reg/complete');
    await h.post('system', 'ab@school.example', f.mails[0].code, 'newuser', 'password');
    assert.equal(h.response.body.ok, false);
    assert.equal(f.users.size, 0);
    await h.post('system', 'a.b@school.example', f.mails[0].code, 'newuser', 'password');
    assert.equal(h.response.body.ok, true);
    assert.equal(f.users.get(50).mail, 'a.b@school.example');
});

test('an account removed during final authentication produces a clear failure without a session', async () => {
    const f = await fixture(); f.user(); await f.issue('ab@school.example', 'login');
    f.state.missingAtFinalLogin = true;
    const h = f.handler('/reg/login');
    await h.post('system', 'ab@school.example', f.mails[0].code);
    assert.equal(h.response.body.ok, false);
    assert.match(h.response.body.message, /账号不存在/);
    assert.equal(h.session.uid, undefined);
});

test('strict contest registration reports account creation separately from blocked automatic login', async () => {
    const f = await fixture(); f.user(43, { mail: 'other@school.example', loginip: '192.0.2.1' });
    f.settings['system.contestmode'] = 'strict';
    await f.issue('new@school.example', 'reg');
    const h = f.handler('/reg/complete');
    await h.post('system', 'new@school.example', f.mails[0].code, 'newuser', 'password');
    assert.equal(h.response.body.ok, false);
    assert.equal(f.users.has(50), true);
    assert.match(h.response.body.message, /账号已创建.*当前 IP 已绑定/);
    assert.equal(h.session.uid, undefined);
});

test('campus IP and site mail ceilings are explicit, while email cooldown uses normalized key', async () => {
    const f = await fixture(); await f.issue('a.b+tag@school.example', 'reg');
    assert.deepEqual(f.limits, [
        ['regcode_send', 60, 1, 'ab@school.example'],
        ['regcode_send_ip', 3600, 200, '{{ip}}'],
        ['regcode_send_global', 3600, 500, 'site'],
    ]);
});
