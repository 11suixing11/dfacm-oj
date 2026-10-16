const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'reg.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

// Run the shipped page scripts, replacing only DOM, navigation, network and timers.
// No credentials, emails or requests ever leave this fixture.
function page({
    returnTo = '', embed = false, response, responses, fetchError,
    oauth = [], oauthDoc = null, csrf = 'a'.repeat(64), boot = {},
} = {}) {
    const elements = new Map(), requests = [], messages = [], timers = new Map();
    let timerId = 0, responseIndex = 0;
    const responseQueue = Array.isArray(responses) ? [...responses] : [];
    class Element {
        constructor() {
            this.value = ''; this.textContent = ''; this.children = []; this.attrs = {};
            this.hidden = false; this.disabled = false; this.checked = false;
            this.events = {}; this.classList = { toggle() {} };
        }
        setAttribute(name, value) { this.attrs[name] = String(value); }
        getAttribute(name) { return this.attrs[name] ?? null; }
        removeAttribute(name) { delete this.attrs[name]; }
        addEventListener(name, callback) { this.events[name] = callback; }
        appendChild(child) { this.children.push(child); }
        querySelectorAll() { return []; }
        focus() {}
        remove() {}
    }
    class XmlNode {
        constructor(nodeName, attrs = {}) {
            this.nodeName = nodeName; this.attrs = { ...attrs }; this.parentNode = null;
        }
        get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
        getElementsByTagName() { return []; }
        getAttribute(name) { return this.attrs[name] ?? null; }
        removeAttribute(name) { delete this.attrs[name]; }
        querySelector() { return null; }
    }
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const element = new Element();
        for (const attr of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
        if (/\shidden(?=[\s>])/.test(match[0])) element.hidden = true;
        elements.set(match[1], element);
    }
    const location = new Proxy(new URL('https://oj.example/reg' + (returnTo ? '?return=' + encodeURIComponent(returnTo) : '')), {
        get: (url, key) => { const value = Reflect.get(url, key, url); return typeof value === 'function' ? value.bind(url) : value; },
        set: (url, key, value) => Reflect.set(url, key, key === 'href' ? new URL(value, url).href : value, url),
    });
    const document = {
        getElementById: (id) => elements.get(id),
        querySelectorAll: () => [],
        createElement: () => new Element(),
        importNode: (node) => node,
        body: new Element(),
    };
    class DOMParserStub {
        parseFromString() {
            if (!oauthDoc) throw new Error('no icon document configured for this fixture');
            return oauthDoc;
        }
    }
    const window = {};
    window.self = window; window.top = embed ? {} : window;
    const context = vm.createContext({
        window, document, location, URL, URLSearchParams, AbortController, DOMParser: DOMParserStub,
        parent: { postMessage: (data, origin) => messages.push({ data, origin }) },
        history: { replaceState: (_, __, url) => { location.href = new URL(url, location).href; } },
        setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: (id) => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (fetchError) throw fetchError;
            const queued = responseQueue.shift();
            const chosen = queued || response || { ok: true, status: 200, redirected: true, url: 'https://oj.example/', json: async () => ({ ok: true, redirect: '/training' }) };
            responseIndex += 1;
            return chosen;
        },
    });
    vm.runInContext(scripts[0], context);
    window.__SWPU_BOOT.oauth = oauth;
    window.__SWPU_BOOT.csrf = csrf;
    window.__SWPU_BOOT.tab = boot.tab ?? null;
    window.__SWPU_BOOT.canPwd = boot.canPwd ?? false;
    for (const script of scripts.slice(1)) vm.runInContext(script, context);
    async function submit(form) {
        await elements.get(form).events.submit({ preventDefault() {} });
    }
    async function click(id) {
        await elements.get(id).events.click({ preventDefault() {} });
    }
    function credentials() {
        elements.get('p-uname').value = 'fixture-student';
        elements.get('p-pw').value = 'fixture-password';
    }
    return { elements, requests, messages, location, timers, submit, click, credentials, XmlNode, Element };
}

// ---- 单流无密码 UI ----

test('the flow asks for an email and posts it with purpose auto and the CSRF token', async () => {
    const p = page({ csrf: 'b'.repeat(64) });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    assert.equal(p.requests.length, 1);
    assert.equal(p.requests[0].url, '/reg/code');
    const body = new URLSearchParams(p.requests[0].options.body);
    assert.equal(body.get('mail'), 'fixture@example.com');
    assert.equal(body.get('purpose'), 'auto');
    assert.equal(body.get('csrf'), 'b'.repeat(64));
});

