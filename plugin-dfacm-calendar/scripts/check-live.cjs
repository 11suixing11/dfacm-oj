'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = async function checkLive(root, qa) {
    const { loadCalendar, selectEvents, canonicalUrl, filterParams } = require(path.join(root, 'calendar.cjs'));
    const { buildIcs } = require(path.join(root, 'presentation.cjs'));
    const request = async route => {
        const response = await fetch('http://127.0.0.1:8888' + route, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        return { status: response.status, headers: response.headers, body: await response.text() };
    };
    function caddyRequest(route) {
        const result = spawnSync('curl', ['-ksS', '--max-time', '15', '--resolve', 'dfacm.website:443:127.0.0.1',
            '-D', '-', 'https://dfacm.website' + route], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        assert.equal(result.status, 0, 'Caddy request failed: ' + route + ' ' + result.stderr);
        const split = result.stdout.indexOf('\r\n\r\n'); assert.ok(split >= 0);
        const headers = result.stdout.slice(0, split), body = result.stdout.slice(split + 4);
        return { status: Number(headers.match(/^HTTP\/[^ ]+ (\d+)/)[1]), body,
            location: headers.match(/^location:\s*(.+)$/im)?.[1].trim(), headers };
    }
    const result = { checkedAt: new Date().toISOString(), filters: [], redirects: [], routes: [] };
    const page = await request('/calendar'); assert.equal(page.status, 200);
    assert.ok(page.body.includes('calendar-1.37.1.js'));
    assert.ok(page.body.includes('data-calendar-interest="vibe-coding"'));
    assert.ok(!page.body.includes('href="/ai-contests'), 'Old AI navigation is still present');
    const data = await request('/calendar/data'); assert.equal(data.status, 200);
    const payload = JSON.parse(data.body); assert.equal(payload.ok, true); assert.ok(payload.events.length > 600);
    fs.writeFileSync(path.join(qa, 'live-data.json'), data.body, { mode: 0o600 });
    const parsed = loadCalendar(JSON.stringify(payload)); assert.equal(parsed.skipped.length, 0);
    const ids = parsed.events.map(event => event.id); assert.equal(new Set(ids).size, ids.length);
    const urlGroups = new Map();
    for (const event of parsed.events) {
        if (!event.url) continue;
        const key = canonicalUrl(event.url), group = urlGroups.get(key) || [];
        group.push(event); urlGroups.set(key, group);
    }
    for (const group of urlGroups.values()) if (group.length > 1) {
        assert.ok(group.every(event => event.source === 'manual'), 'Duplicate collected contest URL');
    }
    assert.ok(parsed.events.some(event => event.type === 'icpc'));
    assert.ok(parsed.events.some(event => event.tags.includes('vibe-coding')));
    assert.ok(payload.sources.some(source => source.id === 'ai' && source.status === 'fresh'), 'AI cache is not ready');
    result.events = parsed.events.length;
    result.sources = payload.sources.map(source => ({ id: source.id, status: source.status }));
    function bootOf(html) {
        const match = html.match(/<script id="dfacm-calendar-boot" type="application\/json">([\s\S]*?)<\/script>/);
        assert.ok(match, 'Calendar boot filters are missing'); return JSON.parse(match[1]);
    }
    for (const options of [ {}, { type: 'icpc' }, { scope: 'algorithm' }, { scope: 'ai', interests: 'vibe-coding', status: 'active' },
        { types: 'hackathon,llm_agent', interests: 'agent', source: 'lablab', sort: 'prize' },
        { types: 'cf,leetcode', sort: 'deadline' }, { q: 'Coding', sort: 'newest' }, { status: 'uncertain' }, { status: 'ended' } ]) {
        const params = new URLSearchParams(options).toString(), suffix = params ? '?' + params : '';
        const expected = selectEvents(parsed.events, { ...options, now: new Date() });
        const response = await request('/calendar' + suffix); assert.equal(response.status, 200);
        const counter = response.body.match(/id="dfacm-calendar-count"[^>]*>\s*(\d+) 场/);
        assert.ok(counter); assert.equal(Number(counter[1]), expected.length, 'SSR filter mismatch: ' + params);
        const boot = bootOf(response.body);
        const expectedParams = filterParams(options);
        assert.equal(filterParams({ ...boot, types: boot.selectedTypes.join(','), q: boot.query }).toString(), expectedParams.toString(), 'SSR boot filter mismatch: ' + params);
        const ics = await request('/calendar/feed.ics' + suffix); assert.equal(ics.status, 200);
        assert.ok(ics.headers.get('content-type').startsWith('text/calendar'));
        const normalizeStamp = value => value.replace(/^DTSTAMP:.*$/gm, 'DTSTAMP:FIXED');
        assert.equal(normalizeStamp(ics.body), normalizeStamp(buildIcs(parsed, options)), 'ICS filter mismatch: ' + params);
        const rss = await request('/calendar/feed.xml' + suffix); assert.equal(rss.status, 200);
        assert.ok(rss.headers.get('content-type').includes('rss+xml'));
        assert.equal((rss.body.match(/<item>/g) || []).length, expected.length, 'RSS filter mismatch: ' + params);
        result.filters.push({ options, count: expected.length, ssr: true, ics: true, rss: true });
    }
    for (const [route, location] of [ ['/ai-contests', '/calendar'], ['/ai-contests/', '/calendar'],
        ['/ai-contests/calendar', '/calendar'], ['/ai-contests/calendar/', '/calendar'],
        ['/ai-contests/?category=vibe-coding&source=codeforces&q=AI', '/calendar?q=AI&interests=vibe-coding&source=cf'],
        ['/ai-contests/feed.ics?category=agent', '/calendar/feed.ics?interests=agent&status=active'],
        ['/ai-contests/feed.ics/', '/calendar/feed.ics?status=active'],
        ['/ai-contests/feed.xml?category=datascience&status=all', '/calendar/feed.xml?types=datascience'] ]) {
        const hydro = await request(route), caddy = caddyRequest(route);
        for (const response of [ { status: hydro.status, location: hydro.headers.get('location') }, caddy ]) {
            assert.equal(response.status, 308, 'Old AI route is not a permanent redirect: ' + route);
            const expected = new URL(location, 'https://dfacm.website'), actual = new URL(response.location, 'https://dfacm.website');
            assert.equal(actual.pathname, expected.pathname);
            assert.deepEqual([...actual.searchParams].sort(), [...expected.searchParams].sort());
        }
        result.redirects.push({ route, location, status: 308 });
    }
    for (const route of ['/calendar/assets/calendar-1.37.1.js', '/calendar/assets/calendar-1.37.1.css', '/p/P1000', '/training', '/reg', '/shop']) {
        const response = await request(route); assert.equal(response.status, 200, 'Existing route failed: ' + route);
        if (route === '/reg') assert.ok(response.body.includes('m-mail'));
        result.routes.push({ route, status: response.status });
    }
    for (const route of ['/manage/ai-watch', '/manage/ai-watch/data']) {
        const response = await request(route); assert.ok([302, 401, 403].includes(response.status), 'AI watch guest permission changed');
        result.routes.push({ route, status: response.status });
    }
    for (const route of ['/ai-contests/api/competitions?limit=1', '/ai-contests/api/stats', '/ai-contests/healthz']) {
        const response = caddyRequest(route); assert.equal(response.status, 200);
        assert.doesNotThrow(() => JSON.parse(response.body)); result.routes.push({ route, status: response.status });
    }
    const home = caddyRequest('/'); assert.equal(home.status, 200);
    assert.ok(!home.body.includes('href="/ai-contests'));
    assert.equal((home.body.match(/<a href="\/calendar">赛事日历<\/a>/g) || []).length, 2, 'Both home navigation entries must be merged');
    for (const route of ['/calendar', '/calendar/feed.ics?interests=vibe-coding&status=active', '/calendar/feed.xml?interests=vibe-coding&status=active']) {
        assert.equal(caddyRequest(route).status, 200);
    }
    result.homeNavigation = true; result.nativeNavigation = true; result.collectorApi = true;
    return result;
};
if (require.main === module) module.exports(...process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.stack); process.exitCode = 1; });
