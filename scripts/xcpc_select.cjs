// XCPC progressive training track - problem selection from site catalog.
// Usage: node xcpc_select.cjs [catalog.json.gz] [outdir]
// Stratified per-chapter difficulty ramp (floor->ceiling), global arc rising,
// warmup chapters reserve remote (Chinese) problem slots.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const catalogPath = process.argv[2] || 'hw_catalog2.json.gz';
const outDir = process.argv[3] || '.';

const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(catalogPath)));

// manual review blacklist: topics misplaced by the heuristic tags, or real
// difficulty far above their assigned band (must not gate mandatory chapters)
// 630=#116 有源汇上下界最大流 627=#102 最小费用流 675=#2093 ZJOI2016线段树
// 634=#125 除数函数幂和 633=#124 除数函数求和 (杜教筛系,属冲顶/数学而非数据结构章)
const BLACKLIST = new Set([630, 627, 675, 634, 633]);

const isJudgeable = (p) => p.rm || Math.min(p.nin, p.nout) >= 4;
const inExistingPlans = (p) => p.id >= 3676 && p.id <= 4325;
const usable = raw.filter(
    (p) => p.d === 'system' && !p.h && !inExistingPlans(p) && !BLACKLIST.has(p.id) && isJudgeable(p),
);

// ---- chapter config -------------------------------------------------------
// order keeps the global difficulty arc rising; requireNids: 1->2->3->4 chain,
// 5..8 all require [4] (parallel topic tracks), 9 requires all of them.
const chapters = [
    { id: 1, title: '第1章 热身路段 · 综合基础', req: [], tags: ['模拟', '暴力', '贪心', '枚举', '思维', '构造', '二分查找', '排序'], dfMin: 2, dfMax: 3, n: 12, remoteQuota: 4 },
    { id: 2, title: '第2章 密林寻径 · 搜索', req: [1], tags: ['搜索', '暴力', '枚举'], dfMin: 3, dfMax: 4, n: 12, remoteQuota: 2 },
    { id: 3, title: '第3章 行囊整理 · 基础数据结构', req: [2], tags: ['数据结构'], dfMin: 3, dfMax: 5, n: 12, remoteQuota: 0 },
    { id: 4, title: '第4章 冰川横渡 · 图论', req: [3], tags: ['图论'], dfMin: 4, dfMax: 6, n: 14, remoteQuota: 0 },
    { id: 5, title: '第5章 崖壁栈道 · 进阶数据结构', req: [4], tags: ['数据结构', '树结构', '并查集', '线段树', '哈希', '位运算'], dfMin: 5, dfMax: 7, n: 12, remoteQuota: 0 },
    { id: 6, title: '第6章 岩壁攀登 · 动态规划', req: [4], tags: ['动态规划'], dfMin: 5, dfMax: 7, n: 14, remoteQuota: 0 },
    { id: 7, title: '第7章 星空导航 · 数学', req: [4], tags: ['数学', '数论', '组合数学', '博弈论', '矩阵乘法', '概率期望', '素数判断'], dfMin: 5, dfMax: 7, n: 12, remoteQuota: 0 },
    { id: 8, title: '第8章 密码石壁 · 字符串', req: [4], tags: ['字符串'], dfMin: 6, dfMax: 8, n: 10, remoteQuota: 0 },
    { id: 9, title: '第9章 冲顶突击 · 综合挑战', req: [5, 6, 7, 8], tags: null, dfMin: 7, dfMax: 8, n: 10, remoteQuota: 0 },
];

// ---- helpers --------------------------------------------------------------
const pickedSet = new Set();

// distribute n picks across difficulty levels [a..b], favouring the floor
function levelQuotas(a, b, n) {
    const levels = [];
    for (let d = a; d <= b; d++) levels.push(d);
    const q = new Map(levels.map((d) => [d, 0]));
    let i = 0;
    while (n > 0) {
        const d = levels[i % levels.length];
        q.set(d, q.get(d) + 1);
        n -= 1;
        i += 1;
        // after one full round, start favouring the lower half
        if (i >= levels.length) i = Math.floor(i / 2);
    }
    return q;
}

