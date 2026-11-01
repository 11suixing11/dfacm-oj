'use strict';

const { randomBytes, createHash } = require('node:crypto');
const { WatchError, RID, eligible, recordId, submittedAt } = require('./config.cjs');
const { fingerprint, languageFamily } = require('./detector.cjs');

const DAY = 86400000;
const PROJECTION = { _id: 1, domainId: 1, uid: 1, pid: 1, contest: 1, lang: 1, code: 1, status: 1, hackTarget: 1, input: 1 };
const unwrap = result => result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;
const queryRows = (collection, query, sort, limit, projection) => collection.find(query, projection ? { projection } : {})
    .sort(sort).limit(limit).maxTimeMS(5000).toArray();
const regexEscape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function publicReport(report, detail = false) {
    if (!report) return null;
    const result = {
        rid: report.rid, domainId: report.domainId, uid: report.uid, pid: report.pid, contest: report.contest,
        lang: report.lang, verdict: report.verdict, submittedAt: report.submittedAt,
        state: report.state, priority: report.analysis?.priority || 'insufficient', score: report.analysis?.score || 0,
        signals: (report.analysis?.signals || []).map(signal => ({ kind: signal.kind, title: signal.title, strength: signal.strength })),
        review: report.review, analyzedAt: report.analyzedAt || null,
    };
    if (detail) { result.analysis = report.analysis || null; result.reviewHistory = report.reviewHistory || []; }
    return result;
}

