const { createHash } = require('node:crypto');
const { getCapability } = require(process.env.DFACM_CONTROLLED_HISTORY_MODULE || '../../plugin-dfacm-ops/controlled-history.cjs');
const NONFINAL = new Set([0, 20, 21, 22, 23, 24, 25]);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oid = (api, value) => new api.ObjectId(value);
function validateBatch(batch) {
    if (!batch || !/^[a-zA-Z0-9_-]{1,100}$/.test(batch.id || '') || typeof batch.domainId !== 'string'
        || !Number.isSafeInteger(batch.uid) || batch.uid < 2 || !/^hydsvc(?:[-_]|$)/.test(batch.uname || '')
        || !Array.isArray(batch.entries)) throw new Error('Batch requires id, domainId and explicit service account uid/uname');
    const ids = new Set();
    for (const entry of batch.entries) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id || '') || ids.has(entry.id)
            || !Number.isSafeInteger(entry.docId) || typeof entry.c !== 'string' || typeof entry.t !== 'string') throw new Error('Invalid or duplicate batch entry');
        ids.add(entry.id);
    }
}
async function assertCapability(api, batch) {
    validateBatch(batch);
    const cap = getCapability(api);
    if (!cap || cap.version !== 1 || cap.hydroVersion !== '5.0.7' || cap.ownedHistory !== true || !cap.taskTypes?.includes('judge')) {
        throw new Error('Controlled history ownership unavailable: Hydro 5.0.7 does not persist RID/batch association. Submission and publication blocked.');
    }
    const user = await api.UserModel.getById(batch.domainId, batch.uid);
    if (!user || user._id !== batch.uid || user.uname !== batch.uname || !/^hydsvc(?:[-_]|$)/.test(user.uname)) throw new Error('Verification service account identity mismatch');
}
async function problemIdentity(api, domainId, pid) {
    const original = await api.ProblemModel.get(domainId, pid, undefined, true);
    if (!original) throw new Error('Original problem missing');
    const source = original.reference ? await api.ProblemModel.get(original.reference.domainId, original.reference.pid, undefined, true) : original;
    if (!source) throw new Error('Referenced problem missing');
    const parsed = await api.ProblemModel.get(source.domainId, source.docId);
    // Only the locally exercised full-data task family is eligible. Remote, interactive,
    // objective, submit-answer and custom checker configurations need separate evidence.
    if (!parsed || typeof parsed.config !== 'object' || !['default', undefined].includes(parsed.config.type)
        || !['default', undefined].includes(parsed.config.checker_type) || !source.data?.length) throw new Error('Unsupported or unverified problem task type/data');
    const fields = (p) => ({ _id: String(p._id), domainId: p.domainId, docId: p.docId, pid: p.pid, reference: p.reference,
        config: p.config, data: p.data, content: p.content, owner: p.owner });
    return hash({ original: fields(original), source: fields(source) });
}
function ownership(batch, entry, rid, code) {
    return { rid, domainId: batch.domainId, uid: batch.uid, verificationBatch: batch.id, verificationEntry: entry.id,
        verificationPid: entry.docId, verificationUname: batch.uname,
        verificationCodeHash: createHash('sha256').update(code).digest('hex'), verificationAdapter: 1 };
}
async function verifySolutions(api, batch, stateStore, options = {}) {
    await assertCapability(api, batch);
    const release = options.locked ? null : await stateStore.lock();
    try {
        const digest = hash(batch);
        let state = await stateStore.load();
        if (state && (state.version !== 1 || state.digest !== digest)) throw new Error('Batch state does not match immutable input');
        if (!state) { state = { version: 1, batchId: batch.id, digest, entries: {} }; await stateStore.save(state); }
        const result = { batchId: batch.id, ready: [], pending: [], rejected: [] };
        for (const entry of batch.entries) {
            let item = state.entries[entry.id];
            let identity, invalidation;
            try { identity = await problemIdentity(api, batch.domainId, entry.docId); }
            catch (error) { invalidation = error.message; }
            if (item && identity && identity !== item.identity) invalidation = 'Original problem or testdata changed';
            // Durable owned work must be reconciled even when the current problem
            // cannot authorize new verification or publication.
            if (invalidation && (!item || !item.rid && item.phase !== 'prepared')) {
                result.rejected.push({ id: entry.id, reason: invalidation }); continue;
            }
            if (!item) {
                item = state.entries[entry.id] = { phase: 'prepared', identity,
                    code: `// dfacm-verification:${batch.id}:${entry.id}\n${entry.c}`, pid: entry.docId };
                await stateStore.save(state);
            }
            const recordFilter = { domainId: batch.domainId, uid: batch.uid, pid: entry.docId, code: item.code };
            if (!item.rid) {
                const found = await api.RecordModel.coll.find(recordFilter).toArray();
                if (found.length > 1) throw new Error('Ambiguous verification records; manual reconciliation required');
                if (!found.length && invalidation) { result.rejected.push({ id: entry.id, reason: invalidation }); continue; }
                const rid = found[0]?._id || await api.RecordModel.add(batch.domainId, entry.docId, batch.uid, 'cc.cc17o2', item.code, false, { type: 'judge' });
                item.rid = String(rid); item.phase = 'created'; await stateStore.save(state);
            }
            const rid = oid(api, item.rid);
            const exactRecord = { _id: rid, ...recordFilter };
            const owner = ownership(batch, entry, rid, item.code);
            async function reconciliationReason() {
                const record = await api.RecordModel.coll.findOne(exactRecord);
                if (record?.dfacmVerification?.ambiguous || record?.dfacmVerification?.failed) return 'Ambiguous or failed controlled callback; manual reconciliation required';
                const rows = await api.RecordModel.collHistory.find(owner).toArray();
                if (rows.length > 1 || rows.some(r => r.verificationConflict)) return 'Ambiguous controlled history; manual reconciliation required';
                const associated = await api.RecordModel.collHistory.find({ rid }).toArray();
                if (associated.some(row => !Object.entries(owner).every(([key, value]) => key === 'rid'
                    ? row.rid instanceof api.ObjectId && String(row.rid) === String(value) : row[key] === value))) {
                    return 'Conflicting controlled history ownership; manual reconciliation required';
                }
                return null;
            }
            if (item.phase === 'created') {
                if (!await api.RecordModel.coll.findOne(exactRecord)) throw new Error('Owned verification record missing');
                if (invalidation) {
                    result.pending.push({ id: entry.id, rid: item.rid, phase: item.phase, reason: invalidation + '; unscheduled record requires reconciliation' }); continue;
                }
                // An uncertain scheduling outcome is never retried blindly: native judge deletes
                // queued tasks and cannot prove a previously fetched task stopped executing.
                item.phase = 'scheduling'; await stateStore.save(state);
                await api.RecordModel.judge(batch.domainId, rid, 0, {}, { type: 'judge', rejudge: 'controlled',
                    verificationBatch: batch.id, verificationEntry: entry.id });
                item.phase = 'scheduled'; await stateStore.save(state);
            }
            if (['scheduling', 'scheduled'].includes(item.phase)) {
                const deadline = Date.now() + (options.timeoutMs ?? 180000);
                do {
                    const reason = await reconciliationReason();
                    if (reason) { result.pending.push({ id: entry.id, rid: item.rid, phase: item.phase, reason }); break; }
                    const rows = await api.RecordModel.collHistory.find(owner).toArray();
                    const terminal = rows.filter((r) => r.judgeAt && Number.isInteger(r.status) && !NONFINAL.has(r.status));
                    if (terminal.length === 1 && rows.length === 1) {
                        item.terminal = { historyId: String(terminal[0]._id), status: terminal[0].status, judgeAt: terminal[0].judgeAt,
                            score: terminal[0].score, testCases: terminal[0].testCases };
                        item.phase = 'terminal'; await stateStore.save(state); break;
                    }
                    if (Date.now() >= deadline) break;
                    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 3000));
                } while (true);
            }
            if (result.pending.some(p => p.id === entry.id)) continue;
            if (['terminal', 'cleanup-history', 'cleanup-record'].includes(item.phase)) {
                const reason = await reconciliationReason();
                if (reason) { result.pending.push({ id: entry.id, rid: item.rid, phase: item.phase, reason }); continue; }
                const record = await api.RecordModel.coll.findOne(exactRecord);
                if (record) {
                    const claimFilter = Object.fromEntries(Object.entries(owner).map(([k, v]) => ['dfacmVerification.' + k, v]));
                    const sealed = await api.RecordModel.coll.updateOne({ ...exactRecord, ...claimFilter,
                        'dfacmVerification.historyId': oid(api, item.terminal.historyId),
                        'dfacmVerification.ambiguous': { $ne: true }, 'dfacmVerification.failed': { $ne: true } },
                    { $set: { 'dfacmVerification.sealed': true } });
                    if (sealed.matchedCount !== 1) {
                        result.pending.push({ id: entry.id, rid: item.rid, phase: item.phase, reason: 'Controlled history claim changed; manual reconciliation required' }); continue;
                    }
                } else if (item.phase !== 'cleanup-record') throw new Error('Verification record ownership missing before terminal cleanup');
            }
            if (item.phase === 'terminal') {
                // Persist the exact terminal history identity before any deletion; restart
                // can repeat each deletion even if the previous receipt was not flushed.
                item.phase = 'cleanup-history'; await stateStore.save(state);
            }
            if (item.phase === 'cleanup-history') {
                await api.RecordModel.collHistory.deleteOne({ _id: oid(api, item.terminal.historyId), ...owner });
                if (await api.RecordModel.collHistory.findOne({ _id: oid(api, item.terminal.historyId) })) throw new Error('Controlled history ownership changed; cleanup incomplete');
                item.phase = 'cleanup-record'; await stateStore.save(state);
            }
            if (item.phase === 'cleanup-record') {
                await api.RecordModel.coll.deleteOne(exactRecord);
                if (await api.RecordModel.coll.findOne({ _id: rid })) throw new Error('Verification record ownership changed; cleanup incomplete');
                item.phase = 'cleaned'; await stateStore.save(state);
            }
            if (item.phase !== 'cleaned') result.pending.push({ id: entry.id, rid: item.rid, phase: item.phase, ...(invalidation ? { reason: invalidation } : {}) });
            else if (invalidation) result.rejected.push({ id: entry.id, rid: item.rid, reason: invalidation });
            else if (item.identity !== await problemIdentity(api, batch.domainId, entry.docId)) result.rejected.push({ id: entry.id, rid: item.rid, reason: 'Original problem or testdata changed' });
            else if (item.terminal.status !== 1) result.rejected.push({ id: entry.id, rid: item.rid, status: item.terminal.status, reason: 'Controlled result is not AC' });
            else result.ready.push({ ...entry, rid: item.rid, identity: item.identity });
        }
        state.lastResult = result; await stateStore.save(state);
        return result;
    } finally { if (release) await release(); }
}
module.exports = { verifySolutions, validateBatch, assertCapability, problemIdentity, hash };
