// Landing page session-awareness tests.
//
// landing/index.html is a static file served straight from Caddy; it cannot
// read the HttpOnly session cookie, so its script probes an SSR route instead
// (/p) for the nav markers Hydro renders: `nav_login` for guests, `nav_logout`
// plus the /user/<uid> link for signed-in users. These tests run the shipped
// script in a vm sandbox with stubbed DOM, storage and fetch and assert the
// guest -> member swap plus every rollback / fail-safe path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'landing', 'index.html'), 'utf8');

// Never assemble `</script>` in a regex literal here; split on plain strings.
function scriptBlocks() {
    const parts = html.split('<' + 'script>').slice(1);
    return parts.map((part) => part.slice(0, part.indexOf('</' + 'script>')));
}

function sessionScript() {
    const hit = scriptBlocks().find((s) => s.includes('swpu-me'));
    assert.ok(hit, 'landing/index.html must ship the session-aware script');
    return hit;
}

// Wiring lock: the shipped markup must contain the exact nodes the script swaps
// and the stats this release refreshed.
test('landing wiring: swap targets, detection marker and stats exist in shipped HTML', () => {
    assert.ok(html.includes('<a class="login" href="/reg?tab=pwd">登录</a>'));
    assert.ok(html.includes('<a class="cta" href="/reg">注册账号</a>'));
    assert.ok(html.includes('<nav id="mmenu"'));
    assert.ok(html.includes('class="hero-help"'));
    assert.ok(html.includes('name="nav_logout"'), 'detection marker missing');
    assert.ok(html.includes("credentials:'same-origin'"));
    assert.ok(html.includes("cache:'no-store'"), 'probe must bypass the HTTP cache');
    assert.ok(html.includes("addEventListener('pageshow'"), 'bfcache restore must re-probe login state');
    assert.ok(html.includes('data-count="4298"'), 'problem count must not regress');
    assert.ok(html.includes('data-count="29"'), '29 selectable languages');
    assert.ok(html.includes('data-count="2.5"'), 'fastest judge run is 2.5ms now');
    assert.ok(!html.includes('data-count="8.1"'), 'stale 8.1ms stat must be gone');
});

class El {
    constructor(text, href) {
        this.textContent = text;
        this.attrs = href === undefined ? {} : { href };
        this.title = '';
        this._innerHTML = '';
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) { this._innerHTML = String(v); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
}

const GUEST_HELP = '第一次来？<a href="#start">查看新生入门指引</a><span>已有账号 <a href="/reg?tab=pwd">登录</a></span>';

const REJECT = Symbol('network down');
const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
};

async function runPage({ page, pages, cached } = {}) {
    const els = {
        '#nav a.login': new El('登录', '/reg?tab=pwd'),
        '#nav a.cta': new El('注册账号', '/reg'),
        '#mmenu a[href="/reg?tab=pwd"]': new El('登录', '/reg?tab=pwd'),
        '#mmenu a[href="/reg"]': new El('注册账号', '/reg'),
        '.hero-help': new El('', undefined),
    };
    els['.hero-help'].innerHTML = GUEST_HELP;
    const store = new Map();
    if (cached) store.set('swpu-me', JSON.stringify(cached));
    const fetches = [];
    const responses = pages || [page];
    let call = 0;
    const handlers = {};
    const context = vm.createContext({
        document: { querySelector: (sel) => els[sel] || null },
        sessionStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        window: { addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); } },
        fetch: async (url, opts) => {
            fetches.push({ url, opts });
            const response = responses[Math.min(call, responses.length - 1)];
            call += 1;
            if (response === REJECT) throw new Error('network down');
            return { text: async () => response };
        },
    });
    vm.runInContext(sessionScript(), context);
    await settle();
    return {
        els,
        store,
        fetches,
        fire: (ev) => { (handlers.pageshow || []).forEach((fn) => fn(ev)); },
    };
}

// Captured from the live SSR render (2026-10-04 e2e, temp account since removed).
const AUTH_PAGE = [
    '<li class="nav__list-item"><a href="/p" class="nav__item">题库</a></li>',
    '<li class="nav__list-item"><a href="/user/5" class="nav__item">e2etest <span class="icon icon-expand_more nojs--hide"></span></a></li>',
    '<a href="/logout" class="menu__link" name="nav_logout">退出</a>',
].join('');
const GUEST_PAGE = '<li class="nav__list-item"><a href="/login" class="nav__item" name="nav_login">登录</a></li>';

