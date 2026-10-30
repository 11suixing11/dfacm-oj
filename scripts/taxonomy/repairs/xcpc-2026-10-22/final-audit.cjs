/* Read-only live audit, plus exact recovery of this repair's local evidence flags. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { MongoClient, ObjectId } = require('mongodb');
const yaml = require('js-yaml');
const root = '/root/backups/xcpc-repair-20261022';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
module.exports = (async () => {
    const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'inventory.json.gz'))));
    const current = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(process.env.XCPC_REPAIR_ROOT, 'inventory.json.gz'))));
    if (JSON.stringify(baseline.plan.dag) !== JSON.stringify(current.plan.dag)) throw new Error('XCPC training order changed');
    if (current.problems.length !== 108) throw new Error('Wrong problem count');
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const db = client.db('hydro');
        const contest = new ObjectId('000000000000000000000002');
        const counters = [];
        const files = [];
        for (const row of current.problems) {
            const old = baseline.problems.find(r => r.docId === row.docId);
            const live = await db.collection('document').findOne({ domainId: 'system', docType: 10, docId: row.docId });
            if (!old || !live || row.title !== old.title || row.order !== old.order) throw new Error('Problem identity changed');
            if (row.configError || row.renderError) throw new Error('Problem rendering/config error ' + row.docId);
            if (row.fileAudit.some(f => f.error || !f.sizeMatches || !f.sha256)) throw new Error('Missing/corrupt file ' + row.docId);
            const cfgFile = row.fileAudit.find(f => f.kind === 'testdata' && f.name === 'config.yaml');
            if (cfgFile && cfgFile.sha256 !== sha(row.config)) throw new Error('Config file/field mismatch ' + row.docId);
            if (JSON.stringify(live.config) !== JSON.stringify(row.config) || sha(live.content) !== row.contentSha256) throw new Error('Snapshot changed after audit ' + row.docId);
            const immutable = ['title', 'owner', 'domainId', 'docType', 'docId', 'tag', 'hidden', 'difficulty'];
            if (immutable.some(k => JSON.stringify(old[k]) !== JSON.stringify(live[k]))) throw new Error('Unexpected identity/metadata edit ' + row.docId);
            counters.push({ pid: row.docId, before: { nSubmit: old.nSubmit, nAccept: old.nAccept },
                after: { nSubmit: live.nSubmit, nAccept: live.nAccept }, unchanged: old.nSubmit === live.nSubmit && old.nAccept === live.nAccept });
            files.push({ order: row.order, pid: row.docId, contentSha256: row.contentSha256, cases: row.parsedConfig.count,
                files: row.fileAudit.map(f => ({ kind: f.kind, name: f.name, size: f.size, sha256: f.sha256 })) });
        }
        const checkpoints = [];
        const leftover = [];
        for (const filename of fs.readdirSync(root).filter(n => n.endsWith('-judge-state.json'))) {
            const label = filename.slice(0, -'-judge-state.json'.length);
            const stateFile = path.join(root, filename), resultFile = path.join(root, label + '-judge-results.json');
            const states = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            const results = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : [];
            let corrected = 0;
            for (const state of states) {
                const rid = new ObjectId(state.rid);
                const exists = await db.collection('record').countDocuments({ _id: rid, domainId: 'system', pid: state.pid, uid: 3, contest });
                const tasks = await db.collection('task').countDocuments({ rid });
                if (exists || tasks || !state.cleaned) leftover.push({ label, pid: state.pid, recordCount: exists, taskCount: tasks, stateCleaned: state.cleaned });
                if (!exists && !tasks && state.cleaned) {
                    for (const result of results.filter(r => r.rid === state.rid)) {
                        // An SSH disconnect may leave an earlier saved duplicate result
                        // unmarked. The exact cleaned state plus absence of that rid/task
                        // is sufficient to correct the local evidence, without DB writes.
                        if (!result.cleaned) { result.cleaned = true; corrected++; }
                        if (result.countersUnchanged === undefined) {
                            const live = await db.collection('document').findOne({ domainId: 'system', docType: 10, docId: state.pid });
                            result.countersUnchanged = state.before.nSubmit === live.nSubmit && state.before.nAccept === live.nAccept;
                        }
                    }
                }
            }
            if (corrected) write(resultFile, results);
            checkpoints.push({ label, stateCount: states.length, resultCount: results.length, correctedEvidenceFlags: corrected,
                allStatesCleaned: states.every(s => s.cleaned), allResultsCleaned: results.every(r => r.cleaned),
                results: results.map(r => ({ order: r.order, pid: r.pid, codeSha: r.codeSha, status: r.status, score: r.score,
                    cases: r.cases, acceptedCases: r.acceptedCases, time: r.time, memory: r.memory, passed: r.passed,
                    cleaned: r.cleaned, countersUnchanged: r.countersUnchanged, at: r.at })) });
        }
        const configDoc = await db.collection('system').findOne({ _id: 'config' });
        const builtin = yaml.load(configDoc.value).hydrojudge;
        const standalone = yaml.load(fs.readFileSync('/root/.hydro/judge.yaml', 'utf8'));
        const limits = { builtin: { testcasesMax: builtin?.testcases_max, totalTimeLimit: builtin?.total_time_limit },
            standalone: { testcasesMax: standalone.testcases_max, totalTimeLimit: standalone.total_time_limit } };
        if (limits.builtin.testcasesMax < 200 || limits.standalone.testcasesMax < 200 || limits.builtin.totalTimeLimit < 600 || limits.standalone.totalTimeLimit < 600) throw new Error('Judge caps reverted');
        const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).map(p => ({ name: p.name, status: p.pm2_env.status }));
        const queue = await db.collection('task').countDocuments({ type: 'judge' });
        const pending = await db.collection('record').countDocuments({ status: { $in: [0, 20, 21, 22, 23, 24, 25] } });
        const report = { at: new Date().toISOString(), planUnchanged: true, problemCount: current.problems.length,
            baselineCases: baseline.problems.reduce((v, r) => v + r.parsedConfig.count, 0),
            finalCases: current.problems.reduce((v, r) => v + r.parsedConfig.count, 0),
            fileCount: current.problems.reduce((v, r) => v + r.fileAudit.length, 0),
            counters, checkpoints, leftover, limits, processes, queue, pending, problems: files };
        write(path.join(process.env.XCPC_REPAIR_ROOT, 'final-audit.json'), report);
        console.log('XCPC_FINAL_AUDIT', JSON.stringify({ problems: report.problemCount, cases: report.finalCases,
            addedCases: report.finalCases - report.baselineCases, files: report.fileCount,
            countersChanged: counters.filter(r => !r.unchanged).map(r => r.pid), leftover: leftover.length, limits, queue, pending }));
        if (leftover.length) throw new Error('Exact repair verification records/tasks remain');
        console.log('XCPC_FINAL_AUDIT_COMPLETE');
    } finally { await client.close(); }
})();
