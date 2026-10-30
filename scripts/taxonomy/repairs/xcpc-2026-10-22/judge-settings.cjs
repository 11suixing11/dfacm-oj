/* Preserve all LOJ 532 cases by correcting the worker's configured case cap. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const yaml = require('js-yaml');
const root = process.env.XCPC_REPAIR_ROOT || '/root/backups/xcpc-repair-20261022';
const file = '/root/.hydro/judge.yaml';
const action = process.env.XCPC_REPAIR_ACTION || 'audit';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
(async () => {
    const raw = fs.readFileSync(file), cfg = yaml.load(raw.toString('utf8'));
    const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    const worker = processes.find(p => /hydrojudge|hydro-judge/.test(p.name));
    if (!worker || worker.pm2_env.status !== 'online') throw new Error('Live judge worker missing');
    console.log('XCPC_JUDGE_SETTINGS', JSON.stringify({ name: worker.name, status: worker.pm2_env.status, testcasesMax: cfg.testcases_max, totalTimeLimit: cfg.total_time_limit, execPath: worker.pm2_env.pm_exec_path, args: worker.pm2_env.args, configFile: worker.pm2_env.CONFIG_FILE, overrideFile: worker.pm2_env.OVERRIDE_CONFIG }));
    if (action !== 'apply') return;
    if (cfg.testcases_max >= 200) { console.log('XCPC_JUDGE_SETTINGS_ALREADY_APPLIED'); return; }
    if (cfg.testcases_max !== 120 || cfg.total_time_limit < 400) throw new Error('Unexpected worker limits; reassess before changing');
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const db = client.db('hydro');
        const queued = await db.collection('task').countDocuments({ type: 'judge' });
        const pending = await db.collection('record').countDocuments({ status: { $in: [0,20,21,22,23,24,25] } });
        if (queued || pending) throw new Error('Wait for the judge to drain before restarting');
        const next = raw.toString('utf8').replace(/^testcases_max: 120\s*$/m, 'testcases_max: 200');
        if (next === raw.toString('utf8') || yaml.load(next).testcases_max !== 200) throw new Error('Exact setting replacement failed');
        const backup = path.join(root, 'judge-before-' + new Date().toISOString().replace(/[:.]/g, '-') + '.yaml');
        const fd = fs.openSync(backup, 'wx', 0o600);
        try { fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        if (sha(fs.readFileSync(file)) !== sha(raw)) throw new Error('Concurrent judge setting edit');
        const tmp = file + '.xcpc-next';
        fs.writeFileSync(tmp, next, { mode: fs.statSync(file).mode & 0o777 });
        fs.renameSync(tmp, file);
        execFileSync('pm2', ['restart', worker.name], { stdio: 'pipe' });
        const report = { at: new Date().toISOString(), backup, beforeSha256: sha(raw), afterSha256: sha(Buffer.from(next)), before: 120, after: 200, worker: worker.name, queueBefore: queued, pendingBefore: pending };
        fs.writeFileSync(path.join(root, 'judge-settings-apply-result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
        console.log('XCPC_JUDGE_SETTINGS_APPLIED', JSON.stringify({ before: 120, after: 200, worker: worker.name, backup }));
    } finally { await client.close(); }
})().catch(error => { console.error('XCPC_ERROR', error.message); process.exitCode = 1; });