test('logged-in SSR page swaps nav to username + workbench and caches the session', async () => {
    const { els, store, fetches } = await runPage({ page: AUTH_PAGE });
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, '/p');
    assert.equal(fetches[0].opts.credentials, 'same-origin');
    assert.equal(els['#nav a.login'].textContent, 'e2etest');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/user/5');
    assert.equal(els['#nav a.login'].title, '个人主页');
    assert.equal(els['#nav a.cta'].textContent, '工作台');
    assert.equal(els['#nav a.cta'].getAttribute('href'), '/workbench');
    assert.equal(els['#mmenu a[href="/reg?tab=pwd"]'].textContent, 'e2etest');
    assert.equal(els['#mmenu a[href="/reg?tab=pwd"]'].getAttribute('href'), '/user/5');
    assert.equal(els['#mmenu a[href="/reg"]'].textContent, '工作台');
    assert.equal(els['#mmenu a[href="/reg"]'].getAttribute('href'), '/workbench');
    assert.ok(els['.hero-help'].innerHTML.includes('欢迎回来'));
    assert.ok(els['.hero-help'].innerHTML.includes('e2etest'));
    assert.ok(els['.hero-help'].innerHTML.includes('/workbench'));
    const saved = JSON.parse(store.get('swpu-me'));
    assert.equal(saved.uid, 5);
    assert.equal(saved.name, 'e2etest');
});

test('guest SSR page keeps the registration UI and drops any stale cache', async () => {
    const { els, store } = await runPage({ page: GUEST_PAGE });
    assert.equal(els['#nav a.login'].textContent, '登录');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/reg?tab=pwd');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.equal(els['#nav a.cta'].getAttribute('href'), '/reg');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
    assert.ok(!store.has('swpu-me'));
});

test('stale cache paints instantly, guest probe rolls it back', async () => {
    const { els, store } = await runPage({
        page: GUEST_PAGE,
        cached: { uid: 9, name: 'someone', at: Date.now() },
    });
    assert.equal(els['#nav a.login'].textContent, '登录');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/reg?tab=pwd');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
    assert.ok(!store.has('swpu-me'));
});

test('displayName variant "Name (uname)" is kept as Hydro renders it', async () => {
    const page = AUTH_PAGE.replace('e2etest ', '显示名 (e2etest) ');
    const { els } = await runPage({ page });
    assert.equal(els['#nav a.login'].textContent, '显示名 (e2etest)');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/user/5');
});

test('expired cache is ignored', async () => {
    const { els } = await runPage({
        page: GUEST_PAGE,
        cached: { uid: 9, name: 'someone', at: Date.now() - 2 * 3600000 },
    });
    assert.equal(els['#nav a.login'].textContent, '登录');
});

test('logged-in page without a parseable user link fails safe (no swap)', async () => {
    const page = '<a href="/logout" class="menu__link" name="nav_logout">退出</a>';
    const { els } = await runPage({ page });
    assert.equal(els['#nav a.login'].textContent, '登录');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
});

test('probe failure rolls the optimistic paint back to guest and drops the cache', async () => {
    const { els, store, fetches } = await runPage({
        pages: [REJECT],
        cached: { uid: 4, name: 'core', at: Date.now() },
    });
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].opts.cache, 'no-store');
    assert.equal(els['#nav a.login'].textContent, '登录');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/reg?tab=pwd');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
    assert.ok(!store.has('swpu-me'), 'unconfirmed cache must not survive a failed probe');
});

test('bfcache restore (persisted pageshow) resets to the guest baseline then re-probes', async () => {
    // Reproduces the reported bug: log out on an OJ page, press Back, and the
    // bfcache-restored landing page used to keep the logged-in paint forever.
    const { els, store, fetches, fire } = await runPage({ pages: [AUTH_PAGE, GUEST_PAGE] });
    assert.equal(els['#nav a.login'].textContent, 'e2etest');
    assert.ok(store.has('swpu-me'));
    fire({ persisted: true });
    assert.equal(els['#nav a.login'].textContent, '登录', 'baseline must reset the moment bfcache restores');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.ok(!store.has('swpu-me'));
    assert.equal(fetches.length, 2);
    await settle();
    assert.equal(fetches[1].opts.cache, 'no-store');
    assert.equal(els['#nav a.login'].textContent, '登录', 'guest re-probe keeps the guest UI');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
    assert.ok(!store.has('swpu-me'));
});

test('persisted pageshow after a fresh login re-detects the signed-in user', async () => {
    const { els, fetches, fire } = await runPage({ pages: [GUEST_PAGE, AUTH_PAGE] });
    assert.equal(els['#nav a.login'].textContent, '登录');
    fire({ persisted: true });
    await settle();
    assert.equal(fetches.length, 2);
    assert.equal(els['#nav a.login'].textContent, 'e2etest', 're-probe must repaint the member UI');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/user/5');
});

test('non-persisted pageshow (normal load) never triggers a second probe', async () => {
    const { fetches, fire } = await runPage({ page: GUEST_PAGE });
    fire({ persisted: false });
    assert.equal(fetches.length, 1);
});