test('an unregistered address reveals the username step and completes without any password', async () => {
    const p = page({
        responses: [
            { ok: true, status: 200, json: async () => ({ ok: true, registered: false, message: '验证码已发送' }) },
            { ok: true, status: 200, json: async () => ({ ok: true, redirect: '/training' }) },
        ],
    });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    assert.equal(p.elements.get('m-code-field').hidden, false);
    assert.equal(p.elements.get('m-uname-field').hidden, false);
    assert.equal(p.elements.get('m-go').textContent, '创建账号，开始登顶');
    p.elements.get('m-code').value = '123456';
    p.elements.get('m-uname').value = 'fixture-student';
    await p.submit('f-flow');
    assert.equal(p.requests[1].url, '/reg/complete');
    const body = new URLSearchParams(p.requests[1].options.body);
    assert.equal(body.get('uname'), 'fixture-student');
    assert.equal(body.get('password'), null, 'passwordless registration never sends a password');
    assert.equal(body.get('csrf'), 'a'.repeat(64));
    assert.equal(p.location.pathname, '/training');
});

test('a registered address goes straight to the code and logs in without a username', async () => {
    const p = page({
        responses: [
            { ok: true, status: 200, json: async () => ({ ok: true, registered: true, message: '验证码已发送' }) },
            { ok: true, status: 200, json: async () => ({ ok: true, redirect: '/' }) },
        ],
    });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    assert.equal(p.elements.get('m-uname-field').hidden, true);
    assert.equal(p.elements.get('m-go').textContent, '登录');
    p.elements.get('m-code').value = '123456';
    await p.submit('f-flow');
    assert.equal(p.requests[1].url, '/reg/login');
    const body = new URLSearchParams(p.requests[1].options.body);
    assert.equal(body.get('uname'), null);
    assert.equal(p.location.href, 'https://oj.example/');
});

test('external and auth-loop return paths are sanitized for both the login and the register arm', async () => {
    for (const registered of [true, false]) {
        const p = page({
            embed: true,
            responses: [
                { ok: true, status: 200, json: async () => ({ ok: true, registered }) },
                { ok: true, status: 200, json: async () => ({ ok: true, redirect: '/\\example.invalid' }) },
            ],
        });
        p.elements.get('m-mail').value = 'fixture@example.com';
        await p.click('m-next');
        p.elements.get('m-code').value = '123456';
        if (!registered) p.elements.get('m-uname').value = 'fixture-student';
        await p.submit('f-flow');
        assert.equal(p.messages.length, 1, `registered=${registered}`);
        assert.equal(p.messages[0].data.return, '/');
        assert.equal(p.messages[0].origin, 'https://oj.example');
    }
    for (const returnTo of ['//example.invalid/path', '/login?fallback=1', '/reg?tab=pwd', 'https://example.invalid']) {
        const p = page({
            returnTo,
            responses: [
                { ok: true, status: 200, json: async () => ({ ok: true, registered: true }) },
                { ok: true, status: 200, json: async () => ({ ok: true, redirect: '/training' }) },
            ],
        });
        p.elements.get('m-mail').value = 'fixture@example.com';
        await p.click('m-next');
        p.elements.get('m-code').value = '123456';
        await p.submit('f-flow');
        assert.equal(p.location.href, 'https://oj.example/training', returnTo);
    }
});

test('a code-send failure re-enables the button and keeps the flow on the email step', async () => {
    const p = page({ response: { ok: false, status: 200, json: async () => ({ ok: false, message: '稍后再试' }) } });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    assert.equal(p.elements.get('m-next').disabled, false);
    assert.equal(p.elements.get('m-next').textContent, '获取验证码');
    assert.equal(p.elements.get('m-code-field').hidden, true);
    assert.match(p.elements.get('m-msg').textContent, /稍后再试/);
});

test('submit failures explain the reason, keep inputs and re-enable the button', async () => {
    const p = page({
        responses: [
            { ok: true, status: 200, json: async () => ({ ok: true, registered: true }) },
            { ok: false, status: 200, json: async () => ({ ok: false, message: '验证码错误，请重试。' }) },
        ],
    });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    p.elements.get('m-code').value = '123456';
    await p.submit('f-flow');
    assert.match(p.elements.get('m-msg').textContent, /验证码错误/);
    assert.equal(p.elements.get('m-go').disabled, false);
    assert.equal(p.elements.get('m-code').value, '123456');
});

test('a malformed email never leaves the browser', async () => {
    const p = page();
    p.elements.get('m-mail').value = 'not-an-email';
    await p.click('m-next');
    assert.equal(p.requests.length, 0);
    assert.equal(p.elements.get('m-mail').getAttribute('aria-invalid'), 'true');
});

test('an empty username is caught before a registration request leaves', async () => {
    const p = page({
        responses: [
            { ok: true, status: 200, json: async () => ({ ok: true, registered: false }) },
        ],
    });
    p.elements.get('m-mail').value = 'fixture@example.com';
    await p.click('m-next');
    p.elements.get('m-code').value = '123456';
    await p.submit('f-flow');
    assert.equal(p.requests.length, 1, 'only the code request may have been sent');
    assert.equal(p.elements.get('m-uname').getAttribute('aria-invalid'), 'true');
});

// ---- 管理员 break-glass：f-pwd（boot.canPwd + tab=pwd 才是可见通道，但本组
// 用例只验证已渲染表单的行为，可见性由 handlers.test 的服务端门控覆盖）----

