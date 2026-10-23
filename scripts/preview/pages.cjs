'use strict';

const { problems, trainingId, chapters } = require('./fixtures.cjs');
const { catalogFor, docs: catalogDocs } = require('./catalog.cjs');
const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const route = '/training/' + trainingId;

function previewNote() {
  return '<aside class="preview-note" aria-label="本地预览说明"><span>本地设计预览 · 题目与进度为固定示例</span><a href="/">首页</a><a href="/p">题库</a><a href="/training">训练</a><a href="/workbench">工作台</a><a href="/mistakes">错题本</a></aside>';
}
const logo = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="preview-brand-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c3e78"/><stop offset="1" stop-color="#0c1a36"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="15" fill="url(#preview-brand-bg)" stroke="#c9a227"/><path d="M20 21 12 32l8 11m24-22 8 11-8 11" fill="none" stroke="#e8edf5" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="m24 43 9-17 4 7 3-4 6 14Z" fill="#e8edf5"/><path d="m33 26 4 7 3-4 2 4-5 1Z" fill="#e9c455"/><circle cx="34" cy="20" r="1.5" fill="#e9c455"/></svg>';

function shell(title, active, content, pageName) {
  const links = [['/', '首页'], ['/workbench', '工作台'], ['/p', '题库'], ['/training', '训练'], ['/mistakes', '错题本']];
  return '<!doctype html><html lang="zh-CN" class="theme--light layout--basic" data-page="' + pageName + '"><head>'
    + '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="theme-color" content="#f4f7fb"><title>' + esc(title) + ' · d&amp;f算法网 · 本地预览</title>'
    + '<link rel="icon" href="/favicon.png"><script>try{var t=new URLSearchParams(location.search).get("theme")||localStorage.getItem("swpu-theme");if(t==="dark")document.documentElement.className="theme--dark layout--basic"}catch(e){}</script>'
    + '<link rel="stylesheet" href="/preview/layout.css"><link rel="stylesheet" href="/preview/brand.css">'
    + '<script src="/preview/ui.js" defer></script></head><body>'
    + previewNote()
    + '<header class="nav preview-nav"><div class="preview-width"><a class="preview-brand" href="/">' + logo + '<span><b>d&amp;f算法网</b><small>ONLINE JUDGE</small></span></a>'
    + '<nav class="preview-nav-links" aria-label="站点导航">' + links.map(([url, label]) => '<a href="' + url + '" class="nav__item' + (url === active ? ' nav__item--active' : '') + '"' + (url === active ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>'
    + '<button class="preview-theme" id="preview-theme" type="button" aria-label="切换到夜间模式">夜间</button></div></header>'
    + '<main class="preview-width preview-main">' + content + '</main>'
    + '<footer class="preview-footer"><div class="preview-width"><span>每个人都能在算法竞赛这条路上找到属于自己的 final。</span><span>d&amp;f算法网 · SUMMIT</span></div></footer></body></html>';
}
const topicList = [...new Set(problems.map((p) => p.topic))];
const statusNames = { accepted: '已通过', attempted: '尝试过', todo: '未开始' };
function problemRows(items) {
  return items.map((p) => '<tr data-status="' + p.status + '"><td class="col--status"><span class="preview-status record-status--text ' + (p.status === 'accepted' ? 'pass' : p.status === 'attempted' ? 'warn' : 'progress') + '" role="img" aria-label="' + statusNames[p.status] + '" title="' + statusNames[p.status] + '">' + (p.status === 'accepted' ? '✓' : p.status === 'attempted' ? '◔' : '·') + '</span></td>'
    + '<td class="col--id">' + p.id + '</td><td class="col--problem-name"><a href="/p/' + p.id + '">' + esc(p.title) + '</a><span class="preview-topic">' + esc(p.topic) + '</span></td>'
    + '<td class="col--difficulty"><span class="preview-level">' + p.level + '</span></td><td class="col--rate">' + p.rate + '</td></tr>').join('');
}
function problemList() {
  return shell('题库', '/p', '<div class="preview-heading"><div><span class="preview-kicker">EXPLORE / PROBLEMS</span><h1>下一题，从这里开始。</h1><p>按知识点找到练习，用每一次 Accepted 积累进步。</p></div><a class="button" href="' + route + '">查看训练路线 →</a></div>'
    + '<div class="preview-layout"><div><section class="section" aria-label="题目列表"><div class="preview-tools">'
    + '<label class="preview-search"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.6"/></svg><input id="problem-search" type="search" placeholder="搜索题号或题目名称" aria-label="搜索题号或题目名称"></label>'
    + '<select id="problem-topic" aria-label="筛选知识点"><option value="">全部知识点</option>' + topicList.map((t) => '<option>' + esc(t) + '</option>').join('') + '</select>'
    + '<select id="problem-level" aria-label="筛选难度"><option value="">全部难度</option><option>入门</option><option>基础</option><option>进阶</option></select></div>'
    + '<div class="preview-filter-row" role="group" aria-label="筛选题目状态"><button type="button" data-filter="all" aria-pressed="true">全部题目</button><button type="button" data-filter="todo" aria-pressed="false">未开始</button><button type="button" data-filter="attempted" aria-pressed="false">尝试过</button><button type="button" data-filter="accepted" aria-pressed="false">已通过</button><span class="preview-count" id="problem-count" aria-live="polite">12 道示例题目</span></div>'
    + '<table class="data-table" id="problem-table"><thead><tr><th class="col--status" scope="col"><span aria-label="状态">状态</span></th><th class="col--id" scope="col">题号</th><th scope="col">题目</th><th class="col--difficulty" scope="col">难度</th><th class="col--rate" scope="col">通过率</th></tr></thead><tbody id="problem-rows">' + problemRows(problems.slice(0, 8)) + '</tbody></table>'
    + '<div class="preview-empty" id="problem-empty" hidden><strong>没有找到匹配的题目</strong>试试其他关键词，或清除筛选。<br><button class="button" type="button" id="problem-reset">清除筛选</button></div>'
    + '<div class="preview-table-footer"><span id="problem-range">1–8 / 12</span><nav class="preview-pager" aria-label="题目分页"><button class="pager__item" id="problem-prev" aria-label="上一页" type="button" disabled>‹</button><button class="pager__item current" id="problem-page-1" type="button" aria-current="page">1</button><button class="pager__item" id="problem-page-2" type="button">2</button><button class="pager__item" id="problem-next" aria-label="下一页" type="button">›</button></nav></div></section></div>'
    + '<aside class="preview-sidebar"><details class="section preview-topics" open><summary>按知识点练习</summary><div class="section__body"><button class="menu__link active" data-topic="" type="button">全部知识点</button>' + topicList.map((t) => '<button class="menu__link" type="button" data-topic="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div></details>'
    + '<section class="section"><div class="section__body"><span class="preview-kicker">FIND YOUR FINAL</span><h2 class="section__title">从大本营出发</h2><p class="preview-tip" style="margin-top:12px">不知道选哪道题？沿着章节路线，从语言基础逐步走向算法专题。<br><a href="' + route + '">打开登顶训练 →</a></p></div></section></aside></div>', 'problem-list');
}
const statementData = {
  P1000: { description: '输入两个整数 a 和 b，输出它们的和。', input: '一行，包含两个以空格分隔的整数 a 和 b。', output: '一行，输出 a + b 的值。', sampleIn: '1 2', sampleOut: '3', constraint: '−10⁹ ≤ a, b ≤ 10⁹', hint: '读入两个整数，再输出它们的和。可以使用 long long 保存结果。' },
  P1001: { description: '给定一个正整数 n，计算从 1 到 n 的所有整数之和。', input: '一行，包含一个正整数 n。', output: '一行，输出 1 + 2 + … + n 的值。', sampleIn: '5', sampleOut: '15', constraint: '1 ≤ n ≤ 10⁹', hint: '当 n = 5 时，1 + 2 + 3 + 4 + 5 = 15。注意结果可能超出 32 位整数的范围。' },
  P1002: { description: '给定一个从小到大排列的整数序列和整数 x，找到最后一个小于或等于 x 的元素的位置。位置从 1 开始编号；不存在时输出 0。', input: '第一行包含 n 和 x。第二行包含 n 个按非降序排列的整数。', output: '输出最后一个满足条件的位置。', sampleIn: '5 4\n1 2 4 4 7', sampleOut: '4', constraint: '1 ≤ n ≤ 2 × 10⁵；−10⁹ ≤ x, aᵢ ≤ 10⁹', hint: '样例中，第 3 个和第 4 个元素都等于 4，答案是最后一个位置 4。' },
};
function statementFor(problem) {
  if (statementData[problem.id]) return statementData[problem.id];
  return { ...statementData.P1001, description: '这是一道用于核对排版的固定示例题。给定一个正整数 n，计算从 1 到 n 的整数之和。此示例不对应线上“' + problem.title + '”的实际题面。' };
}
function problemDetail(id) {
  const p = problems.find((item) => item.id === id);
  if (!p) return null;
  const s = statementFor(p);
  const formula = '<div class="preview-formula"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>S</mi><mo>=</mo><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mi>i</mi><mo>=</mo><mfrac><mrow><mi>n</mi><mo>(</mo><mi>n</mi><mo>+</mo><mn>1</mn><mo>)</mo></mrow><mn>2</mn></mfrac></mrow></math></div>';
  return shell(p.title, '/p', '<nav class="preview-breadcrumb" aria-label="当前位置"><a href="/p">题库</a><span aria-hidden="true">/</span><span>' + p.id + '</span></nav>'
    + '<div class="preview-heading"><div><span class="preview-kicker">' + p.id + ' / ' + esc(p.topic) + '</span><h1>' + esc(p.title) + '</h1><div class="preview-problem-meta"><span>时间限制 1000 ms</span><span>内存限制 256 MiB</span><span>标准输入 / 输出</span><span class="preview-level">' + p.level + '</span></div></div><a class="button primary" href="#code-editor">开始编写 →</a></div>'
    + '<div class="preview-layout preview-problem-layout"><div><section class="section"><div class="preview-tabs" role="tablist" aria-label="题目内容"><button class="preview-tab scratchpad__tab-active" id="tab-statement" role="tab" aria-controls="panel-statement" aria-selected="true" type="button">题目描述</button><button class="preview-tab" id="tab-records" role="tab" aria-controls="panel-records" aria-selected="false" tabindex="-1" type="button">示例提交</button></div>'
    + '<article class="section__body typo richmedia preview-statement" id="panel-statement" role="tabpanel" aria-labelledby="tab-statement"><h2>题目描述</h2><p>' + esc(s.description) + '</p><h2>输入格式</h2><p>' + esc(s.input) + '</p><h2>输出格式</h2><p>' + esc(s.output) + '</p><h2>样例</h2><div class="preview-samples"><div><div class="preview-sample-head"><span>输入 #1</span><button class="preview-copy" type="button" data-copy="sample-input">复制</button></div><pre><code id="sample-input">' + esc(s.sampleIn) + '</code></pre></div><div><div class="preview-sample-head"><span>输出 #1</span><button class="preview-copy" type="button" data-copy="sample-output">复制</button></div><pre><code id="sample-output">' + esc(s.sampleOut) + '</code></pre></div></div><h2>数据范围与说明</h2><p>' + esc(s.constraint) + '</p><p>' + esc(s.hint) + '</p>' + (id === 'P1001' ? formula : '') + '</article>'
    + '<div class="section__body" id="panel-records" role="tabpanel" aria-labelledby="tab-records" hidden><p class="preview-tip">以下为固定示例，用于展示提交记录样式。</p><table class="data-table"><thead><tr><th scope="col">状态</th><th scope="col">语言</th><th scope="col">耗时</th><th scope="col">内存</th></tr></thead><tbody><tr><td><span class="record-status--text pass">✓ Accepted</span></td><td>C++17</td><td>4 ms</td><td>2.1 MiB</td></tr><tr><td><span class="record-status--text fail">× Wrong Answer</span></td><td>C++17</td><td>4 ms</td><td>2.1 MiB</td></tr></tbody></table></div></section>'
    + '<section class="section" id="code-editor"><div class="section__header"><h2 class="section__title">编写代码</h2><span class="preview-editor-label">本地编辑预览</span></div><div class="section__body"><div class="preview-editor-tools"><label for="code-language" class="preview-editor-label">语言</label><select id="code-language"><option>C++17</option><option>Python 3</option><option>Java 17</option></select><button class="preview-copy" type="button" data-copy="preview-code">复制代码</button></div>'
    + '<label for="preview-code" class="preview-editor-label">代码</label><textarea class="preview-code" id="preview-code" spellcheck="false">#include &lt;bits/stdc++.h&gt;\nusing namespace std;\n\nint main() {\n    // 从这里开始写下你的答案\n    return 0;\n}</textarea>'
    + '<div class="preview-editor-foot"><p>输入保留在当前页，供体验编辑与复制。</p><button class="button primary" type="button" id="preview-submit">查看评测说明</button></div><p class="preview-editor-message" id="preview-editor-message" role="status" hidden>这是本地设计预览。代码尚未提交；上线后使用 Hydro 原生评测。</p></div></section></div>'
    + '<aside class="preview-sidebar"><section class="section"><div class="section__header"><h2 class="section__title">题目信息</h2></div><div class="section__body"><dl><dt>题号</dt><dd>' + id + '</dd><dt>知识点</dt><dd>' + esc(p.topic) + '</dd><dt>通过率</dt><dd>' + p.rate + '</dd><dt>示例提交数</dt><dd>' + p.submissions.toLocaleString('en-US') + '</dd><dt>你的示例状态</dt><dd class="record-status--text ' + (p.status === 'accepted' ? 'pass' : p.status === 'attempted' ? 'warn' : 'progress') + '">' + statusNames[p.status] + '</dd></dl></div></section><section class="section"><div class="section__body"><span class="preview-kicker">ON YOUR WAY</span><h2 class="section__title">沿着路线继续</h2><p class="preview-tip" style="margin-top:12px">当前示例章节：林间小径<br>学习分支与循环，积累解题手感。<br><a href="' + route + '">回到训练路线 →</a></p></div></section></aside></div>', 'problem-detail');
}
function trainingList(url) {
  const data = catalogFor(url);
  const pager = Array.from({ length: data.pages }, (_, i) => {
    const target = new URL(url); target.searchParams.set('page', String(i + 1));
    return '<a class="pager__item' + (i + 1 === data.page ? ' current' : '') + '" href="' + esc(target.pathname + target.search) + '"' + (i + 1 === data.page ? ' aria-current="page"' : '') + '>' + (i + 1) + '</a>';
  }).join('');
  // Native list/form/pager contract. The actual addon frontend enhances it.
  const native = data.items.length ? '<ol class="section__list all primary training__list">' + data.items.map((item) => '<li class="section__list__item training__item"><h2><a href="' + esc(item.url) + '">' + esc(item.title) + '</a></h2></li>').join('') + '</ol>'
    : '<p class="section__body">没有找到匹配的训练，请调整搜索词或清除筛选。</p>';
  return shell('训练目录', '/training', '<div class="preview-heading"><div><span class="preview-kicker">TRAINING / EXPLORE</span><h1>找到适合你的训练。</h1><p>入门打基础、专题补短板、备赛练真题。每条路线独立记录进度。</p></div><a class="button" href="/workbench">返回训练工作台 →</a></div>'
    + '<section class="section"><div class="section__header"><h2 class="section__title">训练目录</h2><div class="section__tools"><form name="filter-form" method="get" action="/training"><input type="search" name="q" value="' + esc(data.q) + '" aria-label="搜索训练名称">' + (data.member ? '' : '<input type="hidden" name="member" value="0">') + '<button class="button" type="submit">搜索</button></form></div></div>' + native
    + '<nav class="preview-pager section__body" aria-label="训练分页">' + pager + '</nav></section>'
    + '<script type="application/json" id="preview-catalog-data">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script><script src="/preview/training.js" defer></script>', 'training-list')
    .replace('</head>', '<link rel="stylesheet" href="/preview/catalog.css"></head>');
}
function chapterList() {
  return '<ol class="preview-chapters">' + chapters.map((ch, i) => {
    const completed = ch.done === ch.total, current = i === 1, locked = i > 1;
    return '<li class="preview-chapter' + (completed ? ' complete' : current ? ' current' : '') + '"><span class="chapter-index" aria-hidden="true">' + (completed ? '✓' : String(i + 1).padStart(2, '0')) + '</span><div><h3>' + esc(ch.name) + '</h3><p>' + esc(ch.topic) + ' · ' + ch.total + ' 题</p></div><div class="chapter-state">'
      + (current ? '<strong>学习中 · ' + ch.done + ' / ' + ch.total + '</strong><a class="button primary" href="/p/P1001">继续 →</a>' : completed ? '<strong>已完成</strong><a class="button" href="/p/P1000">回顾</a>' : '<span>待解锁</span><span>完成上一章后开启</span>') + '</div></li>';
  }).join('') + '</ol>';
}
function trainingDetail(id = trainingId) {
  if (id !== trainingId) {
    const doc = catalogDocs.find((item) => item.docId === id);
    if (!doc) return null;
    return shell(doc.title, '/training', '<nav class="preview-breadcrumb"><a href="/training">训练目录</a><span>/</span><span>' + esc(doc.title) + '</span></nav><div class="preview-heading"><div><h1>' + esc(doc.title) + '</h1><p>' + esc(doc.description) + '</p></div></div><section class="section"><div class="section__body"><h2 class="section__title">' + doc.dag.length + ' 小节 · ' + doc.dag.flatMap((node) => node.pids).length + ' 道题</h2><p class="preview-tip" style="margin-top:16px">这条训练已列入目录预览。本地未载入它的完整章节与题目；上线时会打开这条路线原有的 Hydro 详情页。</p><a class="button" href="/training" style="margin-top:16px">返回全部训练</a></div></section>', 'training-detail');
  }
  return shell('从零登顶 · 算法基础', '/training', '<nav class="preview-breadcrumb" aria-label="当前位置"><a href="/training">训练计划</a><span aria-hidden="true">/</span><span>从零登顶</span></nav>'
    + '<div class="preview-heading"><div><span class="preview-kicker">BASE CAMP → SUMMIT</span><h1>从零登顶 · 算法基础</h1><p>396 道练习，8 个递进章节。一题一题，走到属于自己的 final。</p></div><a class="button" href="/workbench">查看我的进度 →</a></div>'
    + '<div class="preview-layout"><div><section class="section"><div class="section__body"><div class="preview-route-overview"><div><h2>下一段山路：林间小径</h2><p class="preview-tip">已完成语言基础。现在继续练习分支与循环。</p></div><a class="button primary" href="/p/P1001">做下一题 →</a></div><div class="preview-progress" role="progressbar" aria-label="示例训练进度" aria-valuenow="17" aria-valuemin="0" aria-valuemax="100"><span style="width:17%"></span></div><div class="preview-progress-caption"><span>已完成 68 / 396 题 · 固定示例</span><span>17%</span></div></div></section>' + chapterList() + '</div>'
    + '<aside class="preview-sidebar"><section class="section"><div class="section__header"><h2 class="section__title">训练须知</h2></div><div class="section__body"><p class="preview-tip">按章节循序练习，每道题通过后计入进度。下一章节的解锁条件由训练计划配置决定。</p><p class="preview-tip" style="margin-top:14px">本页展示固定示例，便于核对章节状态与布局。</p></div></section><section class="section"><div class="section__body"><h2 class="section__title">留一点时间给复盘</h2><p class="preview-tip" style="margin-top:12px">遇到未通过的题目，把错误原因写下来。<br><a href="/mistakes">打开错题本 →</a></p></div></section></aside></div>', 'training-detail');
}
function render(pathname, url = new URL(pathname, 'http://127.0.0.1')) {
  if (pathname === '/p') return problemList();
  if (/^\/p\/P\d+$/.test(pathname)) return problemDetail(pathname.split('/').pop());
  if (pathname === '/training') return trainingList(url);
  if (/^\/training\/[a-f0-9]+$/.test(pathname)) return trainingDetail(pathname.split('/').pop());
  return null;
}
module.exports = { render, previewNote, shell };
