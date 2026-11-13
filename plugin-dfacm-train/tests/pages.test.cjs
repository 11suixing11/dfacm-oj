'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const page of ['workbench.html', 'mistakes.html']) {
    test(`${page} scripts parse and every referenced element id exists`, () => {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
        assert.ok(scripts.length > 0, 'page must carry its inline script');
        for (const source of scripts) new vm.Script(source); // syntax
        const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
        const referenced = new Set(scripts.flatMap((source) => [...source.matchAll(/\$\('([\w-]+)'\)/g)].map((match) => match[1])));
        // item templates build element ids dynamically; those are excluded here.
        const dynamic = /imsg-|reason-|note-/;
        for (const id of referenced) {
            if (dynamic.test(id)) continue;
            assert.ok(ids.has(id), `${page} references missing element #${id}`);
        }
    });
}

test('training pages carry the d&f identity and final meaning', () => {
    for (const page of ['workbench.html', 'mistakes.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        assert.match(html, /<title>[^<]*d&amp;f算法网<\/title>/);
        assert.match(html, /<b>d&amp;f算法网<\/b>/);
        assert.match(html, /每个人都能在算法竞赛这条路上找到属于自己的 final/);
        assert.doesNotMatch(html, /DFACM OJ|SWPU ACM|西南石油大学|swpuacm\.xyz/);
    }
});


// Run the shipped HTML through the real preview HTTP server. Missing explicit
// preview routing must be caught by the browser behavior, not by source matching.
test('root preview HTML scripts read their explicit local API routes', async (t) => {
    const { parseHTML } = require('linkedom');
    const { createServer } = require('../../scripts/preview.cjs');
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [page, expected] of [['/workbench', '/workbench/data'], ['/mistakes', '/mistakes/data?filter=open&page=1']]) {
        const html = await fetch(origin + page).then((response) => response.text());
        const { document } = parseHTML(html);
        const requests = [], pending = [];
        const window = { addEventListener() {}, confirm: () => true };
        const context = vm.createContext({ document, window, location: new URL(origin + page),
            URL, URLSearchParams, AbortController, setTimeout: () => 1, clearTimeout() {},
            localStorage: { getItem: () => null },
            fetch: (value, options) => {
                requests.push(String(value));
                const task = fetch(new URL(value, origin), options).then(async (response) => {
                    const data = await response.json(); return { ok: response.ok, json: async () => data };
                });
                pending.push(task); return task;
            },
        });
        for (const script of document.querySelectorAll('script:not([src])')) vm.runInContext(script.textContent, context);
        await Promise.all(pending);
        await new Promise(setImmediate);
        assert.deepEqual(requests, [expected]);
        assert.equal(document.querySelector('#error').hidden, true);
        assert.equal(document.querySelector('#loading').hidden, true);
        if (page === '/workbench') assert.match(document.querySelector('#resume-next').getAttribute('href'), /^\/p\/P1001\?training=/);
        else assert.ok(document.querySelector('#note-1002'), 'preview mistakes are visible');
    }
});
