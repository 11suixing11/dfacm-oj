'use strict';

// Local fixture adapter for the shipped navigation. No Hydro account, database,
// or judge is contacted. The synthetic DAG keeps the existing 68/396 sample.
const { problems, chapters, trainingId, workbench } = require('./fixtures.cjs');
const { buildTrainingContext } = require('../../plugin-dfacm-train/training-context.cjs');
const { shell } = require('./pages.cjs');
const { docs: catalogDocs, statuses: catalogStatuses } = require('./catalog.cjs');
const pdocs = Object.fromEntries(problems.map((p) => [Number(p.id.slice(1)), { docId: Number(p.id.slice(1)), pid: p.id, title: p.title }]));
const dag = chapters.map((chapter, i) => ({
    _id: i + 1, title: `${chapter.name} · ${chapter.topic}`, requireNids: i ? [i] : [],
    pids: Array.from({ length: chapter.total }, (_, j) => 5000 + i * 100 + j),
}));
dag[0].pids[0] = 1000;
dag[1].pids[18] = 1001;
dag[1].pids[19] = 1002;
const tdoc = { docId: trainingId, title: workbench.data.trainings[0].title, dag };
const baseline = {};
chapters.forEach((chapter, i) => dag[i].pids.slice(0, chapter.done).forEach((pid) => { baseline[pid] = { status: 1 }; }));
const recordId = (pid) => 'a'.repeat(20) + pid;
const routeUrl = (name, args = {}) => ({
    training_detail: `/training/${args.tid}`, problem_detail: `/p/${args.pid}`,
    problem_submit: `/p/${args.pid}/submit`,
})[name];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function context(pid = null, status, nid = null, page = 'problem') {
    const psdocs = { ...baseline, 1002: { status: 2 } };
    if (status === 1 && pid !== null) psdocs[pid] = { status: 1 };
    const data = buildTrainingContext({ tdoc, pdocs, psdocs, pid, nid, url: routeUrl });
    if (!data) return null;
    return { ...data, page, viewerUid: 42, workbenchUrl: '/workbench', status,
        problemPaths: pid === null ? [] : [`/p/P${pid}`],
        submitPaths: pid === null ? [] : [`/p/P${pid}/submit`],
        refreshUrl: pid === null ? null : `/workbench/context?rid=${recordId(pid)}&training=${trainingId}&trainingNode=${data.nid}`,
    };
}

function workbenchPayload(scenario = '') {
    const payload = structuredClone(workbench);
    const active = context(null, undefined, null, 'training');
    Object.assign(payload.data.trainings[0], {
        tid: trainingId, currentNid: active.nid, currentUrl: active.chapterUrl, next: active.next,
    });
    for (const id of ['6ac38fb88b364d5443b9ee22', '6ac63618a1cd796076ca5db2']) {
        const plan = catalogDocs.find((doc) => doc.docId === id);
        const total = plan.dag.flatMap((node) => node.pids).length;
        const done = catalogStatuses[id].donePids.length;
        payload.data.trainings.push({ tid: id, title: plan.title, url: `/training/${id}`, done, total,
            percent: Math.round(done / total * 100), completed: false, currentTitle: '', next: null });
    }
    payload.data.trainingOverview = { enrolled: Object.keys(catalogStatuses).length, completed: 1,
        inProgress: Object.keys(catalogStatuses).length - 1, shown: payload.data.trainings.length };
    payload.data.recentlyResolved = [{ pid: 1005, title: '合并区间', url: '/p/P1005', resolved: true }];
    payload.data.recentFailed[0].recordUrl = `/record/${recordId(1002)}?training=${trainingId}&trainingNode=2`;
    if (scenario === 'empty') {
        payload.data.trainings = []; payload.data.recentFailed = []; payload.data.recentlyResolved = [];
        payload.data.trainingOverview = { enrolled: 0, completed: 0, inProgress: 0, shown: 0 };
        Object.assign(payload.data.week, { submissions: 0, accepted: 0, attempted: 0, activeDays: 0 });
        payload.data.mistakes.open = 0;
    }
    if (scenario === 'long') {
        payload.data.trainings[0].next.title = '在包含重复元素的有序数列中寻找第一个满足边界约束的位置并输出完整结果';
        payload.data.user.uname = '正在练习算法的同学';
    }
    return payload;
}

function configScript(data) {
    return '<script type="application/json" id="preview-training-data">' + JSON.stringify(data).replace(/</g, '\\u003c')
        + '</script><script src="/preview/training.js" defer></script>';
}

function nativeChapterList() {
    return '<div data-fragment-id="training_detail">' + chapters.map((chapter, i) => {
        const node = dag[i];
        const available = i < 2;
        const rows = node.pids.filter((pid) => pdocs[pid]).map((pid) => '<tr><td class="col--status">'
            + (baseline[pid]?.status === 1 ? '已通过' : '未通过') + '</td><td class="col--problem-name"><a href="/p/P' + pid + '">'
            + esc(pdocs[pid].title) + '</a></td></tr>').join('');
        return '<section class="section training__section collapsed"><div class="section__header"><h2 class="section__title" id="node-' + node._id + '">'
            + node._id + '. ' + esc(chapter.name) + '</h2><span class="preview-topic">' + (i === 0 ? '已完成' : available ? '学习中' : '待解锁') + '</span></div>'
            + '<div class="section__body"><p class="preview-tip">' + esc(chapter.topic) + ' · ' + chapter.done + ' / ' + chapter.total + ' 题</p>'
            + (available ? '<button type="button" class="button expanded--hidden" data-preview-expand>展开章节</button><button type="button" class="button collapsed--hidden" data-preview-collapse>收起章节</button>' : '') + '</div>'
            + '<div class="training__section__detail"><div class="section__body"><p class="preview-tip">'
            + (available ? '本地仅展示本章的部分示例题。' : '完成前一章后解锁。') + '</p></div>'
            + (available ? '<table class="data-table"><thead><tr><th>状态</th><th>题目</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') + '</div></section>';
    }).join('') + '</div>';
}

