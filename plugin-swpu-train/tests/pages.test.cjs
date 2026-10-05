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

test('pages only call their own registered JSON endpoints', () => {
    for (const page of ['workbench.html', 'mistakes.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        for (const match of html.matchAll(/fetch\('([^']+)'/g)) {
            assert.match(match[1], /^\/(workbench\/data|mistakes\/(data|update|remove|sync))/, `${page} fetches ${match[1]}`);
        }
        assert.doesNotMatch(html, /https?:\/\/(?!dfacm\.website)/, 'no external fetch or asset origins');
        assert.doesNotMatch(html, /https?:\/\/swpuacm\.xyz/, 'former public domain must not leak into training pages');
    }
});

test('training pages carry the d&f identity and final meaning', () => {
    for (const page of ['workbench.html', 'mistakes.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        assert.match(html, /<title>[^<]*d&amp;f算法网<\/title>/);
        assert.match(html, /<b>d&amp;f算法网<\/b>/);
        assert.match(html, /每个人都能在算法竞赛这条路上找到属于自己的 final/);
        assert.doesNotMatch(html, /DFACM OJ|SWPU ACM|西南石油大学|swpuacm\.xyz/);
    }
});
