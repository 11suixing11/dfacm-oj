/* Sequential real-judge verification using the reserved internal contest. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { ObjectId } = require('mongodb');
const record = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/record').default;
const problem = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/problem').default;
const task = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/task').default;
const root = process.env.TRAINING_REPAIR_ROOT || '/root/backups/lanqiao-repair-20261022';
const inventory = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'inventory.json.gz'))));
const batch = JSON.parse(fs.readFileSync(process.env.TRAINING_JUDGE_BATCH || path.join(root, 'judge-batch.json'), 'utf8'));
const label = process.env.TRAINING_JUDGE_LABEL || 'reference';
const stateFile = path.join(root, label + '-judge-state.json');
const resultsFile = path.join(root, label + '-judge-results.json');
const contest = new ObjectId('000000000000000000000002');
const uid = 3;
const waiting = new Set([0, 20, 21, 22, 23, 24, 25]);
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

module.exports = (async () => {
    if (process.env.NODE_APP_INSTANCE === '0') throw new Error('Verification must not start a builtin judge');
    const states = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : [];
    const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : [];
    const scope = new Map(inventory.problems.map(p => [p.docId, p]));
    for (const entry of batch.sort((a, b) => scope.get(a.pid).order - scope.get(b.pid).order)) {
        const doc = scope.get(entry.pid);
        if (!doc || entry.code.length < 10) throw new Error('Invalid TRAINING verification target');
        const codeSha = sha(entry.code);
        const expected = entry.expectedStatus || 1;
        const isExpected = r => r.pid === entry.pid && r.codeSha === codeSha && r.passed
            && r.status === expected && (entry.expectedCases === undefined || r.cases === entry.expectedCases);
        if (results.some(r => isExpected(r) && r.cleaned)) continue;
        let state = states.find(s => s.pid === entry.pid && s.codeSha === codeSha && !s.cleaned);
        if (!state) {
            const before = await problem.get(doc.domainId, doc.docId, undefined, true);
            const rid = await record.add(doc.domainId, doc.docId, uid, 'cc.cc17o2', entry.code, false, { type: 'judge', contest });
            state = { pid: entry.pid, codeSha, rid: rid.toHexString(), before: { nSubmit: before.nSubmit, nAccept: before.nAccept }, queued: false, cleaned: false };
            states.push(state); write(stateFile, states);
        }
        const rid = new ObjectId(state.rid);
        const selector = { _id: rid, domainId: doc.domainId, pid: doc.docId, uid, contest };
        let current = await record.coll.findOne(selector);
        if (!current) {
            // A dropped SSH output pipe may stop the CLI just after deletion.
            // Recover only an already saved final result with no remaining task
            // and the exact unchanged counters; never create a duplicate record.
            const saved = results.find(r => r.rid === state.rid && isExpected(r));
            const after = await problem.get(doc.domainId, doc.docId, undefined, true);
            const unchanged = state.before.nSubmit === after.nSubmit && state.before.nAccept === after.nAccept;
            if (!saved || await task.count({ rid }) || !unchanged) throw new Error('Exact verification record missing without recoverable evidence');
            state.cleaned = true;
            for (const result of results.filter(r => r.rid === state.rid)) {
                result.cleaned = true; result.countersUnchanged = true;
            }
            write(stateFile, states); write(resultsFile, results);
            console.log('TRAINING_JUDGE_CLEANUP_RECOVERED', doc.order, doc.docId);
            continue;
        }
        if (!state.queued) {
            if (!(await task.count({ rid })) && current.status === 0) await record.judge(doc.domainId, rid, -1000, { detail: true });
            state.queued = true; write(stateFile, states);
        }
        for (let attempt = 0; attempt < 150; attempt++) {
            current = await record.coll.findOne(selector);
            if (current && !waiting.has(current.status)) break;
            if (attempt % 15 === 0) console.log('TRAINING_JUDGE_WAIT', doc.order, doc.docId, current?.status);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (!current || waiting.has(current.status)) throw new Error('Judge pending; resume the exact same record ' + doc.docId);
        write(path.join(root, `${label}-judge-${doc.docId}-${codeSha.slice(0, 12)}.json`), current);
        const result = { order: doc.order, chapter: doc.chapter, pid: doc.docId, title: doc.title, codeSha, rid: state.rid,
            status: current.status, score: current.score, time: current.time, memory: current.memory,
            cases: (current.testCases || []).length, acceptedCases: (current.testCases || []).filter(c => c.status === 1).length,
            judgeTexts: current.judgeTexts, compilerTexts: current.compilerTexts, at: new Date().toISOString(), cleaned: false,
        };
        const passedStatus = current.status === expected;
        result.passed = passedStatus && (expected !== 1 || current.score === 100);
        if (doc.parsedConfig.type !== 'remote_judge' && entry.expectedCases !== undefined && result.cases !== entry.expectedCases) result.passed = false;
        results.push(result); write(resultsFile, results);
        console.log('TRAINING_JUDGE_RESULT', JSON.stringify(result));
        await task.deleteMany({ rid, domainId: doc.domainId, uid });
        if ((await record.coll.deleteOne(selector)).deletedCount !== 1) throw new Error('Exact verification cleanup failed');
        const after = await problem.get(doc.domainId, doc.docId, undefined, true);
        result.countersUnchanged = state.before.nSubmit === after.nSubmit && state.before.nAccept === after.nAccept;
        result.cleaned = state.cleaned = true;
        write(stateFile, states); write(resultsFile, results);
        console.log('TRAINING_JUDGE_CLEANED', doc.order, doc.docId, 'COUNTERS_UNCHANGED', result.countersUnchanged);
        if (!result.passed || !result.countersUnchanged) throw new Error('Verification failed ' + doc.docId);
    }
    console.log('TRAINING_JUDGE_BATCH_COMPLETE', batch.length);
})();
