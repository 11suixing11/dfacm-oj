'use strict';

const DAY = 86400000;
const millis = value => value == null || value === '' ? NaN : new Date(value).getTime();
const second = (lower, origin) => ({ precision: 'second', origin, lower: new Date(lower), upper: new Date(lower + 1000) });

// Hydro 5.0.7 exposes no verified millisecond creation timestamp here. Neither
// judgeAt, firstSeenAt nor arbitrary createdAt fields establish submission time.
function submissionTime(record) {
    const id = String(record?._id || '');
    if (/^[a-f0-9]{24}$/i.test(id)) return second(parseInt(id.slice(0, 8), 16) * 1000, 'objectId');
    const saved = record?.submissionTime;
    const lower = millis(saved?.lower); const upper = millis(saved?.upper);
    if (saved?.precision === 'second' && ['objectId', 'legacy-submittedAt'].includes(saved.origin)
        && Number.isFinite(lower) && lower % 1000 === 0 && upper === lower + 1000) return second(lower, saved.origin);
    const legacy = millis(record?.submittedAt);
    if (Number.isFinite(legacy)) return second(Math.floor(legacy / 1000) * 1000, 'legacy-submittedAt');
    if (/^[a-f0-9]{24}$/i.test(record?.rid || '')) return second(parseInt(record.rid.slice(0, 8), 16) * 1000, 'objectId');
    return null;
}

function sourceTiming(completedAt, time) {
    const completed = millis(completedAt); const lower = millis(time?.lower); const upper = millis(time?.upper);
    if (![completed, lower, upper].every(Number.isFinite) || upper <= lower) return 'unknown';
    if (completed < lower) return 'earlier';
    return completed < upper ? 'uncertain' : 'later';
}

function sourceWindow(time) {
    // An invalid/absent interval produces an empty query, never a broad lookup.
    return time ? { $gte: new Date(millis(time.lower) - DAY), $lt: new Date(millis(time.upper)) }
        : { $gte: new Date(0), $lt: new Date(0) };
}

module.exports = { submissionTime, sourceTiming, sourceWindow };
