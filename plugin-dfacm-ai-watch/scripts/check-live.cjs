'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function checkLive(api, root) {
    const { configFromEnv } = require(path.join(root, 'config.cjs'));
    const { createMongoStore } = require(path.join(root, 'store.cjs'));
    const config = configFromEnv(); assert.ok(config.enabled, 'AI watch collector is disabled in the server environment');
    const reports = api.db.collection('dfacm_ai_watch_reports'); const sources = api.db.collection('dfacm_ai_watch_sources');
    const state = api.db.collection('dfacm_ai_watch_state');
    for (const collection of [reports, sources, state]) {
        const indexes = await collection.listIndexes().toArray();
        assert.ok(indexes.some(item => item.name === 'expiry' && item.expireAfterSeconds === 0), 'TTL index missing');
        if (collection === reports) {
            assert.ok(indexes.some(item => item.name === 'domain_rid' && item.unique), 'Unique report index missing');
            assert.ok(indexes.some(item => item.name === 'pending') && indexes.some(item => item.name === 'contest'), 'Report query indexes missing');
        }
        if (collection === sources) assert.ok(indexes.some(item => item.name === 'source_context'), 'Source comparison index missing');
    }
    const store = createMongoStore({ reports, sources, state, config, records: api.RecordModel.coll,
        jobs: api.db.collection('dfacm_assistant_jobs'), problemModel: api.ProblemModel, objectId: id => new api.ObjectId(id) });
    const health = [];
    for (const domain of config.domains) { const value = await store.health(domain); assert.ok(value.online, 'Live collector heartbeat is unavailable'); health.push({ domain, online: true }); }
    const menu = global.Hydro.ui.getNodes('ControlPanel').find(item => item.name === 'dfacm_ai_watch');
    assert.ok(menu, 'AI watch is missing from the management panel');
    const checkDomain = process.env.AI_WATCH_CHECK_DOMAIN || config.domains[0];
    const checkAdmin = Number(process.env.AI_WATCH_CHECK_ADMIN_UID || 2);
    assert.ok(Number.isSafeInteger(checkAdmin) && checkAdmin > 0, 'Invalid verification administrator UID');
    const user = await api.UserModel.getById(checkDomain, checkAdmin);
    assert.equal(Boolean(menu.checker({ user })), true); assert.equal(Boolean(menu.checker({ user: { hasPriv: () => false } })), false);
    const result = { phase: 'live', collectorOnline: true, managementMenu: true, ttlIndexes: true, scope: config.scope, health };
    fs.writeFileSync(path.join(root, 'live-ok.json'), JSON.stringify(result), { mode: 0o600 });
    console.log('AI_WATCH_LIVE_OK: management entry, administrator access and live collector heartbeat verified.');
};
