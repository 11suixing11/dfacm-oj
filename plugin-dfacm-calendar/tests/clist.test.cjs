'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createClistSource, normalizeClist, clistDate } = require('../clist.cjs');
const { TTL_MS, RETRY_MS } = require('../cache.cjs');
const NOW = Date.parse('2026-10-18T12:00:00+08:00');
const row = { id: 321, event: '牛客周赛', resource: 'ac.nowcoder.com', start: '2026-10-22T12:00:00', end: '2026-10-22T14:00:00', href: 'https://ac.nowcoder.com/acm/contest/321' };

function fixture(t, { configured = true } = {}) {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEST_TMPDIR || os.tmpdir()), 'dfacm-clist-'));
    const credentials = configured ? { username: 'test-operator', key: 'fixture-clist-key' } : {};
    let now = NOW;
    let offline = false;
    let block;
    let pending;
    const calls = [];
    const source = createClistSource({
        file: path.join(directory, 'clist-cache.json'), credentials: () => credentials, now: () => now,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (block) await block;
            if (offline) throw new Error('credential must not leak: fixture-clist-key');
            return { ok: true, json: async () => ({ objects: [row] }) };
        },
    });
    t.after(async () => {
        if (pending) pending();
        await source.settled();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    return { source, credentials, calls, directory, advance: (ms) => { now += ms; }, offline: () => { offline = true; },
        pause: () => { block = new Promise((r) => { pending = r; }); }, resume: () => { pending(); block = null; } };
}

test('unconfigured CLIST source sends no request and is explicit about its status', async (t) => {
    const { source, calls } = fixture(t, { configured: false });
    assert.deepEqual(await source.get(), []);
    assert.equal(source.status().status, 'unconfigured');
    assert.equal(calls.length, 0);
});

test('CLIST UTC dates normalize to Beijing, platform/URL validation rejects bad rows', () => {
    const platforms = ['ac.nowcoder.com', 'luogu.com.cn', 'leetcode.com', 'codechef.com'];
    const events = normalizeClist({ objects: platforms.map((host, i) => ({ ...row, id: i + 1, resource: host, href: `https://${host}/contest/${i}` })) }, NOW);
    assert.deepEqual(events.map((e) => e.type), ['nowcoder', 'luogu', 'leetcode', 'codechef']);
    assert.equal(events[0].start, '2026-10-22T20:00:00+08:00');
    assert.equal(clistDate(row.start), Date.parse(row.start + 'Z'));
    assert.equal(clistDate('2026-10-22T20:00:00+08:00'), Date.parse(row.start + 'Z'));
    assert.deepEqual(normalizeClist({ objects: [
        { ...row, href: 'javascript:alert(1)' }, { ...row, href: 'https://evil.example/contest' },
        { ...row, resource: 'codechef.com' }, { ...row, end: row.start }, { ...row, start: 'bad' }, { ...row, event: '' },
    ] }, NOW), []);
    assert.throws(() => normalizeClist({}, NOW), /Invalid/);
});

test('credentials stay in the Authorization header, never URLs, status or disk cache', async (t) => {
    const { source, calls, directory } = fixture(t);
    assert.deepEqual(await source.get(), []); await source.settled();
    assert.equal((await source.get()).length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'ApiKey test-operator:fixture-clist-key');
    const url = new URL(calls[0].url);
    assert.equal(url.hostname, 'clist.by');
    assert.equal(url.searchParams.get('resource__in'), 'ac.nowcoder.com,luogu.com.cn,leetcode.com,codechef.com');
    assert.doesNotMatch(calls[0].url + JSON.stringify(source.status()) + fs.readFileSync(path.join(directory, 'clist-cache.json'), 'utf8'), /fixture-clist-key|test-operator/);
});

test('credential rotation forces an immediate refresh and ignores the old response', async (t) => {
    const f = fixture(t);
    f.pause(); await f.source.get();
    f.credentials.key = 'rotated-key';
    await f.source.get();
    f.resume();
    await f.source.settled(); await f.source.settled();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.headers.Authorization, 'ApiKey test-operator:rotated-key');
    assert.equal((await f.source.get()).length, 1);
    f.credentials.key = 'third-key';
    await f.source.get(); await f.source.settled();
    assert.equal(f.calls.length, 3, 'fresh data must not delay credential rotation for an hour');
});

test('upstream outage retains stale results and backs off; disabling sends no new request', async (t) => {
    const f = fixture(t);
    await f.source.get(); await f.source.settled();
    f.offline(); f.advance(TTL_MS + 1);
    await f.source.get(); await f.source.settled();
    assert.equal((await f.source.get()).length, 1);
    assert.equal(f.source.status().status, 'stale');
    await f.source.get(); await f.source.settled();
    assert.equal(f.calls.length, 2);
    f.advance(RETRY_MS + 1); await f.source.get(); await f.source.settled();
    assert.equal(f.calls.length, 3);
    delete f.credentials.key;
    assert.deepEqual(await f.source.get(), []);
    assert.equal(f.source.status().status, 'unconfigured');
    assert.equal(f.calls.length, 3);
});
