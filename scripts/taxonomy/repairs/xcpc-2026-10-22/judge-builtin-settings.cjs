/* Guarded config-store update; restart only after all judge records drain. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { MongoClient, BSON } = require('mongodb');
const { execFileSync } = require('node:child_process');
const root = process.env.XCPC_REPAIR_ROOT || '/root/backups/xcpc-repair-20261022';
module.exports = (async () => {
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const db = client.db('hydro'), coll = db.collection('system');
        const doc = await coll.findOne({ _id: 'config' });
        const cfg = yaml.load(doc.value);
        console.log('XCPC_BUILTIN_CONFIG_LIMITS', JSON.stringify({ testcasesMax: cfg.hydrojudge?.testcases_max ?? 100, totalTimeLimit: cfg.hydrojudge?.total_time_limit ?? 60 }));
        if (process.env.XCPC_REPAIR_ACTION !== 'apply') return;
        const queued = await db.collection('task').countDocuments({ type: 'judge' });
        const pending = await db.collection('record').countDocuments({ status: { $in: [0,20,21,22,23,24,25] } });
        if (queued || pending) throw new Error('Wait for active submissions before reloading');
        if (cfg.hydrojudge?.testcases_max === 200 && cfg.hydrojudge?.total_time_limit === 600) { console.log('XCPC_BUILTIN_CONFIG_ALREADY_APPLIED'); return; }
        if (cfg.hydrojudge?.testcases_max !== undefined || cfg.hydrojudge?.total_time_limit !== undefined) throw new Error('Unexpected explicit builtin limits');
        const legacy = await coll.find({ _id: { $in: ['hydrojudge.testcases_max', 'hydrojudge.total_time_limit'] } }).toArray();
        const backup = path.join(root, 'builtin-config-before-' + Date.now() + '.json');
        const fd = fs.openSync(backup, 'wx', 0o600);
        try { fs.writeFileSync(fd, BSON.EJSON.stringify({ doc, legacy })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        cfg.hydrojudge = { ...(cfg.hydrojudge || {}), testcases_max: 200, total_time_limit: 600 };
        const next = yaml.dump(cfg);
        const r = await coll.updateOne({ _id: 'config', value: doc.value }, { $set: { value: next } });
        if (r.matchedCount !== 1) throw new Error('Concurrent main config edit');
        for (const old of legacy) {
            const expected = old._id.endsWith('testcases_max') ? 200 : 600;
            if (old.value === expected) await coll.deleteOne({ _id: old._id, value: expected });
        }
        execFileSync('pm2', ['restart', 'hydrooj'], { stdio: 'pipe' });
        const sha = s => crypto.createHash('sha256').update(s).digest('hex');
        const report = { at: new Date().toISOString(), backup, beforeSha256: sha(doc.value), afterSha256: sha(next), testcasesMax: 200, totalTimeLimit: 600, queueBefore: queued, pendingBefore: pending };
        fs.writeFileSync(path.join(root, 'judge-builtin-settings-apply-result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
        console.log('XCPC_BUILTIN_CONFIG_APPLIED', JSON.stringify({ testcasesMax: 200, totalTimeLimit: 600, backup }));
    } finally { await client.close(); }
})();