function decorate(html, url) {
    let config;
    let extra = '';
    if (url.pathname === '/training/' + trainingId) {
        config = context(null, undefined, null, 'training');
        // Reproduce the native chapter contract so the shipped navigation can
        // expand a returned chapter and annotate its links during local checks.
        html = html.replace(/<ol class="preview-chapters">[\s\S]*?<\/ol>/, nativeChapterList());
        html = html.replace(/href="\/p\/P1001"/g, `href="/p/P1001?training=${trainingId}&trainingNode=2"`)
            .replace(/href="\/p\/P1000"/g, `href="/p/P1000?training=${trainingId}&trainingNode=1"`);
    }
    const pidMatch = /^\/p\/P(\d+)$/.exec(url.pathname);
    if (pidMatch) {
        const pid = Number(pidMatch[1]);
        if (url.searchParams.get('training') === trainingId) config = context(pid, undefined, Number(url.searchParams.get('trainingNode')) || null);
        if (config) {
            const base = `/record/${recordId(pid)}?training=${trainingId}&trainingNode=${config.nid}`;
            extra = '<div class="preview-result-examples"><span>评测结果示例：</span><a href="' + base + '&verdict=wa">WA 与返回修改</a><a href="' + base + '&verdict=ac">AC 与下一题</a><a href="' + base + '&verdict=judging">评测中与实时刷新</a></div>';
        }
    }
    if (!config) return html;
    return html.replace('<main class="preview-width preview-main">', '<main class="preview-width preview-main main">')
        .replace('</head>', '<link rel="stylesheet" href="/preview/training.css"></head>')
        .replace('</main>', extra + '</main>')
        .replace('</body>', configScript(config) + '</body>');
}

function recordPage(url) {
    const match = /^\/record\/a{20}(\d{4})$/.exec(url.pathname);
    if (!match) return null;
    const pid = Number(match[1]);
    if (!pdocs[pid] || url.searchParams.get('training') !== trainingId) return null;
    const status = ({ ac: 1, wa: 2, judging: 20 })[url.searchParams.get('verdict')] || 2;
    const data = context(pid, status, Number(url.searchParams.get('trainingNode')) || null, 'record');
    if (!data) return null;
    const statusText = status === 1 ? 'Accepted' : status === 2 ? 'Wrong Answer' : 'Judging';
    const title = pdocs[pid].title;
    let html = shell(`评测记录 · ${title}`, '/workbench', '<div class="preview-heading"><div><h1>评测记录</h1><p>' + esc(title) + ' · C++17 · 固定示例</p></div><label>切换结果示例 <select id="preview-verdict"><option value="20"' + (status === 20 ? ' selected' : '') + '>评测中</option><option value="2"' + (status === 2 ? ' selected' : '') + '>Wrong Answer</option><option value="1"' + (status === 1 ? ' selected' : '') + '>Accepted</option></select></label></div>'
        + '<div class="preview-layout"><div><section class="section" id="status" data-status="' + status + '"><div class="section__header"><h2 class="section__title record-status--text ' + (status === 1 ? 'pass' : status === 2 ? 'fail' : 'progress') + '" id="preview-verdict-text">' + statusText + '</h2></div><div class="section__body"><p>此处用于核对评测状态变化与训练入口，未执行判题。</p><table class="data-table"><thead><tr><th>测试点</th><th>结果示例</th><th>耗时</th><th>内存</th></tr></thead><tbody><tr><td>#1</td><td id="preview-case-text">' + statusText + '</td><td>4 ms</td><td>2.1 MiB</td></tr></tbody></table></div></section><section class="section"><div class="section__header"><h2 class="section__title">代码</h2></div><pre class="section__body"><code id="preview-record-code" data-pid="' + pid + '">// 示例提交代码</code></pre></section></div>'
        + '<aside class="section preview-sidebar"><div class="section__body"><h2 class="section__title">提交信息</h2><dl><dt>题目</dt><dd>' + esc(title) + '</dd><dt>用户</dt><dd>预览同学</dd><dt>语言</dt><dd>C++17</dd></dl><p>选择 Accepted，可检查训练入口在本页更新为下一题。</p></div></aside></div>', 'record-detail');
    html = html.replace('<main class="preview-width preview-main">', '<main class="preview-width preview-main main">');
    return html.replace('</head>', '<link rel="stylesheet" href="/preview/training.css"></head>')
        .replace('</body>', configScript(data) + '</body>');
}

function refresh(url) {
    const match = /^a{20}(\d{4})$/.exec(url.searchParams.get('rid') || '');
    if (!match || url.searchParams.get('training') !== trainingId) return { ok: true, data: null };
    return { ok: true, data: context(Number(match[1]), Number(url.searchParams.get('previewStatus')) || 20, Number(url.searchParams.get('trainingNode')) || null, 'record') };
}

module.exports = { decorate, recordPage, refresh, workbenchPayload };
