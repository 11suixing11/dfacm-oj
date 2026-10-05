const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const pluginPath = path.resolve(__dirname, 'index.ts');
const BOOT_MARK = '/*__SWPU_BOOT__*/';
// Bundle with the local esbuild devDependency so `hydrooj` can be stubbed below.
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
    const events = [], audits = [], mails = [], limits = [], joins = [], routes = new Map();
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
    // One session object shared by every handler, standing in for Hydro's
// cookie-backed session: a token minted while rendering /reg must be visible to
// the POST handlers, and loginAs must write uid where a later handler reads it.
const session = {};
class Handler {
        constructor() {
            this.args = {};
            this.response = { body: {}, headers: {}, addHeader: (key, value) => { this.response.headers[key] = value; } };
            this.session = session;
            this.request = { ip: '192.0.2.1', headers: {} };
            this.context = { HydroContext: {} };
            this.ctx = { async serial(event, handler, udoc) { events.push([event, udoc._id]); } };
            this.canRegister = true;
        }
        checkPriv(bit) { if (bit === 8 && !this.canRegister) throw new Error('registration disabled'); }
        async limitRate(...args) { limits.push(args); }
    }
    class UserAlreadyExistError extends Error {}
    const state = { sendMailError: null, createError: null, missingAtFinalLogin: false, loginMethods: null };
    const stub = {
        BlackListModel: { async get() { return null; } },
        db: { collection() { return collection; } },
        DomainModel: { async setUserRole(domainId, uid, role, autojoin) { joins.push({ domainId, uid, role, autojoin }); } },
        Handler,
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
        async sendMail(to, subject, text, html) {
            if (state.sendMailError) throw state.sendMailError;
            mails.push({ to, subject, text, html, code: text.match(/\b\d{6}\b/)[0] });
        },
    };
    const loaded = new Module(pluginPath, module);
    loaded.filename = pluginPath;
    loaded.paths = module.paths;
    loaded.require = (id) => id === 'hydrooj' ? stub : require(id);
    loaded._compile(compiled, pluginPath);
    await loaded.exports.apply({ effect(fn) { fn(); }, Route(name, url, HandlerClass, priv) { routes.set(url, { HandlerClass, priv }); } });
    function handler(url, args = {}) { const h = new (routes.get(url).HandlerClass)(); h.args = args; h.loginMethods = state.loginMethods; return h; }
    // Renders /reg and returns the CSRF token it injected, the way a browser
    // obtains one before posting.
    async function csrf() {
        const page = handler('/reg');
        await page.get();
        const match = /__SWPU_BOOT\.csrf="([0-9a-f]{64})"/.exec(String(page.response.body));
        if (!match) throw new Error('no CSRF token injected into /reg');
        return match[1];
    }
    async function issue(mail, purpose, token) {
        const h = handler('/reg/code', { mail, purpose });
        await h.post('system', mail, purpose);
        return h;
    }
    return { collection, users, user, handler, issue, csrf, session, routes, events, audits, mails, limits, joins, settings, state, UserAlreadyExistError };
}

