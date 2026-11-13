'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { fixture } = require('./handler-fixture.cjs');

const flush = async () => { for (let n = 0; n < 8; n++) await new Promise(setImmediate); };

// The actual HTML scripts issue requests to actual production handlers. Only
// Hydro infrastructure, Mongo and browser/network boundaries are local doubles.
async function browser(f, pagePath, transform = (value) => value) {
    const h = f.handler(pagePath); await h.get();
    const html = transform(String(h.response.body));
    const { document } = parseHTML(html);
    const window = { addEventListener() {}, Event: document.defaultView.Event };
    const prefix = f.stub.domainId === 'system' ? '' : `/d/${f.stub.domainId}`;
    const location = new URL(`https://dfacm.website${prefix}${pagePath}`);
    window.location = location; window.confirm = () => true;
    const calls = [], attempts = [];
    const fetch = async (value, options = {}) => {
        attempts.push(String(value));
        const url = new URL(value, location);
        assert.equal(url.origin, location.origin, 'no off-origin requests');
        const matched = /^\/d\/([^/]+)(\/.*)$/.exec(url.pathname);
        const domain = matched ? decodeURIComponent(matched[1]) : 'system';
        const route = matched ? matched[2] : url.pathname;
        calls.push({ path: url.pathname, domain, method: options.method || 'GET' });
        const target = f.handler(route); target.args.domainId = domain;
        target.request.query = Object.fromEntries(url.searchParams);
        if (options.method === 'POST') {
            const data = new URLSearchParams(options.body);
            if (route === '/mistakes/update') await target.post(domain, +data.get('pid'), data.has('reason') ? data.get('reason') : undefined, data.has('note') ? data.get('note') : undefined, data.has('resolved') ? data.get('resolved') === '1' : undefined, data.get('csrf'));
            else if (route === '/mistakes/remove') await target.post(domain, +data.get('pid'), data.get('csrf'));
            else if (route === '/mistakes/sync') await target.post(domain, data.get('csrf'));
            else throw new Error(`unexpected POST ${route}`);
        } else if (route === '/mistakes/data') await target.get(domain, url.searchParams.get('filter') || 'open', +(url.searchParams.get('page') || 1));
        else await target.get();
        return { ok: true, json: async () => target.response.body };
    };
    const context = vm.createContext({ window, document, location, fetch, URL, URLSearchParams, AbortController,
        localStorage: { getItem() { return null; }, setItem() {} }, setTimeout: () => 1, clearTimeout() {}, console });
    for (const script of document.querySelectorAll('script')) vm.runInContext(script.textContent, context);
    await flush();
    return { document, window, calls, attempts, click: async (selector) => { const el = document.querySelector(selector); assert.ok(el, selector); el.dispatchEvent(new window.Event('click', { bubbles: true })); await flush(); } };
}

async function domainFixture(domainId) {
    const f = await fixture({ domainId }); f.stub.domainId = domainId;
    f.stub.TrainingModel.getMultiStatus = () => ({ toArray: async () => [{ docId: 'tdocA', enroll: 1 }] });
    for (const domain of ['system', 'poj']) {
        f.collection.docs.push({ domainId: domain, uid: 42, pid: 0, backfilled: true });
        f.collection.docs.push({ domainId: domain, uid: 42, pid: 1001, status: 2, rid: 'aaaaaaaaaaaaaaaaaaaaaaaa', attempts: 1, note: `${domain} note`, resolved: false, lastAt: new Date('2026-10-07T10:00:00Z') });
    }
    return f;
}

