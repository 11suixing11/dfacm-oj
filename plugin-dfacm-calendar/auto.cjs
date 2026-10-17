'use strict';

// 平台赛自动抓取（民间比赛）：Codeforces 官方 API + AtCoder 社区数据源
// （atcoder-problems / kenkoooo）。与手工维护的 calendar.json 不同，这两类
// 每周都在发生，靠站长手录不可持续——全部自动。
//
// 设计要点：
// - 磁盘缓存（SWPU_CALENDAR_AUTO_CACHE，默认插件目录 auto-cache.json）：
//   每小时最多真的发一次外网请求；抓取失败回退上一份缓存（≤24 小时），
//   两个源都失败且无可用缓存时返回空数组——平台赛缺席绝不能影响官方赛日历。
// - 先返回后刷新：内存里有数据（哪怕略过期）就立即返回并后台刷新，
//   页面渲染永远不会被外网请求卡住；仅冷启动（无任何缓存）时才空手而归，
//   由插件启动预热补齐。
// - 抓取窗口 [now-12h, now+14d]：刚结束不久的场次保留片刻（方便补题），
//   太久远的自动条目一律不留（官方赛的"已结束"表是站长手工 curated 的）。

const { readFile, writeFile } = require('fs/promises');
const { join } = require('path');

const CST = 8 * 3600 * 1000;
const TTL_MS = 60 * 60 * 1000;            // 缓存新鲜度：1 小时
const STALE_MAX_MS = 24 * 3600 * 1000;    // 失败兜底上限：24 小时
const WINDOW_PAST_MS = 12 * 3600 * 1000;  // 已开始的场次保留 12 小时
const WINDOW_FUTURE_MS = 14 * 86400 * 1000; // 只抓未来 14 天
const FETCH_TIMEOUT_MS = 6000;
const CAP = 30;

const CF_API = 'https://codeforces.com/api/contest.list';
const ATCODER_API = 'https://kenkoooo.com/atcoder/resources/contests.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cachePath() {
    return process.env.SWPU_CALENDAR_AUTO_CACHE || join(__dirname, 'auto-cache.json');
}

function disabled() {
    return process.env.SWPU_CALENDAR_AUTO_OFF === '1';
}

// epoch 秒 → 带 CST 偏移的 ISO 字符串（"2026-10-24T01:00:00+08:00"）。
function cstIso(epochSec) {
    return new Date(epochSec * 1000 + CST).toISOString().split('.')[0] + '+08:00';
}

// Codeforces：{status:"OK", result:[{id,name,phase,startTimeSeconds,durationSeconds}]}。
// phase BEFORE = 未开始，CODING = 进行中；两者都可能是民间训练赛。
function normalizeCf(payload, nowMs) {
    const rows = payload && payload.status === 'OK' && Array.isArray(payload.result) ? payload.result : [];
    const out = [];
    for (const row of rows) {
        if (!row || typeof row.startTimeSeconds !== 'number' || typeof row.durationSeconds !== 'number') continue;
        if (row.phase !== 'BEFORE' && row.phase !== 'CODING') continue;
        if (!inWindow(row.startTimeSeconds * 1000, nowMs)) continue;
        out.push({
            id: `cf-${row.id}`,
            name: String(row.name || '').trim() || `Codeforces Contest ${row.id}`,
            type: 'cf',
            form: 'online',
            location: '',
            start: cstIso(row.startTimeSeconds),
            end: cstIso(row.startTimeSeconds + row.durationSeconds),
            regDeadline: null,
            url: `https://codeforces.com/contests/${row.id}`,
            note: '',
        });
    }
    return out;
}

// AtCoder（kenkoooo 全量列表）：[{id,start_epoch_second,duration_second,title}]。
function normalizeAtcoder(payload, nowMs) {
    const rows = Array.isArray(payload) ? payload : [];
    const out = [];
    for (const row of rows) {
        if (!row || typeof row.start_epoch_second !== 'number' || typeof row.duration_second !== 'number') continue;
        if (!inWindow(row.start_epoch_second * 1000, nowMs)) continue;
        out.push({
            id: `atcoder-${row.id}`,
            name: String(row.title || '').trim() || `AtCoder ${row.id}`,
            type: 'atcoder',
            form: 'online',
            location: '',
            start: cstIso(row.start_epoch_second),
            end: cstIso(row.start_epoch_second + row.duration_second),
            regDeadline: null,
            url: `https://atcoder.jp/contests/${row.id}`,
            note: '',
        });
    }
    return out;
}

