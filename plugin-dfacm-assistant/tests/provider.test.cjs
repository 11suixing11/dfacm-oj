'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { personalProvider } = require('../provider-config.cjs');
const { personalModelConfig, createModelClient } = require('../client.cjs');
const { isPublicAddress, publicLookup, createPublicFetch } = require('../provider-network.cjs');
const { request, answer } = require('./fixtures.cjs');
const path = require('node:path');

const config = (overrides = {}) => ({ provider: 'custom', baseUrl: 'https://model.example.com/v1',
    model: 'personal-model', apiKey: 'private-user-key', ...overrides });
const lookup = (fn, options = {}) => new Promise((resolve, reject) => fn('model.example.com', options,
    (error, address, family) => error ? reject(error) : resolve(options.all ? address : { address, family })));

test('custom provider normalizes base/full endpoints and rejects malformed credentials and addresses', () => {
    assert.equal(personalModelConfig(config({ baseUrl: 'https://model.example.com/v1/chat/completions/' })).endpoint,
        'https://model.example.com/v1/chat/completions');
    assert.equal(personalProvider(config({ provider: 'agentrouter', baseUrl: 'https://other.example.com' })).baseUrl,
        'https://agentrouter.org/v1');
    assert.equal(personalModelConfig(config()).personal, true);
    for (const baseUrl of ['http://model.example.com/v1', 'https://key@model.example.com/v1', 'https://model.example.com/v1?key=secret',
        'https://model.example.com/v1#key', 'https://localhost/v1', 'https://service.internal/v1', 'https://service.local/v1']) {
        assert.throws(() => personalModelConfig(config({ baseUrl })), { code: 'INVALID_PROVIDER' });
    }
    for (const apiKey of ['', 'bad\nkey', '中文', 'x'.repeat(4097)]) {
        assert.throws(() => personalModelConfig(config({ apiKey })), { code: 'INVALID_PROVIDER' });
    }
});

