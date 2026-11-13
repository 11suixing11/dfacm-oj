'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { fixture } = require('./handler-fixture.cjs');

const flush = async () => { for (let n = 0; n < 8; n++) await new Promise(setImmediate); };
function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { values, getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

// The page and every API handler are shipped production code. Only Hydro/Mongo,
// tab storage, DOM, clock and transport are local infrastructure. GET responses
// are independent DB snapshots taken before their deferred delivery. POST gates
// pause before the actual handler runs, so typing can overlap a real save.
async function openMistakesBrowser(options = {}) {
    const { domainId = 'system', uid = 42 } = options;
    const f = options.fixture || await fixture({ domainId });
    if (!options.fixture) {
        f.collection.docs.push({ domainId, uid, pid: 0, backfilled: true });
        for (const [pid, note, resolved] of [[1001, 'saved A', false], [1002, 'saved B', false], [1003, 'saved C', true]]) {
            f.collection.docs.push({ domainId, uid, pid, note, reason: '', resolved, status: 2,
                rid: 'aaaaaaaaaaaaaaaaaaaaaaaa', attempts: 1, lastAt: new Date(`2026-10-${20 - (pid - 1000)}T10:00:00Z`) });
        }
        for (let n = 0; n < (options.extraOpen || 0); n++) f.collection.docs.push({ domainId, uid,
            pid: 2000 + n, note: `saved ${n}`, reason: '', resolved: false, status: 3,
            attempts: 1, lastAt: new Date('2026-09-01T10:00:00Z') });
    }
    const handler = (route) => { const h = f.handler(route); h.args.domainId = domainId; h.user._id = uid; return h; };
    const page = handler('/mistakes'); await page.get();
    const html = (options.transform || ((value) => value))(String(page.response.body));
    const { document } = parseHTML(html);
    // linkedom exposes select.value as getter-only and does not implement the
    // browser's automatic first-option selection. Model only that DOM boundary.
    Object.defineProperty(document.defaultView.HTMLSelectElement.prototype, 'value', {
        configurable: true,
        get() { return (this.querySelector('option[selected]') || this.querySelector('option'))?.getAttribute('value') || ''; },
        set(value) { for (const option of this.querySelectorAll('option')) {
            if (option.getAttribute('value') === String(value)) option.setAttribute('selected', '');
            else option.removeAttribute('selected');
        } },
    });
    const location = new URL(`https://dfacm.website${domainId === 'system' ? '' : '/d/' + encodeURIComponent(domainId)}/mistakes`);
    const storage = options.storage || memoryStorage();
    const window = { location, sessionStorage: storage, addEventListener() {},
        Event: document.defaultView.Event, confirm: () => options.confirm !== false };
    let now = 0, timerId = 0;
    const timers = new Map(), calls = [], gates = [];
    function deferNext(match = {}) {
        let release, reject;
        const promise = new Promise((res, rej) => { release = res; reject = rej; });
        // Avoid test-only unhandled rejections until the transport consumes it.
        promise.catch(() => {});
        const gate = { ...match, promise, resolve: release, reject };
        gates.push(gate); return gate;
    }
    const fetch = async (value, request = {}) => {
        const url = new URL(value, location);
        assert.equal(url.origin, location.origin, 'no off-origin requests');
        const matched = /^\/d\/([^/]+)(\/.*)$/.exec(url.pathname);
        const domain = matched ? decodeURIComponent(matched[1]) : 'system';
        const route = matched ? matched[2] : url.pathname, method = request.method || 'GET';
        assert.equal(domain, domainId, 'request must retain the page domain');
        const data = new URLSearchParams(request.body);
        const call = { url: url.pathname + url.search, route, method, data, signal: request.signal };
        calls.push(call);
        const index = gates.findIndex((gate) => (!gate.method || gate.method === method) && (!gate.route || gate.route === route));
        const gate = index < 0 ? null : gates.splice(index, 1)[0];
        const produce = async () => {
            const target = handler(route); target.request.query = Object.fromEntries(url.searchParams);
            if (method === 'GET') await target.get(domain, url.searchParams.get('filter') || 'open', +(url.searchParams.get('page') || 1));
            else if (route === '/mistakes/update') await target.post(domain, +data.get('pid'), data.has('reason') ? data.get('reason') : undefined,
                data.has('note') ? data.get('note') : undefined, data.has('resolved') ? data.get('resolved') === '1' : undefined, data.get('csrf'));
            else if (route === '/mistakes/remove') await target.post(domain, +data.get('pid'), data.get('csrf'));
            else if (route === '/mistakes/sync') await target.post(domain, data.get('csrf'));
            else throw new Error(`unexpected route ${route}`);
            const snapshot = structuredClone(target.response.body);
            return { ok: true, json: async () => structuredClone(snapshot) };
        };
        const abort = new Promise((_, reject) => {
            if (gate?.ignoreAbort) return;
            request.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        });
        const run = async () => {
            const snapshot = method === 'GET' ? await produce() : null;
            const override = gate ? await gate.promise : null;
            if (override) return { ok: override.httpOk !== false, json: async () => structuredClone(override.body) };
            return snapshot || produce();
        };
        return Promise.race([run(), abort]);
    };
    const context = vm.createContext({ window, document, location, fetch, URL, URLSearchParams, AbortController,
        sessionStorage: storage, localStorage: memoryStorage(), console,
        setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; },
        clearTimeout: (id) => timers.delete(id) });
    if (options.initialGate) deferNext(options.initialGate);
    for (const script of document.querySelectorAll('script:not([src])')) vm.runInContext(script.textContent, context);
    await flush();
    const row = (pid) => document.querySelector('#note-' + pid);
    return { fixture: f, document, window, calls, storage, timers, flush, deferNext,
        storedNote: (pid) => f.collection.docs.find((doc) => doc.domainId === domainId && doc.uid === uid && doc.pid === pid)?.note,
        drafts: () => JSON.parse(storage.getItem(`swpu-mistake-drafts:v1:${uid}:${encodeURIComponent(domainId)}`) || '{}'),
        rows: () => [...document.querySelectorAll('textarea')].map((el) => +el.id.slice(5)),
        edit(pid, values) {
            assert.ok(row(pid), `visible PID ${pid}`);
            for (const [field, value] of Object.entries(values)) {
                const el = document.querySelector(`#${field}-${pid}`); el.value = value;
                el.dispatchEvent(new window.Event(field === 'reason' ? 'change' : 'input', { bubbles: true }));
            }
        },
        click: async (selector) => {
            const el = document.querySelector(selector); assert.ok(el, selector);
            el.dispatchEvent(new window.Event('click', { bubbles: true })); await flush();
        },
        tick: async (ms) => {
            now += ms;
            for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
            await flush();
        },
    };
}

module.exports = { openMistakesBrowser, memoryStorage };
