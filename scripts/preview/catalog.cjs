'use strict';

const { categoryOf, readFilters, buildCatalog } = require('../../plugin-dfacm-train/catalog.cjs');
const trainingId = '6abf5251aaa235606eedfb84';
// Public names, IDs and sizes observed on /training on 2026-10-23.
// Descriptions are concise preview copy. Enrollment and progress are fixtures,
// never copied from the signed-in account or sent to the live site.
const definitions = [
    ['6ac63619a1cd796076ca5db5', '【专题】二分与枚举优化', 5, 32, '二分查找与二分答案、双指针滑动窗口和枚举优化。'],
    ['6ac63618a1cd796076ca5db4', '【专题】贪心与构造', 5, 32, '经典贪心、区间调度与构造思维，练习正确性论证。'],
    ['6ac63618a1cd796076ca5db3', '【专题】字符串', 5, 32, '从字符串处理与匹配，到哈希、前缀结构与综合技巧。'],
    ['6ac63618a1cd796076ca5db2', '【专题】数学', 5, 32, '数论、组合计数、同余、博弈与概率，逐步提高。'],
    ['6ac63618a1cd796076ca5db1', '【专题】数据结构', 5, 32, '栈与队列、堆、并查集、哈希和线段树入门。'],
    ['6ac63618a1cd796076ca5db0', '【专题】图论', 5, 32, '遍历、拓扑、树、最短路与连通性，练习建图和复杂度分析。'],
    ['6ac63618a1cd796076ca5daf', '【专题】动态规划', 5, 32, '从线性递推到背包、区间、树形、状压与 DP 优化。'],
    ['6ac63618a1cd796076ca5dae', '【专题】搜索与剪枝', 5, 32, 'DFS、BFS、剪枝与状态压缩，按难度逐章推进。'],
    ['6ac38fb88b364d5443b9ee22', '【进阶】XCPC 专题训练 108 题', 9, 108, '一本通之后的进阶路线：四段主线、四条专题支线与综合挑战。'],
    ['6abf552caaa235606eedfbee', '【蓝桥杯】真题训练 253 题', 4, 253, '基础训练、算法训练、算法提高与历届真题，四关按顺序推进。'],
    [trainingId, '【入门】一本通基础 396 题', 8, 396, '从 Hello,World! 到动态规划和数据结构，八个递进章节。'],
];
const docs = definitions.map(([docId, title, sections, count, description], index) => ({
    docId, title, description, attend: 12 + index * 7,
    dag: Array.from({ length: sections }, (_, i) => ({ _id: i + 1, title: `章节 ${i + 1}`,
        pids: Array.from({ length: Math.floor(count / sections) + (i < count % sections ? 1 : 0) }, (_, j) => index * 10000 + i * 1000 + j + 1),
    })),
}));
const statuses = Object.fromEntries([0, 3, 5, 6, 7, 8, 9, 10].map((i) => {
    const pids = docs[i].dag.flatMap((node) => node.pids);
    const done = i === 0;
    const accepted = i === 10 ? 68 : i === 8 ? 20 : i === 3 ? 0 : 4;
    return [docs[i].docId, { docId: docs[i].docId, enroll: 1, done, donePids: done ? pids : pids.slice(0, accepted) }];
}));

function catalogFor(url) {
    const member = url.searchParams.get('member') !== '0';
    const filters = readFilters(Object.fromEntries(url.searchParams), member);
    const q = url.searchParams.get('q') || '';
    const scope = docs.filter((doc) => doc.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
    const selected = scope.filter((doc) => (!filters.category || categoryOf(doc.title) === filters.category)
        && (filters.view === 'all' || statuses[doc.docId]?.enroll)
        && (filters.view !== 'completed' || statuses[doc.docId]?.done));
    const pages = Math.max(1, Math.ceil(selected.length / 10));
    const page = Math.min(pages, Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1));
    return buildCatalog({ docs: scope, items: selected.slice((page - 1) * 10, page * 10), statuses: member ? statuses : {},
        filters, page, pages, q, url: '/training', member });
}

module.exports = { docs, statuses, catalogFor };
