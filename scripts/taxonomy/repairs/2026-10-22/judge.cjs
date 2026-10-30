/* Run in the Hydro CLI with NODE_APP_INSTANCE=problem-repair (no extra builtin judge). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { ObjectId } = require('mongodb');
const record = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/record').default;
const problem = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/problem').default;
const task = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/task').default;
const root = process.env.PROBLEM_REPAIR_ROOT || '/root/backups/problem-repair-20261022';
const batchFile = process.env.PROBLEM_REPAIR_BATCH || path.join(root, 'local-tests.json.gz');
const stateFile = path.join(root, 'local-tests-judge-state.json');
const resultFile = path.join(root, 'local-tests-judge-results.json');
// The reserved contest selects normal judging and excludes user/contest/statistic updates.
const contest = new ObjectId('000000000000000000000002');
const uid = 3;
const waiting = new Set([0, 20, 21, 22, 23, 24, 25]);
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });

module.exports = (async () => {
    if (process.env.NODE_APP_INSTANCE === '0') throw new Error('Verification CLI must not start a builtin judge');
    const bytes = fs.readFileSync(batchFile);
    const batch = JSON.parse((batchFile.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes).toString('utf8'));
    const results = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : [];
    const states = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : [];
    for (const patch of [...batch.problems].sort((a, b) => a.docId - b.docId)) {
        if (results.some(row => row.pid === patch.docId && row.status === 1 && row.cleaned)) continue;
        let state = states.find(row => row.pid === patch.docId && !row.cleaned);
        if (!state) {
            const before = await problem.get(patch.domainId, patch.docId, undefined, true);
            const code = fs.readFileSync(path.join(root, `reference-${patch.docId}.cpp`), 'utf8');
            const rid = await record.add(patch.domainId, patch.docId, uid, 'cc.cc17o2', code, false, { type: 'judge', contest });
            state = { domainId: patch.domainId, pid: patch.docId, rid: rid.toHexString(), before: { nSubmit: before.nSubmit, nAccept: before.nAccept }, queued: false, cleaned: false };
            states.push(state);
            write(stateFile, states);
        }
        const rid = new ObjectId(state.rid);
        const selector = { _id: rid, domainId: patch.domainId, pid: patch.docId, uid, contest };
        const existing = await record.coll.findOne(selector);
        if (!existing) throw new Error('Verification record disappeared ' + patch.docId);
        if (!state.queued) {
            // Check a previous queue operation before resuming after interruption.
            const queuedCount = await task.count({ rid });
            if (!queuedCount && existing.status === 0) await record.judge(patch.domainId, rid, -1000, { detail: true });
            state.queued = true;
            write(stateFile, states);
        }
        let result;
        for (let attempt = 0; attempt < 120; attempt++) {
            result = await record.coll.findOne(selector);
            if (result && !waiting.has(result.status)) break;
            if (attempt % 10 === 0) console.log('JUDGE_WAIT', patch.docId, result?.status);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (!result || waiting.has(result.status)) throw new Error('Judge still pending ' + patch.docId + '; safely resume using the same record');
        write(path.join(root, `judge-${patch.docId}-result.json`), result);
        const entry = {
            pid: patch.docId, title: patch.title, rid: state.rid, status: result.status, score: result.score,
            cases: (result.testCases || []).length, expectedCases: patch.testdataCount,
            acceptedCases: (result.testCases || []).filter(row => row.status === 1).length,
            time: result.time, memory: result.memory, judgeAt: result.judgeAt, cleaned: false,
        };
        results.push(entry);
        write(resultFile, results);
        console.log('JUDGE_RESULT', JSON.stringify(entry), 'compiler', JSON.stringify(result.compilerTexts), 'judge', JSON.stringify(result.judgeTexts));
        await task.deleteMany({ rid, domainId: patch.domainId, uid });
        const removed = await record.coll.deleteOne(selector);
        if (removed.deletedCount !== 1) throw new Error('Exact verification cleanup failed ' + patch.docId);
        const after = await problem.get(patch.domainId, patch.docId, undefined, true);
        entry.countersUnchanged = state.before.nSubmit === after.nSubmit && state.before.nAccept === after.nAccept;
        entry.cleaned = state.cleaned = true;
        write(stateFile, states);
        write(resultFile, results);
        console.log('JUDGE_CLEANED', patch.docId, 'COUNTERS_UNCHANGED', entry.countersUnchanged);
        if (result.status !== 1 || result.score !== 100 || entry.cases !== patch.testdataCount || entry.acceptedCases !== entry.cases) {
            throw new Error('Reference did not accept every repaired testcase ' + patch.docId);
        }
    }
    console.log('JUDGE_BATCH_COMPLETE', results.filter(row => row.status === 1 && row.cleaned).length, 'problems');
})();