test('provider transport rejects private, mapped, link-local, metadata, documentation and non-routable IPs', () => {
    const denied = ['0.1.2.3', '10.0.0.1', '127.0.0.1', '100.64.1.1', '169.254.169.254', '172.16.0.1',
        '192.168.1.1', '192.0.0.9', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.1.2.3', '255.255.255.255',
        '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1',
        '2001::1', '2001:20::1', '2002:7f00:1::', '3fff::1'];
    for (const address of denied) assert.equal(isPublicAddress(address), false, address);
    for (const address of ['8.8.8.8', '1.1.1.1', '104.18.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
        assert.equal(isPublicAddress(address), true, address);
    }
});

test('DNS guard returns only the validated addresses to the socket and blocks mixed answers', async () => {
    let calls = 0;
    const records = [{ address: '1.1.1.1', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
    const resolver = publicLookup(async (_host, options) => { calls++; assert.equal(options.all, true); return records; });
    assert.deepEqual(await lookup(resolver, { all: true }), records);
    assert.equal(calls, 1);
    for (const records of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '1.1.1.1', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
        await assert.rejects(lookup(publicLookup(async () => records)), { code: 'INVALID_PROVIDER' });
    }
});

function fakeRequest(status, chunks, inspect = () => {}) {
    return (url, options, receive) => {
        inspect(url, options);
        const req = new EventEmitter();
        req.end = (body) => {
            req.body = body;
            queueMicrotask(() => {
                const response = new EventEmitter(); response.statusCode = status;
                let destroyed = false; response.destroy = () => { destroyed = true; };
                receive(response);
                for (const chunk of chunks) if (!destroyed) response.emit('data', Buffer.from(chunk));
                if (!destroyed) response.emit('end');
            });
        };
        return req;
    };
}

test('personal HTTPS transport does not follow redirects and bounds successful response bodies', async () => {
    let count = 0;
    const redirect = createPublicFetch({ requestImpl: fakeRequest(302, ['secret details'], (_url, options) => {
        count++; assert.equal(options.agent, false); assert.equal(typeof options.lookup, 'function');
    }) });
    const result = await redirect('https://model.example.com/v1/chat/completions', { headers: { Authorization: 'Bearer private-user-key' } });
    assert.equal(result.status, 302); assert.equal(await result.text(), ''); assert.equal(count, 1);
    const large = createPublicFetch({ requestImpl: fakeRequest(200, ['x'.repeat(1024 * 1024), 'overflow']) });
    await assert.rejects(async () => (await large('https://model.example.com/v1/chat/completions')).text(), { code: 'INVALID_RESPONSE' });
    const invalid = createPublicFetch({ requestImpl: fakeRequest(700, []) });
    await assert.rejects(invalid('https://model.example.com/v1/chat/completions'), { code: 'UPSTREAM_ERROR' });
    const forbidden = createPublicFetch({ requestImpl() { assert.fail('Private IP must not reach a socket'); } });
    for (const endpoint of ['https://127.0.0.1/v1', 'https://[::1]/v1', 'https://2130706433/v1', 'https://0x7f000001/v1']) {
        await assert.rejects(forbidden(endpoint), { code: 'INVALID_PROVIDER' });
    }
});

test('personal model uses the public transport with the supplied key and never falls back to the site client', async () => {
    let seen;
    const client = createModelClient({ resourceRoot: path.resolve(__dirname, '../skill/acm-trainer'),
        fetchImpl() { assert.fail('Personal call must not use site client'); },
        personalFetchImpl: createPublicFetch({ requestImpl: fakeRequest(200, [JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer()) } }],
        })], (url, options) => { seen = { url: url.href, headers: options.headers }; }) }),
    });
    const result = await client.generate(request(), personalModelConfig(config()));
    assert.equal(result.mode, 'solve');
    assert.equal(seen.url, 'https://model.example.com/v1/chat/completions');
    assert.equal(seen.headers.Authorization, 'Bearer private-user-key');
    const denied = createModelClient({ resourceRoot: path.resolve(__dirname, '../skill/acm-trainer'),
        personalFetchImpl: async () => new Response('private-user-key upstream detail', { status: 401 }),
    });
    await assert.rejects(denied.generate(request(), personalModelConfig(config())), error => {
        assert.equal(error.code, 'UPSTREAM_AUTH'); assert.match(error.message, /个人 API/);
        assert.ok(!error.message.includes('private-user-key')); return true;
    });
});

test('HTTPS streaming preserves SSE type, applies backpressure and cancels or aborts the active body', async () => {
    for (const action of ['cancel', 'abort', 'close']) {
        let response, destroyed = false, paused = false, resumed = false;
        const fetch = createPublicFetch({ requestImpl: (_url, _options, receive) => {
            const req = new EventEmitter(); req.end = () => queueMicrotask(() => {
                response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'text/event-stream' };
                response.destroy = () => { destroyed = true; }; response.pause = () => { paused = true; }; response.resume = () => { resumed = true; };
                receive(response); response.emit('data', Buffer.from('data: first\n\n'));
            }); return req;
        } });
        const controller = new AbortController(); const result = await fetch('https://fixture.example.com/v1', { signal: controller.signal });
        assert.equal(result.headers.get('content-type'), 'text/event-stream'); assert.equal(paused, true);
        const reader = result.body.getReader(); const first = await reader.read(); assert.equal(Buffer.from(first.value).toString(), 'data: first\n\n'); assert.equal(resumed, true);
        if (action === 'cancel') { await reader.cancel(); assert.equal(destroyed, true); }
        else {
            const pending = reader.read();
            if (action === 'abort') controller.abort(); else response.emit('close');
            await assert.rejects(pending);
            if (action === 'abort') assert.equal(destroyed, true);
        }
    }
    const abort = new AbortController(); abort.abort();
    const fetch = createPublicFetch({ requestImpl() { assert.fail('Already aborted requests must not create sockets'); } });
    await assert.rejects(fetch('https://fixture.example.com/v1', { signal: abort.signal }), { name: 'AbortError' });
});
