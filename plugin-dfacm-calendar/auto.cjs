'use strict';

const { readFile } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { createCachedSource, TTL_MS, STALE_MAX_MS, RETRY_MS } = require('./cache.cjs');
const { validateEvent } = require('./calendar.cjs');

const CST = 8 * 3600000;
const WINDOW_PAST_MS = 12 * 3600000;
const WINDOW_FUTURE_MS = 60 * 86400000;
const CAP = 180;
const CF_API = 'https://codeforces.com/api/contest.list';
const ATCODER_API = 'https://kenkoooo.com/atcoder/resources/contests.json';
const UA = 'DFACM-Calendar/1.36.0 (+https://dfacm.website)';

const disabled = () => process.env.SWPU_CALENDAR_AUTO_OFF === '1';
const cstIso = (seconds) => new Date(seconds * 1000 + CST).toISOString().split('.')[0] + '+08:00';
const inWindow = (start, at, end = start) => Number.isFinite(start) && Number.isFinite(end)
    && end >= at - WINDOW_PAST_MS && start < at + WINDOW_FUTURE_MS;

function normalizeCf(payload, at) {
    const rows = payload && payload.status === 'OK' && Array.isArray(payload.result) ? payload.result : [];
    return rows.filter((row) => row && Number.isSafeInteger(row.id) && Number.isFinite(row.startTimeSeconds)
        && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0
        && ['BEFORE', 'CODING', 'FINISHED', 'SYSTEM_TEST', 'PENDING_SYSTEM_TEST'].includes(row.phase)
        && inWindow(row.startTimeSeconds * 1000, at, (row.startTimeSeconds + row.durationSeconds) * 1000))
        .map((row) => ({
            id: `cf-${row.id}`, name: String(row.name || '').trim() || `Codeforces Contest ${row.id}`,
            type: 'cf', source: 'cf', form: 'online', location: '', note: '', regDeadline: null,
            start: cstIso(row.startTimeSeconds), end: cstIso(row.startTimeSeconds + row.durationSeconds),
            url: `https://codeforces.com/contests/${row.id}`,
        }));
}

function normalizeAtcoder(payload, at) {
    return (Array.isArray(payload) ? payload : []).filter((row) => row && typeof row.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(row.id)
        && Number.isFinite(row.start_epoch_second) && Number.isFinite(row.duration_second) && row.duration_second > 0
        && inWindow(row.start_epoch_second * 1000, at, (row.start_epoch_second + row.duration_second) * 1000))
        .map((row) => ({
            id: `atcoder-${row.id}`, name: String(row.title || '').trim() || `AtCoder ${row.id}`,
            type: 'atcoder', source: 'atcoder', form: 'online', location: '', note: '', regDeadline: null,
            start: cstIso(row.start_epoch_second), end: cstIso(row.start_epoch_second + row.duration_second),
            url: `https://atcoder.jp/contests/${row.id}`,
        }));
}

let sources;
let sourceClock = Date.now;
function getSources() {
    if (sources) return sources;
    const legacyFile = process.env.SWPU_CALENDAR_AUTO_CACHE || join(__dirname, 'auto-cache.json');
    const stem = basename(legacyFile, '.json');
    sources = [
        { id: 'cf', label: 'Codeforces', url: CF_API, normalize: normalizeCf },
        { id: 'atcoder', label: 'AtCoder', url: ATCODER_API, normalize: normalizeAtcoder },
    ].map(({ id, label, url, normalize }) => createCachedSource({
        id, label, file: join(dirname(legacyFile), `${stem}-${id}.json`), now: sourceClock,
        validate: (event) => event && event.type === id && validateEvent(event, 0).ok,
        async legacy() {
            const disk = JSON.parse(await readFile(legacyFile, 'utf8'));
            return { fetchedAt: disk.fetchedAt, events: Array.isArray(disk.events) ? disk.events.filter((event) => event.type === id).map((event) => ({ ...event, source: id })) : [] };
        },
        async fetchEvents(at) {
            const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new Error(`Calendar upstream HTTP ${response.status}`);
            const payload = await response.json();
            if (id === 'cf' ? !payload || payload.status !== 'OK' || !Array.isArray(payload.result) : !Array.isArray(payload)) {
                throw new Error('Invalid calendar upstream response');
            }
            return normalize(payload, at).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, CAP);
        },
    }));
    return sources;
}

async function getAutoEvents(at = sourceClock()) {
    if (disabled()) return [];
    const results = await Promise.all(getSources().map((source) => source.get(at)));
    return results.flat().filter((event) => inWindow(Date.parse(event.start), at, Date.parse(event.end) || Date.parse(event.start)))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

function getAutoStatus() {
    return getSources().map((source) => disabled() ? { ...source.status(), status: 'disabled' } : source.status());
}
function warmup() { if (!disabled()) getAutoEvents().catch(() => {}); }
function __resetForTest(now = Date.now) { sources = null; sourceClock = now; }
async function __settledForTest() { await Promise.all(getSources().map((source) => source.settled())); }

module.exports = { CAP, TTL_MS, STALE_MAX_MS, RETRY_MS, WINDOW_PAST_MS, WINDOW_FUTURE_MS,
    cstIso, inWindow, normalizeCf, normalizeAtcoder, getAutoEvents, getAutoStatus, warmup, __resetForTest, __settledForTest };
