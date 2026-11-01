'use strict';

// The former AI hub is now an internal collector. Hydro reads its loopback
// API into the same cache, validation and merge path as the algorithm sources.
const { join } = require('node:path');
const { createCachedSource } = require('./cache.cjs');
const { validateEvent, SOURCE_META } = require('./calendar.cjs');

const PAGE_SIZE = 500;
const MAX_EVENTS = 20000;
const AI_TTL_MS = 5 * 60 * 1000;
const AI_RETRY_MS = 60 * 1000;
const disabled = () => process.env.DFACM_CALENDAR_AI_OFF === '1';
const iso = (value) => {
    if (value === null || value === undefined) return null;
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value * 1000).getTime())) throw new Error('Invalid collector date');
    return new Date(value * 1000).toISOString();
};

function normalizeCompetition(row) {
    if (!row || (!Object.hasOwn(SOURCE_META, row.source) && row.source !== 'codeforces') || ['manual', 'cf', 'atcoder', 'clist'].includes(row.source)
        || typeof row.external_id !== 'string' || !row.external_id.trim() || typeof row.title !== 'string' || !row.title.trim()) return null;
    let start, end, firstSeenAt;
    try { start = iso(row.start_time); end = iso(row.end_time); firstSeenAt = iso(row.first_seen_at); } catch { return null; }
    const type = row.source === 'leetcode' ? 'leetcode' : ({
        datascience: 'datascience', aigc: 'aigc', llm_agent: 'llm_agent', hackathon: 'hackathon', oj: 'other', other: 'ai_other',
    }[row.category] || 'ai_other');
    const event = {
        id: `ai-${row.source}-${row.external_id}`, name: row.title.trim(), source: row.source, type, form: 'online',
        start, end, dateUnknown: !start, openEnded: true, url: row.url, note: '',
        tags: row.tags, organizer: row.organizer, prizeText: row.prize_text, prizeAmount: row.prize_amount,
        currency: row.currency, teamsCount: row.teams_count, firstSeenAt: firstSeenAt ? Date.parse(firstSeenAt) : null,
    };
    // Use the established CF ID to keep subscriptions and QQ identities stable.
    if (row.source === 'codeforces') { event.id = `cf-${row.external_id}`; event.type = 'cf'; event.source = 'cf'; }
    return validateEvent(event, 0).ok ? event : null;
}

function collectorUrl() {
    const url = new URL(process.env.DFACM_CALENDAR_AI_URL || 'http://127.0.0.1:8765');
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
        || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
        throw new Error('Collector URL must be a local HTTP origin');
    }
    return url;
}

async function fetchAiEvents(fetcher = fetch) {
    const origin = collectorUrl();
    const signal = AbortSignal.timeout(8000);
    const events = [];
    let total = null;
    let offset = 0;
    do {
        const url = new URL('/api/competitions', origin);
        url.search = new URLSearchParams({ sort: 'newest', limit: String(PAGE_SIZE), offset: String(offset) }).toString();
        const response = await fetcher(url, { signal, redirect: 'error', headers: { 'User-Agent': 'DFACM-Calendar/1.37.0' } });
        if (!response.ok) throw new Error('Collector unavailable');
        const payload = await response.json();
        if (!payload || !Number.isSafeInteger(payload.total) || payload.total < 0 || payload.total > MAX_EVENTS
            || !Array.isArray(payload.items) || payload.items.length > PAGE_SIZE
            || (total !== null && total !== payload.total) || (payload.items.length === 0 && offset < payload.total)) {
            throw new Error('Invalid or changing collector result');
        }
        total = payload.total;
        for (const row of payload.items) {
            const event = normalizeCompetition(row);
            if (event) events.push(event);
        }
        offset += payload.items.length;
    } while (offset < total);
    return events;
}

let cached;
function source() {
    if (!cached) cached = createCachedSource({
        id: 'ai', label: 'AI 赛事采集', file: process.env.DFACM_CALENDAR_AI_CACHE || join(__dirname, 'ai-cache.json'),
        ttlMs: AI_TTL_MS, retryMs: AI_RETRY_MS, fetchEvents: () => fetchAiEvents(),
        validate: (event) => validateEvent(event, 0).ok,
    });
    return cached;
}
async function getAiEvents() { return disabled() ? [] : source().get(); }
function getAiStatus() { return disabled() ? { id: 'ai', label: 'AI 赛事采集', status: 'disabled', updatedAt: null } : source().status(); }
function warmupAi() { if (!disabled()) getAiEvents().catch(() => {}); }
async function settledAi() { await source().settled(); }

module.exports = { PAGE_SIZE, MAX_EVENTS, AI_TTL_MS, AI_RETRY_MS, normalizeCompetition, fetchAiEvents, collectorUrl,
    getAiEvents, getAiStatus, warmupAi, settledAi };
