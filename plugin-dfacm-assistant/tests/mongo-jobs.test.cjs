'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMongoJobStore } = require('../mongo-jobs.cjs');
const { request, answer } = require('./fixtures.cjs');

const { memoryCollection } = require('./fake-collection.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const cfg = { model: 'fixture', timeoutMs: 1000, apiKey: 'never-persist-this' };

test('tasks are available to a different worker and cache repeated identical requests', async () => {
    const coll = memoryCollection(); let calls = 0;
    const a = createMongoJobStore({ collection: coll, generate: async () => { calls++; return answer('debug'); } });
    const b = createMongoJobStore({ collection: coll, generate: async () => { throw new Error('not used'); } });
    const started = await a.start(request('debug'), 'main:42', 'p:P1001', cfg, 'skill1');
    await tick();
    const read = await b.get(started.id, 'main:42', 'p:P1001');
    assert.equal(read.status, 'ready'); assert.equal(read.source[5].text, '    int sum = 0;');
    assert.equal((await b.start(request('debug'), 'main:42', 'p:P1001', cfg, 'skill1')).id, started.id);
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify([...coll.docs.values()]).includes(cfg.apiKey));
    await assert.rejects(b.get(started.id, 'main:41', 'p:P1001'), { code: 'JOB_NOT_FOUND' });
    await assert.rejects(b.get(started.id, 'main:42', 'p:P1002'), { code: 'JOB_NOT_FOUND' });
});

test('atomic leases limit parallel requests across workers', async () => {
    const coll = memoryCollection(); let finish;
    const generate = () => new Promise((resolve) => { finish = resolve; });
    const a = createMongoJobStore({ collection: coll, generate, maxConcurrent: 1 });
    const b = createMongoJobStore({ collection: coll, generate, maxConcurrent: 1 });
    const first = await a.start(request(), 'main:42', 'p:P1001', cfg, 'v1');
    assert.equal((await b.start(request(), 'main:42', 'p:P1001', cfg, 'v1')).id, first.id);
    await assert.rejects(b.start(request('debug'), 'main:42', 'p:P1001', cfg, 'v1'), { code: 'ALREADY_RUNNING' });
    await assert.rejects(b.start(request(), 'main:43', 'p:P1001', cfg, 'v1'), { code: 'BUSY' });
    finish(answer()); await tick();
    const next = await b.start(request(), 'main:43', 'p:P1001', cfg, 'v1');
    assert.equal(next.status, 'pending'); finish(answer()); await tick();
});

test('orphaned jobs become a retryable failure; TTL is checked even before Mongo cleanup', async () => {
    let time = 10000;
    const coll = memoryCollection();
    const store = createMongoJobStore({ collection: coll, now: () => time, ttlMs: 100000, generate: () => new Promise(() => {}) });
    const started = await store.start(request(), 'main:42', 'p:P1001', cfg, 'v1');
    time += 32000;
    const read = await store.get(started.id, 'main:42', 'p:P1001');
    assert.equal(read.status, 'failed'); assert.equal(read.error.code, 'TIMEOUT');
    time += 100001;
    await assert.rejects(store.get(started.id, 'main:42', 'p:P1001'), { code: 'JOB_NOT_FOUND' });
    store.dispose();
});

test('unexpected generation failures expose a generic message and release leases', async () => {
    const coll = memoryCollection();
    const store = createMongoJobStore({ collection: coll, generate: async () => { throw new Error('secret-token'); } });
    const started = await store.start(request(), 'main:42', 'p:P1001', cfg, 'v1');
    await tick();
    const result = await store.get(started.id, 'main:42', 'p:P1001');
    assert.equal(result.status, 'failed'); assert.ok(!JSON.stringify(result).includes('secret-token'));
    assert.ok(![...coll.docs.keys()].some((key) => key.startsWith('slot:') || key.startsWith('user:')));
});

test('cache separates site, personal provider and different keys without persisting credentials', async () => {
    const coll = memoryCollection(); const seen = [];
    const store = createMongoJobStore({ collection: coll, generate: async (_request, config) => { seen.push(config); return answer(); } });
    const site = { ...cfg, endpoint: 'https://model.example.com/v1/chat/completions' };
    const first = await store.start(request(), 'main:42', 'p:P1001', site, 'v1'); await tick();
    const personal = { ...site, personal: true };
    const second = await store.start(request(), 'main:42', 'p:P1001', personal, 'v1'); await tick();
    const changed = { ...personal, apiKey: 'a-different-private-key' };
    const third = await store.start(request(), 'main:42', 'p:P1001', changed, 'v1'); await tick();
    assert.notEqual(first.id, second.id); assert.notEqual(second.id, third.id);
    assert.equal((await store.start(request(), 'main:42', 'p:P1001', changed, 'v1')).id, third.id);
    assert.equal(seen.length, 3); assert.equal(seen[2].apiKey, changed.apiKey);
    assert.ok(!JSON.stringify([...coll.docs.values()]).includes(changed.apiKey));
    assert.ok(!JSON.stringify([...coll.docs.values()]).includes(cfg.apiKey));
});

