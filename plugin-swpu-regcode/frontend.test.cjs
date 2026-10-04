const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'reg.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

// Run the shipped page scripts, replacing only DOM, navigation, network and timers.
// No credentials, emails or requests ever leave this fixture.
function page({ returnTo = '', embed = false, response, fetchError, oauth = [], oauthDoc = null } = {}) {
    const elements = new Map(), requests = [], messages = [], timers = new Map();
    let timerId = 0;
    class Element {
        constructor() {
            this.value = ''; this.textContent = ''; this.children = []; this.attrs = {};
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
    // Minimal XML node standing in for a parsed <svg>: enough for the icon
    // sanitizer to walk attributes and detach dangerous elements.
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
        elements.set(match[1], element);
    }
    const location = new Proxy(new URL('https://oj.example/reg?tab=pwd&return=' + encodeURIComponent(returnTo)), {
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
            return response || { ok: true, status: 200, redirected: true, url: 'https://oj.example/', json: async () => ({ ok: true, redirect: '/training' }) };
        },
    });
    vm.runInContext(scripts[0], context);
    window.__SWPU_BOOT.oauth = oauth;
    for (const script of scripts.slice(1)) vm.runInContext(script, context);
    async function submit(form) {
        await elements.get(form).events.submit({ preventDefault() {} });
    }
    function credentials() {
        elements.get('p-uname').value = 'fixture-student';
        elements.get('p-pw').value = 'fixture-password';
    }
    return { elements, requests, messages, location, timers, submit, credentials, XmlNode, Element };
}

test('password login rejects external, backslash, control and auth-loop return paths', async () => {
    for (const returnTo of ['//example.invalid/path', '/\\example.invalid/path', 'https://example.invalid', '/\nevil', '/\tevil', '/login?fallback=1', '/reg?tab=pwd']) {
        const p = page({ returnTo }); p.credentials();
        await p.submit('f-pwd');
        const body = new URLSearchParams(p.requests[0].options.body);
        assert.equal(body.get('redirect'), '/', returnTo);
        assert.equal(p.location.href, 'https://oj.example/');
        assert.equal(p.timers.size, 0);
    }
});

test('safe return and remember-me survive password login and native login handoff', async () => {
    const returnTo = '/p/100?lang=cpp#submit';
    const p = page({ returnTo }); p.credentials();
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
    const p = page({ response: { ok: true, status: 200, redirected: false } }); p.credentials();
    await p.submit('f-pwd');
    assert.equal(p.location.pathname, '/reg');
    assert.match(p.elements.get('p-msg').textContent, /未能确认登录成功/);
    assert.equal(p.elements.get('p-go').disabled, false);
});

test('login failures preserve inputs, explain recovery and re-enable submission', async () => {
    for (const [status, expected] of [[403, /原生登录入口/], [429, /频繁/], [503, /暂时不可用/]]) {
        const p = page({ response: { ok: false, status } }); p.credentials();
        await p.submit('f-pwd');
        assert.match(p.elements.get('p-msg').textContent, expected);
        assert.equal(p.elements.get('p-pw').value, 'fixture-password');
        assert.equal(p.elements.get('p-go').disabled, false);
        assert.equal(p.elements.get('f-pwd').getAttribute('aria-busy'), null);
        assert.equal(p.timers.size, 0);
    }
    for (const name of ['AbortError', 'TypeError']) {
        const p = page({ fetchError: Object.assign(new Error('fixture'), { name }) }); p.credentials();
        await p.submit('f-pwd');
        assert.match(p.elements.get('p-msg').textContent, name === 'AbortError' ? /超时/ : /网络连接失败/);
        assert.equal(p.elements.get('p-go').disabled, false);
    }
});

test('mail login also rejects an external API redirect and posts only a safe path to its parent', async () => {
    const p = page({ embed: true, returnTo: '//example.invalid', response: {
        ok: true, status: 200, json: async () => ({ ok: true, redirect: '/\\example.invalid' }),
    } });
    p.elements.get('l-mail').value = 'fixture@example.com';
    p.elements.get('l-code').value = '123456';
    await p.submit('f-login');
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].data.return, '/');
    assert.equal(p.messages[0].origin, 'https://oj.example');
});

test('OAuth and password recovery leave the iframe and preserve only safe return paths', () => {
    const p = page({ embed: true, returnTo: '/training', oauth: [{ id: 'github', text: 'GitHub', icon: '<svg></svg>' }] });
    const oauth = p.elements.get('oauth-list').children[0];
    assert.equal(oauth.target, '_top');
    assert.equal(new URL(oauth.href, p.location).searchParams.get('redirect'), '/training');
    assert.match(html, /<a href="\/lostpass" target="_top">/);
});

// p.icon and p.text come from the OAuth provider registry. Both used to be
// concatenated into one innerHTML assignment, so a provider could ship markup.
test('OAuth provider markup is parsed and sanitized, and the label is never parsed as HTML', () => {
    // Bootstrap a provider-free page just to reach the harness node classes.
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
    // The script element was detached before insertion.
    assert.deepEqual(detached, ['script']);
    assert.equal(onload.getAttribute('onload'), null);
    assert.equal(onload.getAttribute('href'), null);
    assert.equal(onload.getAttribute('alt'), 'keep me', 'inert attributes survive');
    // The parsed svg root became the anchor's first child.
    assert.equal(anchor.children[0], root);
    // The label is a text node, so the markup is displayed, never parsed.
    const label = anchor.children[1];
    assert.equal(label.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(label.innerHTML, undefined);

    // Nothing in the shipped page concatenates provider data into innerHTML.
    assert.doesNotMatch(html, /innerHTML\s*=\s*p\./);
    assert.doesNotMatch(html, /innerHTML\s*=\s*providers/);
});
