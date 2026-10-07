// Landing page session-awareness tests.
//
// landing/index.html is a static file served straight from Caddy; it cannot
// read the HttpOnly session cookie, so its script probes an SSR route instead
// (/p) for the one marker Hydro renders only for signed-in users: the
// <a href="/user/<uid>" class="nav__item"> username link (guest pages carry
// zero of them — beware: the injected footer theme script contains the literal
// `name="nav_logout"`, which fooled the old marker on every guest page). These
// tests run the shipped script in a vm sandbox with stubbed DOM, storage and
// fetch and assert the guest -> member swap plus every rollback / fail-safe
// path.
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
    assert.ok(html.includes('nav__item'), 'username anchor marker missing');
    assert.ok(!html.includes("indexOf('name=\"nav_logout\"')"), 'must not detect login via the footer-script-contaminated nav_logout string');
    assert.ok(html.includes("credentials:'same-origin'"));
    assert.ok(html.includes("cache:'no-store'"), 'probe must bypass the HTTP cache');
    assert.ok(html.includes("addEventListener('pageshow'"), 'bfcache restore must re-probe login state');
    assert.ok(html.includes('4,249'), 'problem count must not regress');
assert.ok(html.includes('>29</span>'), '29 judge languages');
    assert.ok(!html.includes('data-count'), 'dead attributes: nothing reads them, and they drifted from the visible numbers');
    assert.ok(!html.includes('2.5ms'), 'the judge-sourced 2.5ms stat must stay gone');
    assert.ok(!html.includes('8.1ms'), 'stale 8.1ms stat must be gone');
    assert.ok(!html.includes('最快一次评测'), 'the fastest-run cell was removed — do not reintroduce an unattributable headline stat');
});

test('landing identity is independent from the former campus brand', () => {
    assert.match(html, /d(?:&|&amp;)f算法网/, 'public brand name missing');
    assert.ok(html.includes('每个人都能在算法竞赛这条路上找到属于自己的 final'), 'brand meaning copy missing');
    assert.ok(html.includes('https://dfacm.website/'), 'canonical domain missing');
    assert.ok(html.includes('dfacm.website'), 'copyable domain missing');
    assert.ok(!html.includes('西南石油大学'), 'former campus name leaked into the landing page');
    assert.ok(!html.includes('DFACM OJ'), 'former public brand leaked into the landing page');
    assert.ok(!html.includes('SWPU ACM'), 'former public brand leaked into the landing page');
    assert.ok(!html.includes('swpuacm.xyz'), 'former public domain leaked into the landing page');
});

test('QQ training-group entry is visible in the hero', () => {
    const heroStart = html.indexOf('<section id="hero"');
    const heroEnd = html.indexOf('</section>', heroStart);
    const hero = html.slice(heroStart, heroEnd);
    const goStart = html.indexOf('<section id="go"');
    const goEnd = html.indexOf('</section>', goStart);
    const go = html.slice(goStart, goEnd);

    assert.ok(heroStart >= 0, 'hero section missing');
    assert.ok(hero.includes('<div class="join" aria-label="加入 OJ 训练群">'), 'join card must be in the hero');
    assert.equal((html.match(/class="join"/g) || []).length, 1, 'join card must not be duplicated');
    assert.ok(hero.includes('href="https://qm.qq.com/q/8mG7ByDyCc"'), 'QQ join link missing from hero');
    assert.ok(hero.includes('src="/qq-training-group.png"'), 'QR image must use the shipped asset');
    assert.ok(hero.includes('群号 <b>1128735782</b>'), 'training group number missing');
    assert.equal(go.includes('class="join"'), false, 'CTA section must not keep a duplicate join card');
});

