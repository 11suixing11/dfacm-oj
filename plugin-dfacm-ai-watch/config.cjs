'use strict';

const { submissionTime } = require('./time.cjs');

const RETENTION_DAYS = 30;
const RESERVED_CONTESTS = new Set(['000000000000000000000000', '000000000000000000000001']);
const RID = /^[a-f0-9]{24}$/i;

class WatchError extends Error {
    constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

function integer(value, fallback, min, max, name) {
    if (value === undefined || value === '') return fallback;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
        throw new WatchError('INVALID_CONFIG', `${name} 必须是 ${min}–${max} 的整数。`);
    }
    return Number(value);
}

function configFromEnv(env = process.env) {
    const domains = String(env.DFACM_AI_WATCH_DOMAINS ?? 'system').split(',').map(v => v.trim()).filter(Boolean);
    if (!domains.length || domains.length > 20 || domains.some(v => !/^[a-zA-Z0-9_\-.]{1,80}$/.test(v))) {
        throw new WatchError('INVALID_CONFIG', 'DFACM_AI_WATCH_DOMAINS 需要明确的域 ID，最多 20 个。');
    }
    const scope = env.DFACM_AI_WATCH_SCOPE || 'contests';
    if (!['contests', 'all'].includes(scope)) throw new WatchError('INVALID_CONFIG', '监测范围只能是 contests 或 all。');
    const contests = String(env.DFACM_AI_WATCH_CONTESTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (contests.length > 100 || contests.some(v => !RID.test(v) || RESERVED_CONTESTS.has(v))) {
        throw new WatchError('INVALID_CONFIG', '比赛白名单需要有效的 24 位比赛 ID。');
    }
    const intervalMs = integer(env.DFACM_AI_WATCH_INTERVAL_MS, 2000, 500, 10000, '扫描间隔');
    return Object.freeze({
        enabled: env.DFACM_AI_WATCH_ENABLED !== '0', domains: [...new Set(domains)], scope,
        contests: [...new Set(contests)],
        retentionDays: integer(env.DFACM_AI_WATCH_RETENTION_DAYS, RETENTION_DAYS, 1, 90, '保留天数'),
        intervalMs, tickBudgetMs: Math.max(intervalMs, 1500),
        batchSize: integer(env.DFACM_AI_WATCH_BATCH_SIZE, 100, 10, 500, '补扫批量'),
        sourceLookbackMs: 600000, repairLookbackMs: 600000, retainedReconcileMs: 60000, leaseMs: 60000, maxAttempts: 3,
        maxCodeBytes: 65536, historyLimit: 20, peerLimit: 100,
    });
}

function recordId(record) { return String(record?._id || '').toLowerCase(); }
function submittedAt(record) {
    return submissionTime(record)?.lower || null;
}
function eligible(record, config) {
    if (!record || !config.enabled || !config.domains.includes(record.domainId) || !RID.test(recordId(record))) return false;
    if (!Number.isSafeInteger(record.uid) || record.uid <= 0 || !Number.isSafeInteger(record.pid) || record.pid <= 0) return false;
    const contest = record.contest ? String(record.contest).toLowerCase() : null;
    if (contest && (!RID.test(contest) || RESERVED_CONTESTS.has(contest))) return false;
    if (record.hackTarget || record.input) return false;
    if (config.scope === 'contests' && !contest) return false;
    if (config.contests.length && (!contest || !config.contests.includes(contest))) return false;
    return true;
}

function listFilters(input = {}) {
    const priority = String(input.priority || ''); const review = String(input.review || '');
    const contest = String(input.contest || '').toLowerCase(); const cursor = String(input.cursor || '').toLowerCase();
    if (priority && !['high', 'medium', 'low', 'insufficient'].includes(priority)) throw new WatchError('INVALID_FILTER', '复核优先级无效。');
    if (review && !['pending', 'cleared', 'escalated'].includes(review)) throw new WatchError('INVALID_FILTER', '复核状态无效。');
    if (contest && !RID.test(contest)) throw new WatchError('INVALID_FILTER', '比赛 ID 无效。');
    if (cursor && !RID.test(cursor)) throw new WatchError('INVALID_FILTER', '分页游标无效。');
    return { priority, review, contest, cursor,
        uid: integer(input.uid, null, 1, 2147483647, 'UID'),
        days: integer(input.days, 1, 1, 7, '查询天数'),
        limit: integer(input.limit, 50, 1, 100, '分页条数'),
    };
}

module.exports = { WatchError, RID, RESERVED_CONTESTS, configFromEnv, integer, recordId, submittedAt, eligible, listFilters };
