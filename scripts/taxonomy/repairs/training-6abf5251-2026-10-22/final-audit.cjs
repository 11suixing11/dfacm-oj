/* Read-only final audit; recover only evidence flags for exact, already-cleaned records. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { MongoClient, ObjectId } = require('mongodb');
const yaml = require('js-yaml');
const baselineRoot = '/root/backups/training-6abf5251-repair-20261022';
const root = process.env.TRAINING_REPAIR_ROOT;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
const waiting = [0, 20, 21, 22, 23, 24, 25];

module.exports = (async () => {
    if (!root || !root.startsWith(baselineRoot + '/') || path.resolve(root) !== root) throw new Error('A fresh final snapshot is required');
    const baseline = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(baselineRoot, 'inventory.json.gz'))));
    const current = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'inventory.json.gz'))));
    const ordered = inventory => inventory.problems.map(r => [r.order, r.chapter, r.docId]);
    if (current.problems.length !== 396 || JSON.stringify(ordered(current)) !== JSON.stringify(ordered(baseline))) throw new Error('Training order changed');
    if (JSON.stringify(current.plan.dag) !== JSON.stringify(baseline.plan.dag)) throw new Error('Training DAG changed');
    const originals = new Map(baseline.problems.map(r => [r.docId, r]));
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const db = client.db('hydro');
        const plan = await db.collection('document').findOne({ domainId: 'system', docType: 40, _id: new ObjectId('6abf5251aaa235606eedfb84') });
        if (!plan || JSON.stringify(plan.dag) !== JSON.stringify(current.plan.dag) || plan.title !== baseline.plan.title) throw new Error('Live training identity changed');
        const counters = [], files = [];
        for (const row of current.problems) {
            const old = originals.get(row.docId);
            const live = await db.collection('document').findOne({ domainId: 'system', docType: 10, docId: row.docId });
            if (!old || !live || row.title !== old.title || row.order !== old.order) throw new Error('Problem identity changed');
            if (row.configError || row.renderError) throw new Error('Rendering/config error ' + row.docId);
            if (row.fileAudit.some(f => f.error || f.sizeMatches !== true || !f.sha256)) throw new Error('Missing/corrupt file ' + row.docId);
            const configFile = row.fileAudit.find(f => f.kind === 'testdata' && f.name === 'config.yaml');
            if (configFile && configFile.sha256 !== sha(row.config)) throw new Error('Config file/field mismatch ' + row.docId);
            for (const key of ['content', 'html', 'config', 'data', 'additional_file']) {
                if (JSON.stringify(live[key]) !== JSON.stringify(row[key])) throw new Error('Snapshot changed after audit ' + row.docId + '/' + key);
            }
            const immutable = ['title', 'owner', 'domainId', 'docType', 'docId', 'tag', 'hidden', 'difficulty'];
            if (immutable.some(k => JSON.stringify(old[k]) !== JSON.stringify(live[k]))) throw new Error('Unexpected identity/metadata edit ' + row.docId);
            for (const solution of row.solutions) {
                const liveSolution = await db.collection('document').findOne({ _id: new ObjectId(solution._id), domainId: 'system', docType: 11, parentId: row.docId });
                if (!liveSolution || liveSolution.content !== solution.content || liveSolution.owner !== solution.owner) throw new Error('Editorial snapshot changed ' + row.docId);
            }
            counters.push({ pid: row.docId, before: { nSubmit: old.nSubmit, nAccept: old.nAccept },
                after: { nSubmit: live.nSubmit, nAccept: live.nAccept }, unchanged: old.nSubmit === live.nSubmit && old.nAccept === live.nAccept });
            files.push({ order: row.order, chapter: row.chapter, pid: row.docId, contentSha256: row.contentSha256, cases: row.parsedConfig.count,
                files: row.fileAudit.map(f => ({ kind: f.kind, name: f.name, size: f.size, sha256: f.sha256 })) });
        }
        const checkpoints = [], leftover = [];
        const contest = new ObjectId('000000000000000000000002');
        for (const filename of fs.readdirSync(baselineRoot).filter(n => n.endsWith('-judge-state.json')).sort()) {
            const label = filename.slice(0, -'-judge-state.json'.length);
            const states = JSON.parse(fs.readFileSync(path.join(baselineRoot, filename), 'utf8'));
            const resultFile = path.join(baselineRoot, label + '-judge-results.json');
            const results = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : [];
            let corrected = 0;
            for (const state of states) {
                if (!originals.has(state.pid)) throw new Error('Verification state outside training');
                const rid = new ObjectId(state.rid);
                const exists = await db.collection('record').countDocuments({ _id: rid });
                const tasks = await db.collection('task').countDocuments({ rid });
                if (exists || tasks || !state.cleaned) leftover.push({ label, pid: state.pid, recordCount: exists, taskCount: tasks, stateCleaned: state.cleaned });
                if (!exists && !tasks && state.cleaned) {
                    const live = await db.collection('document').findOne({ domainId: 'system', docType: 10, docId: state.pid });
                    const unchanged = state.before.nSubmit === live.nSubmit && state.before.nAccept === live.nAccept;
                    for (const result of results.filter(r => r.rid === state.rid)) {
                        if (result.pid !== state.pid || result.codeSha !== state.codeSha) throw new Error('Mismatched saved verification result');
                        // A disconnected CLI can save the same result twice. Exact state,
                        // no remaining record/task, and counters establish the cleanup.
                        if (!result.cleaned) { result.cleaned = true; corrected++; }
                        if (result.countersUnchanged === undefined && unchanged) { result.countersUnchanged = true; corrected++; }
                    }
                }
            }
            if (results.some(r => !states.some(s => s.rid === r.rid))) throw new Error('Result has no exact verification state');
            if (corrected) write(resultFile, results);
            checkpoints.push({ label, stateCount: states.length, resultCount: results.length, correctedEvidenceFlags: corrected,
                allStatesCleaned: states.every(s => s.cleaned), allResultsCleaned: results.every(r => r.cleaned),
                allCountersUnchanged: results.every(r => r.countersUnchanged === true),
                results: results.map(r => ({ order: r.order, pid: r.pid, codeSha: r.codeSha, status: r.status, score: r.score,
                    cases: r.cases, acceptedCases: r.acceptedCases, time: r.time, memory: r.memory, passed: r.passed,
                    cleaned: r.cleaned, countersUnchanged: r.countersUnchanged, at: r.at })) });
        }
        const reservedRecords = await db.collection('record').find({ domainId: 'system', uid: 3, contest, pid: { $in: [...originals.keys()] } }).project({ _id: 1, pid: 1, status: 1 }).toArray();
        const configDoc = await db.collection('system').findOne({ _id: 'config' });
        const builtin = yaml.load(configDoc.value).hydrojudge;
        const standalone = yaml.load(fs.readFileSync('/root/.hydro/judge.yaml', 'utf8'));
        const limits = { builtin: { testcasesMax: builtin?.testcases_max, totalTimeLimit: builtin?.total_time_limit },
            standalone: { testcasesMax: standalone.testcases_max, totalTimeLimit: standalone.total_time_limit } };
        const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).map(p => ({ name: p.name, status: p.pm2_env.status }));
        const queue = await db.collection('task').countDocuments({ type: 'judge' });
        const pending = await db.collection('record').countDocuments({ status: { $in: waiting } });
        const report = { at: new Date().toISOString(), snapshotAt: current.at, planUnchanged: true, problemCount: current.problems.length,
            baselineCases: baseline.problems.reduce((n, r) => n + r.parsedConfig.count, 0),
            finalCases: current.problems.reduce((n, r) => n + r.parsedConfig.count, 0),
            fileCount: current.problems.reduce((n, r) => n + r.fileAudit.length, 0),
            counters, checkpoints, leftover, reservedRecords, limits, processes, queue, pending, problems: files };
        write(path.join(root, 'final-audit.json'), report);
        console.log('TRAINING_FINAL_AUDIT', JSON.stringify({ problems: report.problemCount, cases: report.finalCases,
            addedCases: report.finalCases - report.baselineCases, files: report.fileCount,
            countersChanged: counters.filter(r => !r.unchanged).map(r => r.pid), leftover: leftover.length,
            reservedRecords: reservedRecords.length, limits, processes, queue, pending }));
        if (leftover.length) throw new Error('Exact repair verification records/tasks remain');
        if (checkpoints.some(p => !p.allResultsCleaned || !p.allCountersUnchanged)) throw new Error('Incomplete verification cleanup evidence');
        console.log('TRAINING_FINAL_AUDIT_COMPLETE');
    } finally { await client.close(); }
})();