test('input alias delivers the login code only to the bound account mailbox', async () => {
    const f = await fixture(); f.user();
    const issued = await f.issue('ab@school.example', 'login');
    assert.equal(issued.response.body.ok, true);
    assert.equal(f.mails[0].to, 'a.b@school.example');
    const token = await f.csrf();
    const login = f.handler('/reg/login', { mail: 'ab@school.example', code: f.mails[0].code });
    await login.post('system', 'ab@school.example', f.mails[0].code, token);
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

test('registration page and verification mail carry the d&f identity and final meaning', async () => {
    const f = await fixture();
    const page = f.handler('/reg'); await page.get();
    const body = String(page.response.body);
    assert.match(body, /<title>注册 \/ 登录 · d&amp;f算法网<\/title>/);
    assert.match(body, /欢迎来到 d&amp;f算法网。每个人都能在算法竞赛这条路上找到属于自己的 final。/);
    assert.doesNotMatch(body, /DFACM OJ|SWPU ACM|西南石油大学|swpuacm\.xyz/);

    await f.issue('new@example.com', 'reg');
    assert.equal(f.mails[0].subject, '【d&f算法网】注册验证码');
    assert.match(f.mails[0].html, /d&amp;f算法网 · ONLINE JUDGE/);
    assert.match(f.mails[0].html, /每个人都能在算法竞赛这条路上找到属于自己的 final/);
    assert.doesNotMatch(f.mails[0].html, /DFACM OJ|SWPU ACM|西南石油大学|swpuacm\.xyz/);

    const login = await fixture(); login.user();
    await login.issue('a.b@school.example', 'login');
    assert.equal(login.mails[0].subject, '【d&f算法网】登录验证码');
    assert.match(login.mails[0].html, /d&amp;f算法网 · ONLINE JUDGE/);
    assert.match(login.mails[0].html, /每个人都能在算法竞赛这条路上找到属于自己的 final/);
});

test('registration page boots the initial tab from merged query args', async () => {
    const f = await fixture();
    const pwd = f.handler('/reg', { tab: 'pwd' }); await pwd.get();
    assert.match(String(pwd.response.body), /__SWPU_BOOT\.tab="pwd"/);
    // Bare /register rewrite arrives without a tab: page must stay unmodified.
    const bare = f.handler('/reg'); await bare.get();
    assert.equal(String(bare.response.body).includes('__SWPU_BOOT.tab='), false);
    // Anything outside the tab whitelist is never injected.
    const evil = f.handler('/reg', { tab: 'javascript:alert(1)' }); await evil.get();
    assert.equal(String(evil.response.body).includes('__SWPU_BOOT.tab='), false);
    // The in-place auth modal requests the embedded variant.
    const embed = f.handler('/reg', { tab: 'pwd', embed: '1' }); await embed.get();
    assert.match(String(embed.response.body), /__SWPU_BOOT\.embed=true/);
    assert.match(String(embed.response.body), /a\.target='_top'/);
    const plain = f.handler('/reg', { tab: 'pwd' }); await plain.get();
    assert.equal(String(plain.response.body).includes('__SWPU_BOOT.embed='), false);
});

test('registration page renders third-party login methods from handler.loginMethods', async () => {
    const f = await fixture();
    f.state.loginMethods = [{ id: 'github', text: 'Login with GitHub', icon: '<svg/>' }];
    const h = f.handler('/reg'); await h.get();
    assert.match(String(h.response.body), /__SWPU_BOOT\.oauth=\[\{"id":"github"/);
    // Malformed entries are dropped, not injected.
    f.state.loginMethods = [{ id: 'github', text: 'x', icon: 123 }, null, { id: 'weibo' }];
    const h2 = f.handler('/reg'); await h2.get();
    assert.equal(String(h2.response.body).includes('__SWPU_BOOT.oauth='), false);
    // Unknown icon strings are fine but a missing text is not.
    f.state.loginMethods = [{ id: 'weibo', text: '微博登录', icon: '<svg/>' }];
    const h3 = f.handler('/reg'); await h3.get();
    assert.match(String(h3.response.body), /__SWPU_BOOT\.oauth=\[\{"id":"weibo","text":"微博登录"/);
});

test('boot injection does not expand replacement patterns from provider text', async () => {
    const f = await fixture();
    // A string replacement would expand $&/$\`/$'/$$ inside this JSON, splicing
    // the rest of reg.html into the inline <script>.
    f.state.loginMethods = [{ id: 'x', text: "$` $' $& $1 $$ $&", icon: '<svg/>' }];
    const h = f.handler('/reg'); await h.get();
    const body = String(h.response.body);
    assert.match(body, /__SWPU_BOOT\.oauth=\[\{"id":"x","text":"\$` \$' \$& \$1 \$\$ \$&"/);
    // The template must not be duplicated into the boot payload.
    const oauthLine = body.split('\n').find((l) => l.includes('__SWPU_BOOT.oauth='));
    assert.equal(oauthLine.includes('<!DOCTYPE'), false);
    assert.equal(oauthLine.includes('</html>'), false);
    // Still exactly one copy of the document.
    assert.equal(body.match(/<\/html>/g).length, 1);
    assert.equal(body.includes(BOOT_MARK), false);
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
    const token = await f.csrf();
    const complete = f.handler('/reg/complete'); complete.canRegister = false;
    await assert.rejects(complete.post('system', 'new@school.example', '123456', 'student', 'password', token), /registration disabled/);
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
    await h.post('system', args.mail, args.code, args.uname, args.password, await f.csrf());
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
    await h.post('system', 'new@school.example', f.mails[0].code, 'newuser', 'password', await f.csrf());
    assert.equal(h.response.body.ok, false);
    assert.match(h.response.body.message, /重新获取验证码/);
});

test('registration cannot replace the verified delivery address with a normalized alias', async () => {
    const f = await fixture(); await f.issue('a.b@school.example', 'reg');
    const token = await f.csrf();
    const h = f.handler('/reg/complete');
    await h.post('system', 'ab@school.example', f.mails[0].code, 'newuser', 'password', token);
    assert.equal(h.response.body.ok, false);
    assert.equal(f.users.size, 0);
    await h.post('system', 'a.b@school.example', f.mails[0].code, 'newuser', 'password', token);
    assert.equal(h.response.body.ok, true);
    assert.equal(f.users.get(50).mail, 'a.b@school.example');
});

test('an account removed during final authentication produces a clear failure without a session', async () => {
    const f = await fixture(); f.user(); await f.issue('ab@school.example', 'login');
    f.state.missingAtFinalLogin = true;
    const h = f.handler('/reg/login');
    await h.post('system', 'ab@school.example', f.mails[0].code, await f.csrf());
    assert.equal(h.response.body.ok, false);
    assert.match(h.response.body.message, /账号不存在/);
    assert.equal(h.session.uid, undefined);
});

test('strict contest registration reports account creation separately from blocked automatic login', async () => {
    const f = await fixture(); f.user(43, { mail: 'other@school.example', loginip: '192.0.2.1' });
    f.settings['system.contestmode'] = 'strict';
    await f.issue('new@school.example', 'reg');
    const h = f.handler('/reg/complete');
    await h.post('system', 'new@school.example', f.mails[0].code, 'newuser', 'password', await f.csrf());
    assert.equal(h.response.body.ok, false);
    assert.equal(f.users.has(50), true);
    assert.match(h.response.body.message, /账号已创建.*当前 IP 已绑定/);
    assert.equal(h.session.uid, undefined);
});

test('campus IP and site mail ceilings are explicit, while email cooldown uses normalized key', async () => {
    const f = await fixture(); await f.issue('a.b+tag@school.example', 'reg');
    assert.deepEqual(f.limits, [
        // Existence probes are throttled before the lookup, not after.
        ['regcode_probe_ip', 3600, 200, '192.0.2.1'],
        ['regcode_probe_mail', 3600, 200, 'ab@school.example'],
        ['regcode_send', 60, 1, 'ab@school.example'],
        ['regcode_send_ip', 3600, 200, '192.0.2.1'],
        ['regcode_send_global', 3600, 500, 'site'],
    ]);
});

// /reg/code and /reg/login both answer differently for a registered vs an
// unregistered address, so the lookup must sit behind a throttle.
test('an exhausted probe budget hides whether an address is registered', async () => {
    for (const [url, purpose] of [['/reg/code', 'reg'], ['/reg/code', 'login'], ['/reg/login', 'verify']]) {
        const f = await fixture(); f.user(42);
        const h = f.handler(url);
        // Simulate an exhausted probe budget: limitRate throws, as Hydro's does.
        h.limitRate = async (action) => {
            if (action.startsWith('regcode_probe')) { const e = new Error('Rate limit exceeded'); e.status = 429; throw e; }
        };
        try {
            if (purpose === 'verify') await h.post('system', 'ab@school.example', '000000');
            else await h.post('system', 'ab@school.example', purpose);
        } catch (e) { assert.equal(e.status, 429); }
        // The generic throttle error must replace the existence verdict.
        assert.doesNotMatch(JSON.stringify(h.response.body || {}), /已注册|未注册/);
        assert.equal(f.mails.length, 0);
    }
});

// /reg/complete creates an account and /reg/login establishes a session; both
// were reachable with nothing but the visitor's cookie.
test('account creation and passwordless login reject a missing or wrong CSRF token', async () => {
    for (const [label, url, args] of [
        ['complete without a token', '/reg/complete', ['system', 'new@school.example', '123456', 'newuser', 'password']],
        ['complete with a wrong token', '/reg/complete', ['system', 'new@school.example', '123456', 'newuser', 'password', 'f'.repeat(64)]],
        ['complete with a truncated token', '/reg/complete', ['system', 'new@school.example', '123456', 'newuser', 'password', 'abc']],
        ['login without a token', '/reg/login', ['system', 'ab@school.example', '123456']],
        ['login with a wrong token', '/reg/login', ['system', 'ab@school.example', '123456', '0'.repeat(64)]],
    ]) {
        const f = await fixture();
        await f.csrf(); // mint a legitimate token so only the submitted value is wrong
        await f.issue('new@school.example', 'reg');
        const h = f.handler(url);
        await h.post(...args);
        assert.equal(h.response.body.ok, false, label);
        assert.match(h.response.body.message, /会话已过期/, label);
        assert.equal(f.users.size, 0, `${label}: no account may be created`);
        assert.equal(f.session.uid, undefined, `${label}: no session may be established`);
    }
});

// Sending a code has no session to protect and no account to create, so it stays
// reachable without a token — otherwise a first-time visitor could never start.
test('sending a login code does not require a CSRF token', async () => {
    const f = await fixture(); f.user(42);
    const issued = await f.issue('ab@school.example', 'login');
    assert.equal(issued.response.body.ok, true);
    assert.equal(f.mails.length, 1);
});

test('the injected CSRF token is per-session and stable across renders', async () => {
    const f = await fixture();
    const first = await f.csrf();
    const second = await f.csrf();
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, second, 'a reload must not invalidate the token the page already holds');
    // A different session gets a different token.
    const other = await fixture();
    assert.notEqual(await other.csrf(), first);
});

test('loopback proxy peer falls back to X-Forwarded-For for limits and login records', async () => {
    const f = await fixture(); const user = f.user();
    const send = f.handler('/reg/code');
    send.request = { ip: '127.0.0.1', headers: { 'x-forwarded-for': '198.51.100.9, 10.0.0.1' } };
    await send.post('system', 'ab@school.example', 'login');
    assert.equal(send.response.body.ok, true);
    assert.deepEqual(f.limits[3], ['regcode_send_ip', 3600, 200, '198.51.100.9']);
    const login = f.handler('/reg/login');
    login.request = { ip: '127.0.0.1', headers: { 'x-forwarded-for': '198.51.100.9' } };
    await login.post('system', 'ab@school.example', f.mails[0].code, await f.csrf());
    assert.equal(login.session.uid, user._id);
    assert.equal(f.users.get(user._id).loginip, '198.51.100.9');
});

test('registration auto-joins the ranking domains with the default role', async () => {
    const f = await fixture();
    await f.issue('123456@qq.com', 'reg');
    const args = { mail: '123456@qq.com', code: f.mails[0].code, uname: 'newuser', password: 'secret-password' };
    const h = f.handler('/reg/complete', args);
    await h.post('system', args.mail, args.code, args.uname, args.password, await f.csrf());
    assert.equal(h.response.body.ok, true);
    // Hydro ranks only dudocs with join=true; both the system domain and the POJ
    // mirror must be joined with the default role, or the new member never ranks.
    assert.deepEqual(f.joins, [
        { domainId: 'system', uid: 50, role: 'default', autojoin: true },
        { domainId: 'poj', uid: 50, role: 'default', autojoin: true },
    ]);
});