test('changing transport cannot reuse a previous direct API result', async () => {
    const coll = memoryCollection(); let calls = 0;
    const store = createMongoJobStore({ collection: coll, generate: async () => { calls++; return answer(); } });
    const first = await store.start(request(), 'main:42', 'p:P1001', { ...cfg, transport: 'chat-completions' }, 'v1'); await tick();
    const second = await store.start(request(), 'main:42', 'p:P1001', { ...cfg, transport: 'codex-responses' }, 'v1'); await tick();
    assert.notEqual(first.id, second.id); assert.equal(calls, 2);
});

test('pending sections are shared across workers and terminal writes cannot be overwritten by slow progress', async () => {
    const collection = memoryCollection(); const original = collection.updateOne.bind(collection);
    let time = 10000, report, finish, releaseWrite;
    collection.updateOne = async (query, update, options) => {
        if (update.$set.progress?.stage === 'validating') await new Promise(resolve => { releaseWrite = resolve; });
        return original(query, update, options);
    };
    const a = createMongoJobStore({ collection, now: () => time, generate: (_input, _config, _signal, callback) => { report = callback; return new Promise(resolve => { finish = resolve; }); } });
    const b = createMongoJobStore({ collection, now: () => time, generate: () => assert.fail('Polling or duplicate start must not call supplier') });
    const input = request('solve', 'hint'); const job = await a.start(input, 'main:42', 'p:P1001', cfg, 'v2'); await tick();
    report({ stage: 'generating', preview: { meaning: '完整的题意', code: 'never-public' }, usage: null }); await tick();
    let polled = await b.get(job.id, 'main:42', 'p:P1001');
    assert.deepEqual(polled.progress.preview, { meaning: '完整的题意' }); assert.equal(polled.level, 'hint'); assert.equal(polled.cacheHit, false);
    report({ stage: 'generating', preview: { meaning: '完整的题意', approach: '另一已完成字段' }, usage: null }); await tick();
    assert.equal((await b.get(job.id, 'main:42', 'p:P1001')).progress.preview.approach, '另一已完成字段');
    const duplicate = await b.start(input, 'main:42', 'p:P1001', cfg, 'v2'); assert.equal(duplicate.id, job.id); assert.equal(duplicate.cacheHit, false);
    const usage = { inputTokens: 20, outputTokens: 40, totalTokens: 60, cachedInputTokens: 3 };
    report({ stage: 'validating', preview: {}, usage }); await tick();
    finish({ ...answer('solve', 'hint'), usage }); await tick();
    assert.equal((await b.get(job.id, 'main:42', 'p:P1001')).status, 'pending');
    time += 2700; releaseWrite(); await tick(); await tick();
    polled = await b.get(job.id, 'main:42', 'p:P1001');
    assert.equal(polled.status, 'ready'); assert.deepEqual(polled.progress, { stage: 'complete', preview: {} }); assert.deepEqual(polled.usage, usage); assert.equal(polled.elapsedMs, 2700);
    assert.equal(polled.cacheHit, false); assert.equal((await b.start(input, 'main:42', 'p:P1001', cfg, 'v2')).cacheHit, true);
    assert.ok(!JSON.stringify([...collection.docs.values()]).includes(cfg.apiKey)); assert.ok(!JSON.stringify(polled).includes('never-public'));
});

test('hint, approach and complete answers have separate cache identities; missing final usage clears earlier partial usage', async () => {
    const collection = memoryCollection(); let calls = 0;
    const store = createMongoJobStore({ collection, generate: async (input, _config, _signal, report) => {
        calls++; report({ stage: 'generating', preview: {}, usage: { inputTokens: 5, outputTokens: 2 } });
        return { ...answer('solve', input.level), usage: null };
    } });
    const ids = [];
    for (const level of ['hint', 'approach', 'solution']) {
        const job = await store.start(request('solve', level), 'main:42', 'p:P1001', cfg, 'v2'); await tick(); ids.push(job.id);
        assert.equal((await store.get(job.id, 'main:42', 'p:P1001')).usage, null);
    }
    assert.equal(new Set(ids).size, 3); assert.equal(calls, 3);
});
