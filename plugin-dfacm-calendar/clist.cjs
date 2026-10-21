'use strict';

const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { createCachedSource } = require('./cache.cjs');
const { cstIso, inWindow } = require('./auto.cjs');
const { validateEvent } = require('./calendar.cjs');

const API = 'https://clist.by/api/v4/contest/';
const HOSTS = {
    'ac.nowcoder.com': 'nowcoder',
    'luogu.com.cn': 'luogu',
    'www.luogu.com.cn': 'luogu',
    'leetcode.com': 'leetcode',
    'leetcode.cn': 'leetcode',
    'codechef.com': 'codechef',
    'www.codechef.com': 'codechef',
};
const RESOURCE_HOSTS = ['ac.nowcoder.com', 'luogu.com.cn', 'leetcode.com', 'codechef.com'];

// CLIST's v4 date strings without an offset are UTC, not local server time.
function clistDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
    return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}

function normalizeClist(payload, nowMs) {
    if (!payload || !Array.isArray(payload.objects)) throw new Error('Invalid CLIST response');
    const events = [];
    for (const row of payload.objects) {
        if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.event !== 'string' || !row.event.trim()) continue;
        const host = typeof row.resource === 'object' && row.resource ? row.resource.host : row.resource || row.host;
        const type = HOSTS[String(host || '').toLowerCase()];
        const start = clistDate(row.start);
        const end = clistDate(row.end);
        if (!type || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !inWindow(start, nowMs, end)) continue;
        let url;
        try {
            url = new URL(row.href);
            if (!['https:', 'http:'].includes(url.protocol) || HOSTS[url.hostname.toLowerCase()] !== type || url.username || url.password || /[\r\n]/.test(row.href)) continue;
        } catch { continue; }
        events.push({
            id: `clist-${row.id}`, name: row.event.trim(), type, form: 'online',
            start: cstIso(start / 1000), end: cstIso(end / 1000),
            regDeadline: null, url: url.href, location: '', note: '', source: 'clist',
        });
    }
    return events;
}

function createClistSource({ credentials = () => ({}), file = process.env.SWPU_CALENDAR_CLIST_CACHE || join(__dirname, 'clist-cache.json'), fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
    let credentialHash = '';
    let current = { username: '', key: '' };
    const source = createCachedSource({
        id: 'clist', label: 'CLIST', file, now,
        validate: (event) => event && event.source === 'clist' && RESOURCE_HOSTS.some((host) => HOSTS[host] === event.type) && validateEvent(event, 0).ok,
        async fetchEvents(nowMs) {
            const auth = { ...current };
            const events = [];
            for (let offset = 0; offset < 300; offset += 100) {
                const url = new URL(API);
                url.search = new URLSearchParams({
                    resource__in: RESOURCE_HOSTS.join(','),
                    end__gte: new Date(nowMs - 12 * 3600000).toISOString(),
                    start__lt: new Date(nowMs + 60 * 86400000).toISOString(),
                    order_by: 'start', limit: '100', offset: String(offset),
                }).toString();
                const response = await fetchImpl(url.href, {
                    headers: { Authorization: `ApiKey ${auth.username}:${auth.key}`, 'User-Agent': 'DFACM-Calendar/1.36.0 (+https://dfacm.website)', Accept: 'application/json' },
                    signal: AbortSignal.timeout(10000),
                });
                // Never include a request, credential or upstream body in errors.
                if (!response.ok) throw new Error(`CLIST HTTP ${response.status}`);
                const payload = await response.json();
                events.push(...normalizeClist(payload, nowMs));
                if (payload.objects.length < 100) break;
            }
            return events;
        },
    });

    function configure() {
        const settings = credentials() || {};
        current = {
            username: String(process.env.DFACM_CLIST_USERNAME || settings.username || '').trim(),
            key: String(process.env.DFACM_CLIST_API_KEY || settings.key || '').trim(),
        };
        const nextHash = createHash('sha256').update(`${current.username}\0${current.key}`).digest('hex');
        const enabled = !!current.username && !!current.key && !/[\r\n:]/.test(current.username) && !/[\r\n]/.test(current.key);
        if (credentialHash && nextHash !== credentialHash) source.invalidate({ refresh: enabled });
        credentialHash = nextHash;
        return enabled;
    }

    return {
        async get(at = now()) {
            if (!configure()) return [];
            return (await source.get(at)).filter((event) => inWindow(Date.parse(event.start), at, Date.parse(event.end)));
        },
        status() {
            return configure() ? source.status() : { id: 'clist', label: 'CLIST', status: 'unconfigured', updatedAt: null };
        },
        settled: source.settled,
    };
}

module.exports = { createClistSource, normalizeClist, clistDate };
