'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAccountHandlers, accountCsrf } = require('../account-http.cjs');
const { createAccountProviderStore, ACCOUNT_KEY_HEADER } = require('../account-store.cjs');
const { memoryCollection } = require('./fake-collection.cjs');

function fixture() {
    const collection = memoryCollection(); const rates = [];
    const store = createAccountProviderStore({ collection, loadKey: async () => Buffer.alloc(32, 9) });
    class Handler {
        constructor() {
            this.user = { _id: 42, hasPriv: () => true }; this.session = {}; this.args = {};
            this.request = { body: {}, headers: {} }; this.response = { headers: {}, addHeader: (name, value) => { this.response.headers[name] = value; } };
        }
        async limitRate(...args) { rates.push(args); }
        url(name, args) { assert.equal(name, 'home_settings'); return `/home/settings/${args.category}`; }
    }
    return { collection, store, rates, ...createAccountHandlers({ Handler, store, loginPrivilege: 8 }) };
}
async function initial(f) { const handler = new f.AccountConfigHandler(); await handler.get(); return handler; }
function save(handler, overrides = {}) {
    handler.request.body = { action: 'save', csrf: accountCsrf(handler), revision: '', provider: 'custom',
        base_url: 'https://model.example.com/v1', model: 'http-account-model', ...overrides };
    handler.args = { ...handler.request.body }; handler.request.headers[ACCOUNT_KEY_HEADER] = 'http-account-key';
}

test('account GET authenticates and returns only private no-store metadata with UID-bound CSRF', async () => {
    const f = fixture(); const handler = await initial(f);
    assert.equal(handler.response.body.ok, true); assert.equal(handler.response.body.config.configured, false);
    assert.match(handler.response.body.csrf, /^[a-f0-9]{64}$/);
    assert.equal(handler.response.headers['Cache-Control'], 'private, no-store'); assert.equal(handler.response.headers.Vary, 'Cookie');
    assert.equal(f.rates.length, 0); assert.equal(f.collection.docs.size, 0);
    const first = accountCsrf(handler); assert.equal(accountCsrf(handler), first);
    handler.user._id = 43; assert.notEqual(accountCsrf(handler), first);
});

test('save reads credentials from its private header, scrubs it, and persists for a new session without returning it', async () => {
    const f = fixture(); const handler = await initial(f); save(handler); await handler.post({ uid: 43 });
    assert.equal(handler.response.body.ok, true); assert.equal(handler.response.body.config.uid, 42);
    assert.equal(handler.request.headers[ACCOUNT_KEY_HEADER], undefined);
    assert.equal((await f.store.getModelConfig(42)).apiKey, 'http-account-key');
    assert.equal((await f.store.getSettings(43)).configured, false);
    const otherDevice = await initial(f); assert.equal(otherDevice.response.body.config.model, 'http-account-model');
    for (const value of [handler.response.body, otherDevice.response.body, [...f.collection.docs.values()], handler.args]) {
        assert.ok(!JSON.stringify(value).includes('http-account-key'));
    }
    assert.deepEqual(f.rates[0], ['dfacm_ai_settings', 60, 20, 'u42']);
});

test('missing or cross-account CSRF is rejected before writes and key headers are still scrubbed', async () => {
    for (const scenario of ['missing', 'changed-user']) {
        const f = fixture(); const handler = await initial(f); save(handler);
        if (scenario === 'missing') delete handler.request.body.csrf;
        else handler.user._id = 43;
        await handler.post(); assert.equal(handler.response.status, 403); assert.equal(handler.response.body.code, 'CSRF');
        assert.equal(handler.request.headers[ACCOUNT_KEY_HEADER], undefined); assert.equal(f.rates.length, 0); assert.equal(f.collection.docs.size, 0);
    }
});

test('anonymous and impersonated requests cannot read or mutate account settings', async () => {
    for (const scenario of ['guest', 'privilege', 'sudo']) {
        const f = fixture(); const handler = new f.AccountConfigHandler(); save(handler);
        if (scenario === 'guest') handler.user._id = 1;
        else if (scenario === 'privilege') handler.user.hasPriv = () => false;
        else handler.session.sudoUid = 43;
        await handler.get(); assert.equal(handler.response.body.code, 'AI_ACCOUNT_REQUIRED');
        await handler.post(); assert.equal(handler.response.body.code, 'AI_ACCOUNT_REQUIRED');
        assert.equal(handler.request.headers[ACCOUNT_KEY_HEADER], undefined); assert.equal(f.collection.docs.size, 0);
    }
});

test('body credentials and malformed headers are rejected and removed from request arguments', async () => {
    for (const name of ['api_key', 'apiKey', 'key']) {
        const f = fixture(); const handler = await initial(f); save(handler, { [name]: 'accidental-body-secret' });
        await handler.post(); assert.equal(handler.response.body.code, 'INVALID_PROVIDER');
        assert.equal(handler.request.body[name], undefined); assert.equal(handler.args[name], undefined);
        assert.ok(!JSON.stringify(handler.response.body).includes('accidental-body-secret')); assert.equal(f.collection.docs.size, 0);
    }
    const f = fixture(); const handler = await initial(f); save(handler);
    handler.request.headers[ACCOUNT_KEY_HEADER] = ['one', 'two']; await handler.post();
    assert.equal(handler.response.body.code, 'INVALID_PROVIDER'); assert.equal(f.collection.docs.size, 0);
});

test('blank-key model updates work while stale saves and stale deletions return safe conflicts', async () => {
    const f = fixture(); const handler = await initial(f); save(handler); await handler.post();
    const revision = handler.response.body.config.revision;
    save(handler, { revision, model: 'updated-model' }); delete handler.request.headers[ACCOUNT_KEY_HEADER]; await handler.post();
    assert.equal(handler.response.body.ok, true); assert.equal((await f.store.getModelConfig(42)).apiKey, 'http-account-key');
    save(handler, { revision }); await handler.post(); assert.equal(handler.response.status, 409);
    assert.equal(handler.response.body.code, 'AI_CONFIG_CONFLICT');
    handler.request.body = { action: 'clear', csrf: accountCsrf(handler), revision }; await handler.post();
    assert.equal(handler.response.body.code, 'AI_CONFIG_CONFLICT');
    handler.request.body.revision = (await f.store.getSettings(42)).revision; await handler.post();
    assert.equal(handler.response.body.config.configured, false); assert.equal(f.collection.docs.size, 0);
});

test('unexpected backend errors do not serialize database details or key material', async () => {
    const f = fixture(); f.collection.findOne = async () => { throw new Error('http-account-key private database URL'); };
    const handler = await initial(f); assert.equal(handler.response.body.code, 'AI_SETTINGS_FAILED');
    assert.equal(handler.response.status, 500); assert.ok(!JSON.stringify(handler.response.body).includes('http-account-key'));
});

test('AI settings link redirects to native account settings with its AI anchor', async () => {
    const f = fixture(); const handler = new f.AccountSettingsRedirectHandler(); await handler.get();
    assert.equal(handler.response.redirect, '/home/settings/account#ai'); assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
});
