'use strict';

// Mistake book storage for swpu-train. Pure logic module: the mongodb
// collection is injected so node:test can run it without hydrooj.
//
// Status codes mirror @hydrooj/common 0.0.11 (Hydro 5.0.7): only real
// user-facing failures (WA/TLE/MLE/OLE/RE/CE) are collected. SE, Canceled,
// Hacked, FormatError etc. are not learner mistakes and never appear here.

const STATUS_ACCEPTED = 1;
const COLLECT_STATUSES = new Set([2, 3, 4, 5, 6, 7]);
// RECORD_PRETEST / RECORD_GENERATE pseudo-contests (hydrooj src/model/record.ts).
const RESERVED_CONTESTS = new Set(['000000000000000000000000', '000000000000000000000001']);
const MARKER_PID = 0;

const STATUS_LABELS = Object.freeze({ 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE', 7: 'CE' });
const STATUS_TEXTS = Object.freeze({
    2: '答案错误', 3: '超出时间限制', 4: '超出内存限制', 5: '输出超出限制', 6: '运行错误', 7: '编译错误',
});

// Review reason categories selectable on the mistakes page.
const REASONS = Object.freeze(['idea', 'boundary', 'complexity', 'implement', 'misread', 'other']);
const NOTE_MAX_LENGTH = 2000;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const BACKFILL_SCAN_DEFAULT = 300;

function validTarget(domainId, uid, pid) {
    return typeof domainId === 'string' && domainId.length > 0 && domainId.length <= 100
        && Number.isSafeInteger(uid) && uid > 0
        && Number.isSafeInteger(pid) && pid > 0;
}

function validFilter(filter) {
    return ['open', 'done', 'all'].includes(filter) ? filter : 'open';
}

function createMistakeStore(collection, options = {}) {
    const now = options.now || (() => new Date());

    // Handles Hydro's `record/change` event. Only judge-end payloads mutate
    // the store; progress, submission-creation, rejudge-reset and cancel
    // broadcasts are ignored, so a rejudge can never briefly mark a mistake
    // resolved with a stale AC.
    async function onRecordChange(rdoc, body) {
        if (!body || body.key !== 'end') return false;
        if (!rdoc || !validTarget(rdoc.domainId, rdoc.uid, rdoc.pid)) return false;
        if (rdoc.contest && RESERVED_CONTESTS.has(String(rdoc.contest))) return false;
        if (rdoc.status === STATUS_ACCEPTED) return resolve(rdoc.domainId, rdoc.uid, rdoc.pid, rdoc._id);
        if (!COLLECT_STATUSES.has(rdoc.status)) return false;
        const at = now();
        await collection.updateOne(
            { domainId: rdoc.domainId, uid: rdoc.uid, pid: rdoc.pid },
            {
                $set: {
                    status: rdoc.status, rid: rdoc._id ?? null, lastAt: at, resolved: false, updatedAt: at,
                },
                $unset: { resolvedAt: '', resolvedRid: '' },
                $inc: { attempts: 1 },
                $setOnInsert: {
                    domainId: rdoc.domainId, uid: rdoc.uid, pid: rdoc.pid, firstAt: at, reason: '', note: '',
                },
            },
            { upsert: true },
        );
        return true;
    }

    // An AC only resolves an existing entry; problems never failed are not
    // mistake-book material and must not create documents.
    async function resolve(domainId, uid, pid, rid) {
        if (!validTarget(domainId, uid, pid)) return false;
        const at = now();
        const res = await collection.updateOne(
            { domainId, uid, pid, resolved: { $ne: true } },
            { $set: { resolved: true, resolvedAt: at, resolvedRid: rid ?? null, updatedAt: at } },
        );
        return (res.modifiedCount || 0) > 0;
    }

    async function list(domainId, uid, raw = {}) {
        const filter = validFilter(raw.filter);
        const pageSize = Number.isSafeInteger(raw.pageSize) && raw.pageSize > 0
            ? Math.min(raw.pageSize, PAGE_SIZE_MAX) : PAGE_SIZE_DEFAULT;
        const total = await collection.countDocuments(queryFor(domainId, uid, filter));
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const page = Number.isSafeInteger(raw.page) && raw.page > 0 ? Math.min(raw.page, pages) : 1;
        const items = await collection.find(queryFor(domainId, uid, filter))
            .sort({ lastAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
        return {
            filter, page, pages, pageSize, total, items,
        };
    }

    function queryFor(domainId, uid, filter) {
        const query = { domainId, uid, pid: { $ne: MARKER_PID } };
        if (filter === 'open') query.resolved = { $ne: true };
        if (filter === 'done') query.resolved = true;
        return query;
    }

    async function update(domainId, uid, pid, patch = {}) {
        if (!validTarget(domainId, uid, pid)) throw new Error('目标题目无效。');
        const $set = {};
        const $unset = {};
        if (patch.reason !== undefined) {
            if (!REASONS.includes(patch.reason)) throw new Error('错误原因不在可选范围内。');
            $set.reason = patch.reason;
        }
        if (patch.note !== undefined) {
            if (typeof patch.note !== 'string') throw new Error('复盘笔记必须是文本。');
            const note = patch.note.trim();
            if (note.length > NOTE_MAX_LENGTH) throw new Error(`复盘笔记最长 ${NOTE_MAX_LENGTH} 字。`);
            $set.note = note;
        }
        if (patch.resolved !== undefined) {
            $set.resolved = !!patch.resolved;
            if (patch.resolved) $set.resolvedAt = now();
            else Object.assign($unset, { resolvedAt: '', resolvedRid: '' });
        }
        if (!Object.keys($set).length) throw new Error('没有需要保存的修改。');
        $set.updatedAt = now();
        const update = Object.keys($unset).length ? { $set, $unset } : { $set };
        // validTarget guarantees pid > 0, so the pid:0 sync marker can never match.
        const res = await collection.updateOne({ domainId, uid, pid }, update);
        return (res.matchedCount || 0) > 0;
    }

    async function remove(domainId, uid, pid) {
        if (!validTarget(domainId, uid, pid)) throw new Error('目标题目无效。');
        const res = await collection.deleteOne({ domainId, uid, pid });
        return (res.deletedCount || 0) > 0;
    }

    async function countOpen(domainId, uid) {
        return collection.countDocuments({ domainId, uid, pid: { $ne: MARKER_PID }, resolved: { $ne: true } });
    }

    async function isSynced(domainId, uid) {
        return !!await collection.findOne({ domainId, uid, pid: MARKER_PID });
    }

    // One-time (per user) import of recent failed non-contest submissions.
    // `records` must be newest-first [{ pid, status, rid, at }]; `acPids` marks
    // entries the user has since solved. Existing entries keep their live
    // counters — backfill only inserts missing ones and applies AC resolution.
    async function backfill(domainId, uid, records, acPids = new Set()) {
        if (typeof domainId !== 'string' || !Number.isSafeInteger(uid) || uid <= 0) {
            throw new Error('回填目标无效。');
        }
        const byPid = new Map();
        for (const record of Array.isArray(records) ? records : []) {
            if (!record || !Number.isSafeInteger(record.pid) || record.pid <= 0) continue;
            if (!COLLECT_STATUSES.has(record.status)) continue;
            const at = record.at instanceof Date ? record.at : now();
            const entry = byPid.get(record.pid);
            if (entry) {
                entry.attempts += 1;
                entry.firstAt = at; // records arrive newest-first
            } else {
                byPid.set(record.pid, {
                    pid: record.pid, attempts: 1, status: record.status, rid: record.rid ?? null, lastAt: at, firstAt: at,
                });
            }
        }
        const at = now();
        let inserted = 0;
        let resolvedCount = 0;
        for (const entry of byPid.values()) {
            const ac = acPids.has(entry.pid);
            const res = await collection.updateOne(
                { domainId, uid, pid: entry.pid },
                {
                    $setOnInsert: {
                        domainId,
                        uid,
                        pid: entry.pid,
                        status: entry.status,
                        rid: entry.rid,
                        attempts: entry.attempts,
                        firstAt: entry.firstAt,
                        lastAt: entry.lastAt,
                        reason: '',
                        note: '',
                        resolved: ac,
                        updatedAt: at,
                    },
                },
                { upsert: true },
            );
            if (res.upsertedCount) {
                inserted += 1;
                if (ac) resolvedCount += 1;
            } else if (ac && await resolve(domainId, uid, entry.pid, entry.rid)) {
                resolvedCount += 1;
            }
        }
        await collection.updateOne(
            { domainId, uid, pid: MARKER_PID },
            { $set: { syncedAt: at } },
            { upsert: true },
        );
        return { scanned: Array.isArray(records) ? records.length : 0, collected: inserted, resolved: resolvedCount };
    }

    return {
        onRecordChange,
        resolve,
        list,
        update,
        remove,
        countOpen,
        isSynced,
        backfill,
        MARKER_PID,
    };
}

module.exports = {
    createMistakeStore,
    COLLECT_STATUSES,
    RESERVED_CONTESTS,
    STATUS_LABELS,
    STATUS_TEXTS,
    REASONS,
    NOTE_MAX_LENGTH,
    BACKFILL_SCAN_DEFAULT,
};