// The 蓝桥杯 card's four "stages" are DAG nodes inside ONE training, so Hydro
// has no per-stage URL. They were four differently-named anchors all pointing
// at the same training, which promised stage-specific destinations and then
// landed on the route entry page.
test('stage tiles that share one training must not be anchors', () => {
    const mini = html.match(/<nav class="mini"[\s\S]*?<\/nav>/);
    assert.ok(mini, 'stage nav missing');
    assert.equal(mini[0].includes('<a '), false, 'a stage tile became a link again — it has no distinct destination');
    assert.equal([...mini[0].matchAll(/class="stage"/g)].length, 4);
    assert.equal(/aria-label="蓝桥杯路线包含 4 个递进章节"/.test(mini[0]), true);
    // The card keeps exactly one real affordance into the route (bounded by its own </article>).
    const start = html.indexOf('蓝桥杯真题');
    const card = html.slice(start, html.indexOf('</article>', start) + 10);
    assert.equal([...card.matchAll(/href="\/training\//g)].length, 1);
    assert.ok(!html.includes('.mini a:hover'), 'non-clickable tiles must not keep a hover affordance');
    assert.ok(html.includes('.mini .stage::before'), 'stage timeline dot styling must follow the element rename');
});

class El {
    constructor(text, href) {
        this.textContent = text;
        this.attrs = href === undefined ? {} : { href };
        this.title = '';
        this._innerHTML = '';
        this.tagName = '';
        this.childNodes = [];
    }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) {
        this._innerHTML = String(v);
        // Assigning innerHTML replaces the children in a real DOM.
        this.childNodes = [];
        if (this._innerHTML === '') this.textContent = '';
    }
    appendChild(node) { this.childNodes.push(node); return node; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    }
    // Serialize the constructed tree so assertions can read it like markup.
    toHTML() {
        if (!this.childNodes.length) return this._innerHTML || escapeText(this.textContent);
        return this.childNodes.map((n) => (n.tagName
            ? `<${n.tagName} href="${n.getAttribute('href') || ''}">${n.toHTML()}</${n.tagName}>`
            : escapeText(n.textContent))).join('');
    }
}

function escapeText(value) {
    return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function textNode(text) {
    return { tagName: '', textContent: String(text) };
}

const GUEST_HELP = '第一次来？<a href="#start">查看入门指引</a><span>已有账号 <a href="/reg?tab=pwd">登录</a></span>';

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
        document: {
            querySelector: (sel) => els[sel] || null,
            createElement: (tag) => { const el = new El(''); el.tagName = tag; return el; },
            createTextNode: textNode,
        },
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

// Captured from the live /p render (2026-10-04): ui-default.footer_extra_html
// injects a theme-toggle script whose querySelector literal contains
// `name="nav_logout"`. The old probe anchor matched this string on guest
// pages too, so every logged-out probe kept the stale cache paint forever.
const FOOTER_THEME_SCRIPT = [
    '<script>(function(){',
    'var u=document.querySelector(\'a[name="nav_logout"]\');',
    "if(u){u.href=d?'/set_theme/light':'/set_theme/dark';u.textContent='切换到夜间模式'}",
    '})();</' + 'script>',
].join('');

// Captured from the live SSR render (2026-10-04 e2e, temp account since removed).
const AUTH_PAGE = [
    '<li class="nav__list-item"><a href="/p" class="nav__item">题库</a></li>',
    '<li class="nav__list-item"><a href="/user/5" class="nav__item">e2etest <span class="icon icon-expand_more nojs--hide"></span></a></li>',
    '<a href="/logout" class="menu__link" name="nav_logout">退出</a>',
    FOOTER_THEME_SCRIPT,
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
    assert.ok(els['.hero-help'].toHTML().includes('欢迎回来'));
    assert.ok(els['.hero-help'].toHTML().includes('e2etest'));
    assert.ok(els['.hero-help'].toHTML().includes('/workbench'));
    const saved = JSON.parse(store.get('swpu-me'));
    assert.equal(saved.uid, 5);
    assert.equal(saved.name, 'e2etest');
});

// The username is scraped out of server-rendered markup with nm.indexOf('<'),
// so a name containing a tag truncates to empty rather than reaching the DOM.
// That truncation is load-bearing for safety, so lock it: the help line must
// not be repainted at all, and the nav falls back to a neutral label.
test('a username containing markup is dropped rather than inserted', async () => {
    const page = [
        '<li class="nav__list-item"><a href="/p" class="nav__item">题库</a></li>',
        '<li class="nav__list-item"><a href="/user/7" class="nav__item"><img src=x onerror=alert(1)></a></li>',
    ].join('');
    const { els } = await runPage({ page });
    assert.equal(els['#nav a.login'].textContent, '我的主页', 'falls back to a neutral label');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/user/7');
    // The welcome line is only painted for a non-empty name, so the guest
    // markup stays and no <img> can be constructed from the username.
    assert.equal(els['.hero-help'].toHTML(), GUEST_HELP);
    assert.ok(!html.includes("help.innerHTML='欢迎回来"), 'the username must never be concatenated into markup');
});

// An upstream template change that inserts attributes between href and class
// used to break detection, because the probe looked at a fixed-length window.
test('detection survives a longer anchor tag than the old 48-character window', async () => {
    const page = [
        '<li class="nav__list-item"><a href="/p" class="nav__item">题库</a></li>',
        '<li class="nav__list-item"><a data-foo="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" href="/user/42" title="a very long title indeed" class="nav__item">longtag</a></li>',
    ].join('');
    const { els, store } = await runPage({ page });
    assert.equal(els['#nav a.login'].textContent, 'longtag');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/user/42');
    assert.equal(JSON.parse(store.get('swpu-me')).uid, 42);
    assert.ok(!html.includes('substring(k-48'), 'the fixed-length lookback window must stay gone');
});

test('HTML entities in a username are decoded once, not double-escaped', async () => {
    const page = [
        '<li class="nav__list-item"><a href="/p" class="nav__item">题库</a></li>',
        '<li class="nav__list-item"><a href="/user/8" class="nav__item">a&amp;b &lt;c&gt;</a></li>',
    ].join('');
    const { els } = await runPage({ page });
    assert.equal(els['#nav a.login'].textContent, 'a&b <c>');
    const help = els['.hero-help'].toHTML();
    assert.ok(help.includes('a&amp;b &lt;c&gt;'), help);
    assert.ok(!help.includes('&amp;amp;'), 'must not double-escape');
});

// Eleven routes exist (2 route cards + 8 topic cards + 1 wide XCPC card); ids must stay consistent.
test('each training route id is used consistently across markup and script', () => {
    const byId = new Map();
    for (const m of html.matchAll(/\/training\/([0-9a-f]{24})/g)) {
        byId.set(m[1], (byId.get(m[1]) || 0) + 1);
    }
    assert.equal(byId.size, 11, `expected eleven routes, got ${[...byId.keys()].join(', ')}`);
    const [entry, contest] = [...byId.keys()].sort((a, b) => byId.get(b) - byId.get(a));
    assert.ok(byId.get(entry) >= 4, 'the entry route is linked from several places');
    assert.equal(byId.get(contest), 1, 'the contest route has a single entry link');
    assert.equal((html.match(/class="topic-card[ "]/g) || []).length, 9, '8 topic cards + 1 wide XCPC card');
    assert.equal([...byId.values()].filter(v => v === 1).length, 10, 'topic/contest cards each link exactly once');
    assert.ok(html.includes(`var ROUTE_URL='/training/${entry}'`), 'the script constant must match the entry route');
    assert.ok(html.includes(`var url='/training/${entry}'`), 'the route map must match the entry route');
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

test('real guest page (footer script contains the nav_logout string) still probes as guest', async () => {
    // The regression that shipped on 2026-10-04: the footer theme script's
    // querySelector literal made indexOf('name="nav_logout"') hit on guest
    // pages, the uid parse then failed, and the stale paint survived forever.
    const { els, store, fetches } = await runPage({
        page: GUEST_PAGE + FOOTER_THEME_SCRIPT,
        cached: { uid: 4, name: 'core', at: Date.now() },
    });
    assert.equal(fetches.length, 1);
    assert.equal(els['#nav a.login'].textContent, '登录');
    assert.equal(els['#nav a.login'].getAttribute('href'), '/reg?tab=pwd');
    assert.equal(els['#nav a.cta'].textContent, '注册账号');
    assert.equal(els['.hero-help'].innerHTML, GUEST_HELP);
    assert.ok(!store.has('swpu-me'), 'the stale cache must not survive a real guest page');
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