test('password login rejects external, backslash, control and auth-loop return paths', async () => {
    for (const returnTo of ['//example.invalid/path', '/\\example.invalid/path', 'https://example.invalid', '/\nevil', '/\tevil', '/login?fallback=1', '/reg?tab=pwd']) {
        const p = page({ boot: { canPwd: true, tab: 'pwd' }, returnTo }); p.credentials();
        await p.submit('f-pwd');
        const body = new URLSearchParams(p.requests[0].options.body);
        assert.equal(body.get('redirect'), '/', returnTo);
        assert.equal(p.location.href, 'https://oj.example/');
        assert.equal(p.timers.size, 0);
    }
});

test('safe return and remember-me survive password login and native login handoff', async () => {
    const returnTo = '/p/100?lang=cpp#submit';
    const p = page({ boot: { canPwd: true, tab: 'pwd' }, returnTo }); p.credentials();
    p.elements.get('p-remember').checked = true;
    const native = p.elements.get('native-login');
    assert.equal(native.getAttribute('target'), '_top');
    assert.equal(new URL(native.href, p.location).searchParams.get('redirect'), returnTo);
    await p.submit('f-pwd');
    const body = new URLSearchParams(p.requests[0].options.body);
    assert.equal(body.get('redirect'), returnTo);
    assert.equal(body.get('rememberme'), '1');
    assert.equal(p.location.href, 'https://oj.example' + returnTo);
});

test('a successful HTML page without a redirect is not treated as successful login', async () => {
    const p = page({ boot: { canPwd: true, tab: 'pwd' }, response: { ok: true, status: 200, redirected: false } }); p.credentials();
    await p.submit('f-pwd');
    assert.equal(p.location.pathname, '/reg');
    assert.match(p.elements.get('p-msg').textContent, /未能确认登录成功/);
    assert.equal(p.elements.get('p-go').disabled, false);
});

test('login failures preserve inputs, explain recovery and re-enable submission', async () => {
    for (const [status, expected] of [[403, /请检查账号密码/], [429, /频繁/], [503, /暂时不可用/]]) {
        const p = page({ boot: { canPwd: true, tab: 'pwd' }, response: { ok: false, status } }); p.credentials();
        await p.submit('f-pwd');
        assert.match(p.elements.get('p-msg').textContent, expected);
        assert.equal(p.elements.get('p-pw').value, 'fixture-password');
        assert.equal(p.elements.get('p-go').disabled, false);
        assert.equal(p.elements.get('f-pwd').getAttribute('aria-busy'), null);
        assert.equal(p.timers.size, 0);
    }
    for (const name of ['AbortError', 'TypeError']) {
        const p = page({ boot: { canPwd: true, tab: 'pwd' }, fetchError: Object.assign(new Error('fixture'), { name }) }); p.credentials();
        await p.submit('f-pwd');
        assert.match(p.elements.get('p-msg').textContent, name === 'AbortError' ? /超时/ : /网络连接失败/);
        assert.equal(p.elements.get('p-go').disabled, false);
    }
});

// ---- OAuth 与找回密码 ----

test('OAuth and password recovery leave the iframe and preserve only safe return paths', () => {
    const p = page({ embed: true, returnTo: '/training', oauth: [{ id: 'github', text: 'GitHub', icon: '<svg></svg>' }] });
    const oauth = p.elements.get('oauth-list').children[0];
    assert.equal(oauth.target, '_top');
    assert.equal(new URL(oauth.href, p.location).searchParams.get('redirect'), '/training');
    assert.match(html, /<a href="\/lostpass" target="_top">/);
});

test('OAuth provider markup is parsed and sanitized, and the label is never parsed as HTML', () => {
    const { XmlNode } = page();
    const script = new XmlNode('script');
    const onload = new XmlNode('image', { onload: 'alert(1)', href: 'javascript:alert(2)', alt: 'keep me' });
    const detached = [];
    script.parentNode = { removeChild: (n) => detached.push(n.nodeName) };
    const root = new XmlNode('svg');
    root.getElementsByTagName = () => [script, onload];
    const oauthDoc = { documentElement: root, querySelector: () => null };
    const q = page({ oauth: [{ id: 'evil', text: '<img src=x onerror=alert(1)>', icon: '<svg/>' }], oauthDoc });

    const anchor = q.elements.get('oauth-list').children[0];
    assert.deepEqual(detached, ['script']);
    assert.equal(onload.getAttribute('onload'), null);
    assert.equal(onload.getAttribute('href'), null);
    assert.equal(onload.getAttribute('alt'), 'keep me', 'inert attributes survive');
    assert.equal(anchor.children[0], root);
    const label = anchor.children[1];
    assert.equal(label.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(label.innerHTML, undefined);

    assert.doesNotMatch(html, /innerHTML\s*=\s*p\./);
    assert.doesNotMatch(html, /innerHTML\s*=\s*providers/);
});