function createMongoStore({ reports, sources, state, jobs, records, problemModel, objectId, config, now = Date.now }) {
    const owner = `${process.pid}:${randomBytes(8).toString('hex')}`;
    const active = () => new Date(now());
    const reportKey = (domainId, rid) => `${domainId}:${rid}`;
    const expires = () => new Date(now() + config.retentionDays * DAY);
    const scanTag = createHash('sha256').update(JSON.stringify({ scope: config.scope, contests: config.contests })).digest('hex').slice(0, 12);
    const idAt = millis => objectId(Math.max(0, Math.floor(millis / 1000)).toString(16).padStart(8, '0') + '0000000000000000');

    async function getRecord(domainId, rid) {
        if (!RID.test(rid)) return null;
        return records.findOne({ domainId, _id: objectId(rid) }, { projection: PROJECTION, maxTimeMS: 5000 });
    }

    async function ensureRecord(record) {
        if (!eligible(record, config)) return false;
        const rid = recordId(record); const key = reportKey(record.domainId, rid);
        const existing = await reports.findOne({ _id: key }, { projection: { _id: 1 }, maxTimeMS: 5000 });
        if (existing) return false;
        const doc = {
            _id: key, domainId: record.domainId, rid, uid: record.uid, pid: record.pid,
            contest: record.contest ? String(record.contest).toLowerCase() : null,
            lang: record.lang || '', verdict: record.status, submittedAt: submittedAt(record), firstSeenAt: active(), expireAt: expires(),
            fingerprint: fingerprint(record.code, record.lang), state: 'pending', attempts: 0, nextAttemptAt: active(),
            review: { status: 'pending', note: '', reviewer: null, updatedAt: null, revision: 0 }, reviewHistory: [],
        };
        try { await reports.insertOne(doc); return true; }
        catch (error) { if (error?.code === 11000) return false; throw error; }
    }

    async function archiveJob(job, domainId) {
        if (job.type !== 'job' || job.status !== 'ready' || job.answer?.mode !== 'solve' || job.answer?.status !== 'ok'
            || (job.answer.level && job.answer.level !== 'solution') || !job.target?.startsWith('p:')) return false;
        const scope = String(job.scope || '').split(':');
        if (scope.length !== 2 || scope[0] !== domainId || !/^[1-9]\d*$/.test(scope[1])) return false;
        const uid = Number(scope[1]);
        if (!Number.isSafeInteger(uid) || typeof job.answer.code !== 'string' || !job.answer.code.trim()
            || Buffer.byteLength(job.answer.code, 'utf8') > config.maxCodeBytes) return false;
        const key = `job:${job._id}`;
        if (await sources.findOne({ _id: key }, { projection: { _id: 1 }, maxTimeMS: 5000 })) return false;
        const pdoc = await problemModel.get(domainId, job.target.slice(2));
        if (!Number.isSafeInteger(pdoc?.docId) || pdoc.docId <= 0) return false;
        const completedAt = new Date(job.completedAt);
        if (!Number.isFinite(completedAt.getTime()) || completedAt.getTime() > now()) return false;
        const doc = { _id: key, jobId: job._id, domainId, uid, pid: pdoc.docId, mode: 'solve',
            completedAt, expireAt: expires(), fingerprint: fingerprint(job.answer.code, 'cpp'), code: job.answer.code };
        try { await sources.insertOne(doc); return true; }
        catch (error) { if (error?.code === 11000) return false; throw error; }
    }

    async function captureSources(domainId) {
        const key = `source-scan:${domainId}`;
        const checkpoint = await state.findOne({ _id: key });
        const lower = new Date(Math.max(now() - config.sourceLookbackMs, checkpoint?.completedAt ? new Date(checkpoint.completedAt).getTime() : 0));
        const query = { type: 'job', status: 'ready', scope: new RegExp(`^${regexEscape(domainId)}:[1-9]\\d*$`),
            'answer.mode': 'solve', completedAt: { $gte: lower, $lte: active() }, expireAt: { $gt: active() } };
        if (checkpoint?.completedAt && lower.getTime() === new Date(checkpoint.completedAt).getTime()) {
            query.$or = [{ completedAt: { $gt: lower } }, { completedAt: lower, _id: { $gt: checkpoint.jobId || '' } }];
        }
        const rows = await queryRows(jobs, query, { completedAt: 1, _id: 1 }, config.batchSize,
            { _id: 1, type: 1, status: 1, scope: 1, target: 1, answer: 1, completedAt: 1 });
        let count = 0;
        for (const job of rows) {
            if (await archiveJob(job, domainId)) count++;
            // Monotonic checkpoint: a slower Hydro worker must not move it back.
            try {
                await state.updateOne({ _id: key, $or: [{ completedAt: { $exists: false } }, { completedAt: { $lt: job.completedAt } },
                    { completedAt: job.completedAt, jobId: { $lte: String(job._id) } }] },
                { $set: { completedAt: job.completedAt, jobId: String(job._id), expireAt: expires() } }, { upsert: true });
            } catch (error) { if (error?.code !== 11000) throw error; }
        }
        return { captured: count, scanned: rows.length };
    }

    async function scan(domainId) {
        const key = `record-scan:${domainId}:${scanTag}`;
        const checkpoint = await state.findOne({ _id: key });
        const floor = String(idAt(now() - (checkpoint ? config.retentionDays * DAY : config.sourceLookbackMs)));
        const cursor = checkpoint?.rid && checkpoint.rid > floor ? checkpoint.rid : floor;
        const query = { domainId, _id: { $gt: objectId(cursor) }, uid: { $gt: 0 }, pid: { $gt: 0 } };
        if (config.contests.length) query.contest = { $in: config.contests.map(objectId) };
        else if (config.scope === 'contests') query.contest = { $exists: true, $ne: null, $nin: ['000000000000000000000000', '000000000000000000000001'].map(objectId) };
        const rows = await queryRows(records, query, { _id: 1 }, config.batchSize, PROJECTION);
        let queued = 0;
        for (const record of rows) if (await ensureRecord(record)) queued++;
        const rid = rows.length ? recordId(rows[rows.length - 1]) : cursor;
        try { await state.updateOne({ _id: key, $or: [{ rid: { $exists: false } }, { rid: { $lte: rid } }] },
            { $set: { rid, updatedAt: active(), expireAt: expires() } }, { upsert: true }); }
        catch (error) { if (error?.code !== 11000) throw error; }
        return { scanned: rows.length, queued };
    }

    async function pending() {
        return queryRows(reports, { domainId: { $in: config.domains }, expireAt: { $gt: active() },
            nextAttemptAt: { $lte: active() }, $or: [{ state: 'pending', attempts: { $lt: config.maxAttempts } }, { state: 'analyzing', leaseUntil: { $lte: active() } }] },
        { submittedAt: 1, rid: 1 }, Math.min(config.batchSize, 20));
    }

    async function claim(report) {
        if (report.attempts >= config.maxAttempts) {
            await reports.updateOne({ _id: report._id, state: 'analyzing', leaseUntil: { $lte: active() } },
                { $set: { state: 'failed', error: '分析中断且已达重试上限，未作出结论。' }, $unset: { owner: '', leaseUntil: '' } });
            return null;
        }
        return unwrap(await reports.findOneAndUpdate({ _id: report._id, expireAt: { $gt: active() }, attempts: { $lt: config.maxAttempts },
            nextAttemptAt: { $lte: active() }, $or: [{ state: 'pending' }, { state: 'analyzing', leaseUntil: { $lte: active() } }] },
        { $set: { state: 'analyzing', owner, leaseUntil: new Date(now() + config.leaseMs) }, $inc: { attempts: 1 } }, { returnDocument: 'after' }));
    }

    function snapshot(record) {
        return { domainId: record.domainId, rid: recordId(record), uid: record.uid, pid: record.pid,
            contest: record.contest ? String(record.contest).toLowerCase() : null, submittedAt: submittedAt(record),
            fingerprint: fingerprint(record.code, record.lang) };
    }

    async function context(report) {
        const before = { $lt: objectId(report.rid) };
        // Global source scans are bounded. Fetch this contestant/problem's
        // completed jobs too, so a large scan backlog cannot hide a source.
        const pdoc = await problemModel.get(report.domainId, report.pid);
        const targets = [...new Set([`p:${report.pid}`, ...(pdoc?.pid ? [`p:${pdoc.pid}`] : [])])];
        const relevantJobs = await queryRows(jobs, { type: 'job', status: 'ready', scope: `${report.domainId}:${report.uid}`,
            target: { $in: targets }, 'answer.mode': 'solve', expireAt: { $gt: active() },
            completedAt: { $gte: new Date(new Date(report.submittedAt).getTime() - DAY), $lte: report.submittedAt } },
        { completedAt: -1 }, 20, { _id: 1, type: 1, status: 1, scope: 1, target: 1, answer: 1, completedAt: 1 });
        for (const job of relevantJobs) await archiveJob(job, report.domainId);
        const [modelSources, recentPeers, recentHistory] = await Promise.all([
            queryRows(sources, { domainId: report.domainId, uid: report.uid, pid: report.pid, mode: 'solve', expireAt: { $gt: active() },
                completedAt: { $gte: new Date(new Date(report.submittedAt).getTime() - DAY), $lte: report.submittedAt } },
            { completedAt: -1 }, 20, { code: 0 }),
            queryRows(records, { domainId: report.domainId, pid: report.pid, uid: { $ne: report.uid, $gt: 0 },
                contest: report.contest ? objectId(report.contest) : null, _id: before }, { _id: -1 }, config.peerLimit, PROJECTION),
            queryRows(records, { domainId: report.domainId, uid: report.uid, pid: { $ne: report.pid, $gt: 0 }, _id: before,
                contest: { $nin: ['000000000000000000000000', '000000000000000000000001'].map(objectId) } },
            { _id: -1 }, config.historyLimit * 3, PROJECTION),
        ]);
        const distinct = new Set(); const history = [];
        for (const record of recentHistory) {
            if (distinct.has(record.pid) || languageFamily(record.lang) !== report.fingerprint.family || record.hackTarget || record.input) continue;
            const item = snapshot(record);
            if (item.fingerprint.unavailable || item.fingerprint.tokenCount < 80) continue;
            distinct.add(record.pid); history.push(item);
            if (history.length >= config.historyLimit) break;
        }
        return { current: report, sources: modelSources, peers: recentPeers.filter(v => !v.hackTarget && !v.input).map(snapshot), history };
    }

    async function complete(report, analysis) {
        return reports.updateOne({ _id: report._id, state: 'analyzing', owner, leaseUntil: { $gt: active() } },
            { $set: { state: 'ready', analysis, analyzedAt: active() }, $unset: { owner: '', leaseUntil: '', error: '' } });
    }
    async function fail(report) {
        await reports.updateOne({ _id: report._id, state: 'analyzing', owner },
            { $set: { state: report.attempts >= config.maxAttempts ? 'failed' : 'pending',
                error: '分析暂时失败，未作出结论。', nextAttemptAt: new Date(now() + config.intervalMs * Math.max(1, report.attempts)) },
            $unset: { owner: '', leaseUntil: '' } });
    }
    async function updateVerdict(record) {
        if (!eligible(record, config)) return;
        await reports.updateOne({ _id: reportKey(record.domainId, recordId(record)), expireAt: { $gt: active() } }, { $set: { verdict: record.status } });
    }

    async function get(domainId, rid) {
        if (!RID.test(rid)) throw new WatchError('INVALID_RECORD', '提交 ID 无效。');
        return reports.findOne({ _id: reportKey(domainId, rid), expireAt: { $gt: active() } }, { maxTimeMS: 5000 });
    }

    async function list(domainId, filters) {
        const base = { domainId, expireAt: { $gt: active() }, submittedAt: { $gte: new Date(now() - filters.days * DAY) } };
        if (filters.contest) base.contest = filters.contest;
        if (filters.uid) base.uid = filters.uid;
        const query = { ...base };
        if (filters.priority) query['analysis.priority'] = filters.priority;
        if (filters.review) query['review.status'] = filters.review;
        if (filters.cursor) query.rid = { $lt: filters.cursor };
        const [rows, summary] = await Promise.all([
            queryRows(reports, query, { rid: -1 }, filters.limit + 1, { fingerprint: 0, reviewHistory: 0 }),
            reports.aggregate([{ $match: base }, { $group: { _id: { priority: '$analysis.priority', state: '$state', review: '$review.status' }, count: { $sum: 1 } } }], { maxTimeMS: 5000 }).toArray(),
        ]);
        const stats = { total: 0, high: 0, medium: 0, low: 0, insufficient: 0, pending: 0, cleared: 0, escalated: 0, analyzing: 0, failed: 0 };
        for (const group of summary) {
            stats.total += group.count;
            const priority = group._id.priority || 'insufficient'; if (priority in stats) stats[priority] += group.count;
            if (group._id.review in stats) stats[group._id.review] += group.count;
            if (['pending', 'analyzing'].includes(group._id.state)) stats.analyzing += group.count;
            if (group._id.state === 'failed') stats.failed += group.count;
        }
        return { reports: rows.slice(0, filters.limit).map(v => publicReport(v)), stats,
            nextCursor: rows.length > filters.limit ? rows[filters.limit - 1].rid : null };
    }

    async function review(domainId, rid, { status, note, revision, reviewer }) {
        if (!['pending', 'cleared', 'escalated'].includes(status)) throw new WatchError('INVALID_REVIEW', '复核状态无效。');
        if (typeof note !== 'string' || note.trim().length > 500 || !Number.isSafeInteger(revision) || revision < 0) {
            throw new WatchError('INVALID_REVIEW', '复核备注最多 500 字，且需要有效版本号。');
        }
        if (status !== 'pending' && note.trim().length < 3) throw new WatchError('REVIEW_NOTE_REQUIRED', '请填写至少 3 字的复核依据。');
        if (!Number.isSafeInteger(reviewer) || reviewer <= 0) throw new WatchError('FORBIDDEN', '需要管理员身份。', 403);
        const report = await get(domainId, rid);
        if (!report) throw new WatchError('NOT_FOUND', '记录不存在或已过期。', 404);
        const event = { status, note: note.trim(), reviewer, updatedAt: active(), revision: revision + 1 };
        const result = unwrap(await reports.findOneAndUpdate({ _id: report._id, expireAt: { $gt: active() }, 'review.revision': revision },
            { $set: { review: event }, $push: { reviewHistory: { $each: [event], $slice: -20 } } }, { returnDocument: 'after' }));
        if (!result) throw new WatchError('REVIEW_CONFLICT', '另一位管理员已更新复核，请刷新后再保存。', 409);
        return publicReport(result, true);
    }

    async function evidence(domainId, rid) {
        const report = await get(domainId, rid);
        if (!report) throw new WatchError('NOT_FOUND', '记录不存在或已过期。', 404);
        const record = await getRecord(domainId, rid);
        const code = typeof record?.code === 'string' && Buffer.byteLength(record.code) <= config.maxCodeBytes ? record.code : null;
        const assistant = report.analysis?.signals.find(v => v.kind === 'assistant_match');
        const peer = report.analysis?.signals.find(v => v.kind === 'peer_similarity');
        const result = { code, assistant: null, peer: null };
        if (assistant) {
            const source = await sources.findOne({ _id: assistant.reference.sourceId, domainId, uid: report.uid, pid: report.pid,
                expireAt: { $gt: active() }, completedAt: { $lte: report.submittedAt }, mode: 'solve' }, { maxTimeMS: 5000 });
            if (source) result.assistant = { code: source.code, jobId: source.jobId, completedAt: source.completedAt };
        }
        if (peer && RID.test(peer.reference.rid)) {
            const reference = await getRecord(domainId, peer.reference.rid);
            if (reference && reference.pid === report.pid && reference.uid === peer.reference.uid && reference.uid !== report.uid
                && (reference.contest ? String(reference.contest).toLowerCase() : null) === report.contest
                && typeof reference.code === 'string' && Buffer.byteLength(reference.code) <= config.maxCodeBytes) {
                result.peer = { code: reference.code, rid: peer.reference.rid, uid: reference.uid };
            }
        }
        return { report: publicReport(report, true), evidence: result };
    }

    async function heartbeat(health) {
        for (const domainId of config.domains) await state.updateOne({ _id: `worker:${domainId}:${owner}` },
            { $set: { domainId, owner, lastTickAt: active(), ...health, expireAt: new Date(now() + 60000) } }, { upsert: true });
    }
    async function health(domainId) {
        const workers = await queryRows(state, { domainId, lastTickAt: { $exists: true }, expireAt: { $gt: active() } }, { lastTickAt: -1 }, 20);
        const fresh = workers.filter(worker => now() - new Date(worker.lastTickAt).getTime() < Math.max(15000, config.intervalMs * 5));
        return { enabled: config.enabled, online: config.enabled && fresh.some(v => !v.error),
            lastTickAt: workers[0]?.lastTickAt || null, error: fresh.length > 0 && fresh.every(v => v.error) ? '后台分析暂时失败，正在重试。' : null,
            scope: config.scope, contests: config.contests, retentionDays: config.retentionDays, intervalMs: config.intervalMs };
    }

    return { ensureRecord, getRecord, archiveJob, captureSources, scan, pending, claim, context, complete, fail, updateVerdict,
        get, list, review, evidence, heartbeat, health, owner };
}

module.exports = { createMongoStore, publicReport, queryRows, unwrap };