function pickFrom(list, count) {
    return list.slice(0, count);
}

let md = '# XCPC 专题进阶训练 · 选题清单\n\n'
    + '> 章节解锁：1→2→3→4 顺序链；5/6/7/8 为并列专题（完成第4章全部题目后解锁）；第9章需 5-8 全部完成。\n'
    + '> 本地题均 ≥4 对测试数据；「远程判题」在源平台在线判题。\n\n';
const dag = [];
const report = [];

for (const ch of chapters) {
    const cand = usable.filter((p) => !pickedSet.has(p.id)
        && p.df >= ch.dfMin && p.df <= ch.dfMax
        && (ch.tags === null || p.tg.some((t) => ch.tags.includes(t))));
    const remoteCand = cand.filter((p) => p.rm)
        .sort((a, b) => a.df - b.df);
    const localCand = cand.filter((p) => !p.rm);
    // per-difficulty buckets, best (most test pairs) first inside a level
    const byLevel = new Map();
    for (const p of localCand) {
        if (!byLevel.has(p.df)) byLevel.set(p.df, []);
        byLevel.get(p.df).push(p);
    }
    for (const arr of byLevel.values()) {
        arr.sort((a, b) => Math.min(b.nin, b.nout) - Math.min(a.nin, a.nout));
    }
    const remoteTake = pickFrom(remoteCand, ch.remoteQuota);
    for (const p of remoteTake) pickedSet.add(p.id);
    const localN = ch.n - remoteTake.length;
    const quotas = levelQuotas(ch.dfMin, ch.dfMax, localN);
    const localTake = [];
    for (const [d, want] of [...quotas.entries()].sort((x, y) => x[0] - y[0])) {
        if (!want) continue;
        const avail = (byLevel.get(d) || []).filter((p) => !pickedSet.has(p.id));
        localTake.push(...pickFrom(avail, want));
    }
    // top-up if a level ran dry
    if (localTake.length < localN) {
        const rest = localCand.filter((p) => !pickedSet.has(p.id));
        rest.sort((a, b) => Math.abs(a.df - (ch.dfMin + ch.dfMax) / 2) - Math.abs(b.df - (ch.dfMin + ch.dfMax) / 2));
        localTake.push(...pickFrom(rest, localN - localTake.length));
    }
    for (const p of localTake) pickedSet.add(p.id);
    const take = [...remoteTake, ...localTake].sort((a, b) => a.df - b.df);
    const dfs = take.map((p) => p.df).join(',');
    console.log(`ch${ch.id} [${ch.dfMin}-${ch.dfMax}] want=${ch.n} pool=${cand.length} picked=${take.length} df=${dfs} remote=${take.filter((p) => p.rm).length}`);
    report.push({ ch: ch.id, picked: take.length, df: dfs });
    md += `## ${ch.title}（${take.length} 题）\n\n`;
    md += '| docId | 难度 | 数据 | 标题 | 标签 |\n|---|---|---|---|---|\n';
    for (const p of take) {
        md += `| ${p.id} | d${p.df} | ${p.rm ? '远程判题' : Math.min(p.nin, p.nout) + ' 对'} | ${p.t} | ${p.tg.filter((t) => !['Codeforces', 'LibreOJ', '一本通编程启蒙', '深入浅出'].includes(t)).slice(0, 4).join('、')} |\n`;
    }
    md += '\n';
    dag.push({ _id: ch.id, title: ch.title, requireNids: ch.req, pids: take.map((p) => p.id) });
}

fs.writeFileSync(path.join(outDir, 'dag.json'), JSON.stringify(dag));
fs.writeFileSync(path.join(outDir, 'selection.md'), md);
console.log('\ntotal picked:', pickedSet.size);
console.log('wrote dag.json + selection.md');
