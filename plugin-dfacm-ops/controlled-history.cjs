'use strict';
const { createHash } = require('node:crypto');
const INSTALLATION = Symbol.for('dfacm.ops.controlled-history.v1');
// Exact Hydro 5.0.7 esbuild CLI/runtime method fingerprints. A different
// loader/core implementation requires its own native review and acceptance.
const SHAPES = {
    _next: '3632250da73ab85f5c6df6afd373f236d69d57035b4986ab65230d5df486aa53',
    _end: '259fd78155f4cb67b101ab843c3196b2e0ddb7521ae58cacbd292383c153ae3e',
    next: 'd2a133d0d998fdf2496b9cb805d4cb4cd340c1b030e4b03ebcb81d764e3d6e28',
    end: '6534ff0fa33572fddc6bc83b919b984bb9495632196b9383ef0253a28d9f0180',
};
const sha = text => createHash('sha256').update(text).digest('hex');
const same = (a, b) => Object.keys(b).every(k => b[k]?.toHexString
    ? typeof a?.[k]?.toHexString === 'function' && a[k].toHexString() === b[k].toHexString()
    : a?.[k] === b[k]);
function getCapability(api) {
    const proto = api.JudgeResultCallbackContext?.prototype;
    const state = proto?.[INSTALLATION];
    if (!state || !state.active || state.RecordModel.coll !== api.RecordModel?.coll
        || state.RecordModel.collHistory !== api.RecordModel?.collHistory || state.UserModel !== api.UserModel
        || state.ObjectId !== api.ObjectId || !Object.keys(SHAPES).every(k => proto[k] === (state.wrappers[k] || state.original[k]))) return null;
    return state.capability;
}
function installControlledHistory(api) {
    if (process.env.DFACM_CONTROLLED_HISTORY !== '1') return () => {};
    if (api.version !== '5.0.7') throw new Error('Unsupported Hydro native callback version');
    const proto = api.JudgeResultCallbackContext?.prototype;
    let state = proto?.[INSTALLATION];
    if (state) {
        if (!getCapability(api)) throw new Error('Controlled history native installation changed or incompatible');
    } else {
        if (api.version !== '5.0.7' || !proto || !Object.keys(SHAPES).every(k => typeof proto[k] === 'function'
            && sha(proto[k].toString().replace(/\s+/g, '')) === SHAPES[k])
            || typeof api.RecordModel?.coll?.updateOne !== 'function' || typeof api.RecordModel?.collHistory?.insertOne !== 'function'
            || typeof api.UserModel?.getById !== 'function' || typeof api.ObjectId !== 'function') throw new Error('Unsupported Hydro 5.0.7 native callback shape/version');
        state = { active: true, refs: 0, RecordModel: api.RecordModel, UserModel: api.UserModel, ObjectId: api.ObjectId,
            original: Object.fromEntries(Object.keys(SHAPES).map(k => [k, proto[k]])), wrappers: {}, failed: new WeakSet(), terminalStarted: new WeakSet(),
            capability: Object.freeze({ version: 1, hydroVersion: '5.0.7', ownedHistory: true, taskTypes: Object.freeze(['judge']) }) };
        for (const name of ['_next', '_end']) {
            state.wrappers[name] = async function ownedCallback(body) {
                const task = this.task;
                // Native ordinary and unrelated controlled callbacks are untouched.
                if (task?.meta?.verificationBatch === undefined && task?.meta?.verificationEntry === undefined) {
                    return state.original[name].call(this, body);
                }
                if (!(this instanceof api.JudgeResultCallbackContext) || !(this.relatedId instanceof api.ObjectId)
                    || typeof this.resolve !== 'function' || !(this.operationPromise instanceof Promise)
                    || !(this.finishPromise instanceof Promise)) throw new Error('Incompatible native controlled callback instance shape');
                if (state.failed.has(this) || state.terminalStarted.has(this)) { this.resolve(null); return; }
                // Native next/end serialize their operations. Close this context
                // before terminal I/O so queued replays cannot carry a stale
                // ownership snapshot across cleanup and a native upsert.
                if (name === '_end') state.terminalStarted.add(this);
                let exact;
                try {
                    if (!state.active || !getCapability(api)) throw new Error('Native controlled wrapper no longer installed');
                    const meta = task.meta;
                    if (task.type !== 'judge' || this.meta !== meta || meta.rejudge !== 'controlled' || !/^[a-zA-Z0-9_-]{1,100}$/.test(meta.verificationBatch || '')
                        || !/^[a-zA-Z0-9_-]{1,100}$/.test(meta.verificationEntry || '') || typeof task.domainId !== 'string'
                        || !Number.isSafeInteger(task.uid) || task.uid < 2 || !Number.isSafeInteger(task.pid)
                        || task.lang !== 'cc.cc17o2' || typeof task.code !== 'string'
                        || !task.code.startsWith(`// dfacm-verification:${meta.verificationBatch}:${meta.verificationEntry}\n`)
                        || !/^[a-f0-9]{24}$/.test(String(task.rid))) throw new Error('Controlled verification task identity mismatch');
                    const rid = new api.ObjectId(String(task.rid));
                    const recordFilter = { _id: rid, domainId: task.domainId, uid: task.uid, pid: task.pid, lang: task.lang, code: task.code };
                    const record = await api.RecordModel.coll.findOne(recordFilter);
                    const user = await api.UserModel.getById(task.domainId, task.uid);
                    if (!record || record.contest || record.files || record.rejudged || record.status !== 0 || record.judgeAt
                        || !user || user._id !== task.uid || !/^hydsvc(?:[-_]|$)/.test(user.uname || '')) throw new Error('Controlled native record/service account identity mismatch');
                    exact = recordFilter;
                    const owner = { rid, domainId: task.domainId, uid: task.uid, verificationBatch: meta.verificationBatch,
                        verificationEntry: meta.verificationEntry, verificationPid: task.pid, verificationUname: user.uname,
                        verificationCodeHash: sha(task.code), verificationAdapter: 1 };
                    // The RID retains its first callback ID durably. Reconnects cannot
                    // quietly turn a second history into a publishable result.
                    await api.RecordModel.coll.updateOne({ ...exact, dfacmVerification: { $exists: false } },
                        { $set: { dfacmVerification: { ...owner, historyId: this.relatedId } } });
                    const claim = (await api.RecordModel.coll.findOne(exact))?.dfacmVerification;
                    if (!same(claim, owner)) throw new Error('Conflicting controlled record ownership');
                    if (claim.sealed) throw new Error('Controlled history is sealed for cleanup');
                    if (String(claim.historyId) !== String(this.relatedId)) {
                        const admission = await api.RecordModel.coll.updateOne({ ...exact, 'dfacmVerification.sealed': { $ne: true } },
                            { $set: { 'dfacmVerification.ambiguous': true } });
                        if (admission.matchedCount !== 1) throw new Error('Controlled history is sealed for cleanup');
                    }
                    let history = await api.RecordModel.collHistory.findOne({ _id: this.relatedId });
                    if (!history) {
                        try { await api.RecordModel.collHistory.insertOne({ _id: this.relatedId, ...owner }); }
                        catch (error) { if (error.code !== 11000) throw error; }
                        history = await api.RecordModel.collHistory.findOne({ _id: this.relatedId });
                    }
                    if (!same(history, owner)) throw new Error('Conflicting controlled history ownership');
                    if (String(claim.historyId) !== String(this.relatedId)) {
                        await api.RecordModel.collHistory.updateOne({ _id: this.relatedId, ...owner }, { $set: { verificationConflict: true } });
                        throw new Error('Ambiguous controlled callback history; manual reconciliation required');
                    }
                    if (claim.ambiguous || claim.failed || claim.sealed) throw new Error('Controlled history requires manual reconciliation or is sealed');
                    return await state.original[name].call(this, body);
                } catch (error) {
                    // Rejecting operationPromise would leave native newTask awaiting
                    // finishPromise forever. Resolve only this controlled context;
                    // keep its artifacts/pending state, and release the consumer slot.
                    state.failed.add(this);
                    if (exact) {
                        try { await api.RecordModel.coll.updateOne({ ...exact, 'dfacmVerification.sealed': { $ne: true } }, { $set: { 'dfacmVerification.failed': true } }); } catch {}
                    }
                    this.resolve(null);
                    console.warn('swpu-ops [W] controlled verification pending/manual reconciliation:', error.message);
                }
            };
            proto[name] = state.wrappers[name];
        }
        Object.defineProperty(proto, INSTALLATION, { value: state, configurable: true });
    }
    state.refs++;
    let disposed = false;
    return () => {
        if (disposed) return; disposed = true;
        if (--state.refs) return;
        state.active = false;
        for (const name of ['_next', '_end']) if (proto[name] === state.wrappers[name]) proto[name] = state.original[name];
        if (proto[INSTALLATION] === state) delete proto[INSTALLATION];
    };
}
module.exports = { installControlledHistory, getCapability };