for (const [domainId, prefix] of [['system', ''], ['poj', '/d/poj']]) {
    test(`${domainId} workbench GET and training/problem/record navigation retain the current domain`, async () => {
        const f = await domainFixture(domainId);
        const b = await browser(f, '/workbench');
        assert.equal(b.calls[0].path, `${prefix}/workbench/data`);
        assert.equal(b.document.querySelector('#content').hidden, false);
        assert.equal(b.document.querySelector('#resume-next').getAttribute('href'), `${prefix}/p/P1001?training=tdocA&trainingNode=1`);
        assert.equal(b.document.querySelector('#resume-chapter').getAttribute('href'), `${prefix}/training/tdocA#node-1`);
        assert.equal(b.document.querySelector('#failed a').getAttribute('href'), `${prefix}/p/P1001`);
        assert.ok(b.document.querySelector('#failed a.rl'), 'recent record navigation must exist');
        assert.equal(b.document.querySelector('#failed a.rl').getAttribute('href'), `${prefix}/record/r-2026-10-07T10%3A00%3A00Z`);
        assert.equal(b.document.querySelector('#all-enrolled').getAttribute('href'), `${prefix}/training?view=enrolled`);
        for (const link of b.document.querySelectorAll('.nav a')) assert.ok(link.getAttribute('href').startsWith(prefix + '/'), link.outerHTML);
        const recent = f.handler('/workbench/recent'); await recent.get();
        assert.equal(recent.response.body.data.trainings[0].url, `${prefix}/training/tdocA`);
        assert.equal(recent.response.headers['Cache-Control'], 'private, no-store');
    });

    test(`${domainId} mistake GET/save/toggle/sync/remove target only the current domain for identical PIDs`, async () => {
        const f = await domainFixture(domainId);
        const other = domainId === 'system' ? 'poj' : 'system';
        const before = structuredClone(f.collection.docs.filter((doc) => doc.domainId === other));
        const b = await browser(f, '/mistakes');
        assert.equal(b.calls[0].path, `${prefix}/mistakes/data`);
        assert.equal(b.document.querySelector('#note-1001').value, `${domainId} note`);
        assert.equal(b.document.querySelector('#list .tt a').getAttribute('href'), `${prefix}/p/P1001`);
        assert.equal(b.document.querySelector('#list .meta a').getAttribute('href'), `${prefix}/record/aaaaaaaaaaaaaaaaaaaaaaaa`);
        Object.defineProperty(b.document.querySelector('#reason-1001'), 'value', { value: '', writable: true });
        b.document.querySelector('#note-1001').value = 'review from current domain';
        await b.click('[data-act="save"]');
        assert.equal(f.collection.docs.find((doc) => doc.domainId === domainId && doc.pid === 1001).note, 'review from current domain');
        await b.click('[data-act="toggle"]');
        assert.equal(f.collection.docs.find((doc) => doc.domainId === domainId && doc.pid === 1001).resolved, true);
        await b.click('#sync');
        await b.click('#tab-all');
        await b.click('[data-act="remove"]');
        assert.equal(f.collection.docs.some((doc) => doc.domainId === domainId && doc.pid === 1001), false);
        assert.deepEqual(f.collection.docs.filter((doc) => doc.domainId === other), before);
        assert.ok(b.calls.every((call) => call.domain === domainId), JSON.stringify(b.calls));
        assert.deepEqual(b.calls.filter((call) => call.method === 'POST').map((call) => call.path), [`${prefix}/mistakes/update`, `${prefix}/mistakes/update`, `${prefix}/mistakes/sync`, `${prefix}/mistakes/remove`]);
    });
}

for (const page of ['/workbench', '/mistakes']) {
    test(`${page} refuses off-origin DTO links while permitting domain links`, async () => {
        const f = await domainFixture('poj');
        const dataHandler = f.routes.get(page + '/data').HandlerClass;
        const get = dataHandler.prototype.get;
        dataHandler.prototype.get = async function (...args) {
            await get.apply(this, args);
            const data = page === '/workbench' ? this.response.body.data.recentFailed : this.response.body.items;
            data[0].url = 'https://evil.example/p/1001'; data[0].recordUrl = '//evil.example/record/rid';
        };
        const b = await browser(f, page);
        assert.ok(!b.document.querySelector('a[href^="https://evil"], a[href^="//evil"]')); 
    });
}


for (const page of ['/workbench', '/mistakes']) {
    test(`${page} rejects an off-origin API route without making a request`, async () => {
        const f = await domainFixture('poj');
        const b = await browser(f, page, (html) => html.replace(/window\.__SWPU_ROUTES__=({[^\n]+});/, (_match, json) => {
            const routes = JSON.parse(json);
            routes[page === '/workbench' ? 'workbenchData' : 'mistakesData'] = 'https://evil.example/data';
            return `window.__SWPU_ROUTES__=${JSON.stringify(routes)};`;
        }));
        assert.deepEqual(b.attempts, []);
        assert.equal(b.document.querySelector('#error').hidden, false);
    });
}

test('mistakes refuses an off-origin POST endpoint before submitting a note', async () => {
    const f = await domainFixture('poj');
    const b = await browser(f, '/mistakes', (html) => html.replace(/window\.__SWPU_ROUTES__=({[^\n]+});/, (_match, json) => {
        const routes = JSON.parse(json); routes.mistakesUpdate = '//evil.example/update';
        return `window.__SWPU_ROUTES__=${JSON.stringify(routes)};`;
    }));
    Object.defineProperty(b.document.querySelector('#reason-1001'), 'value', { value: '', writable: true });
    await b.click('[data-act="save"]');
    assert.deepEqual(b.attempts, ['/d/poj/mistakes/data?filter=open&page=1']);
    assert.equal(f.collection.docs.find((doc) => doc.domainId === 'poj' && doc.pid === 1001).note, 'poj note');
});

test('server route injection preserves script delimiters and quotes as data', async () => {
    const f = await domainFixture('poj');
    const HandlerClass = f.routes.get('/workbench').HandlerClass;
    const original = HandlerClass.prototype.url;
    const value = '/d/poj/?q=</script><script>window.injected=true</script>&quote="';
    HandlerClass.prototype.url = function (name, args) { return name === 'homepage' ? value : original.call(this, name, args); };
    const b = await browser(f, '/workbench');
    assert.equal(b.window.injected, undefined);
    assert.equal(b.window.__SWPU_ROUTES__.home, value);
    assert.equal(b.document.querySelector('.brand').getAttribute('href'), value);
});