function inWindow(startMs, nowMs) {
    return startMs >= nowMs - WINDOW_PAST_MS && startMs < nowMs + WINDOW_FUTURE_MS;
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return response.json();
}

// 双源并发抓取：至少一个源成功才算成功（部分成功也落缓存，下轮再补全）；
// 全部失败返回 null——调用方保持上一份缓存不动。
async function fetchAll(nowMs) {
    const results = await Promise.allSettled([fetchJson(CF_API), fetchJson(ATCODER_API)]);
    let events = [];
    let ok = false;
    if (results[0].status === 'fulfilled') {
        events = events.concat(normalizeCf(results[0].value, nowMs));
        ok = true;
    }
    if (results[1].status === 'fulfilled') {
        events = events.concat(normalizeAtcoder(results[1].value, nowMs));
        ok = true;
    }
    if (!ok) return null;
    events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return events.slice(0, CAP);
}

let memory = null;      // { fetchedAt: epochMs, events: [...] }
let refreshing = null;  // 并发去重：同一时刻最多一个后台刷新在跑
let hydrating = null;   // 冷启动的单飞磁盘水合（多次调用共享同一个 promise）

async function doRefresh() {
    const fetched = await fetchAll(Date.now());
    if (fetched === null) return; // 全源失败：保留旧缓存
    memory = { fetchedAt: Date.now(), events: fetched };
    try {
        await writeFile(cachePath(), JSON.stringify(memory), 'utf-8');
    } catch {
        // 缓存写失败只影响断网场景的兜底，不致命
    }
}

function refreshInBackground() {
    if (refreshing || disabled()) return;
    refreshing = doRefresh().catch(() => {}).finally(() => { refreshing = null; });
}

function readDisk() {
    return readFile(cachePath(), 'utf-8')
        .then((text) => JSON.parse(text))
        .catch(() => null);
}

function ensureHydration() {
    if (!hydrating) {
        hydrating = readDisk()
            .then((disk) => {
                if (
                    disk
                    && typeof disk.fetchedAt === 'number'
                    && Array.isArray(disk.events)
                    && Date.now() - disk.fetchedAt < STALE_MAX_MS
                    && !memory
                ) {
                    memory = disk;
                }
            })
            .catch(() => {})
            .finally(() => {
                // 水合完成后允许未来的冷启动（缓存超龄清空后）重新走一遍
                hydrating = null;
            });
    }
    return hydrating;
}

// 取当前已知数据：本地磁盘水合（毫秒级）直接 await，外网刷新永远在后台。
// 新鲜 → 直接用；过期 → 先返回旧数据再后台刷新；超龄或全无 → 空手而归，
// 由后台刷新补上——平台赛缺席绝不能拖慢或弄挂官方赛日历。
async function getAutoEvents(nowMs = Date.now()) {
    if (disabled()) return [];
    if (memory && nowMs - memory.fetchedAt < TTL_MS) return memory.events;
    if (memory && nowMs - memory.fetchedAt < STALE_MAX_MS) {
        refreshInBackground();
        return memory.events;
    }
    memory = null;
    await ensureHydration();
    if (memory && nowMs - memory.fetchedAt < TTL_MS) return memory.events;
    if (memory && nowMs - memory.fetchedAt < STALE_MAX_MS) {
        refreshInBackground();
        return memory.events;
    }
    refreshInBackground();
    return [];
}

// 插件启动预热：加载几秒后首批访客就能看到平台赛。
function warmup() {
    if (disabled()) return;
    getAutoEvents().catch(() => {});
}

// 仅测试用。
function __resetForTest() {
    memory = null;
    refreshing = null;
    hydrating = null;
}

module.exports = {
    CAP,
    STALE_MAX_MS,
    TTL_MS,
    WINDOW_FUTURE_MS,
    WINDOW_PAST_MS,
    __resetForTest,
    cstIso,
    getAutoEvents,
    normalizeAtcoder,
    normalizeCf,
    warmup,
};
