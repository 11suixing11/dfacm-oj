(function () {
    'use strict';
    const app = document.getElementById('ai-watch');
    if (!app || app.dataset.bound) return;
    app.dataset.bound = '1';
    const get = id => document.getElementById(id);
    const form = get('aw-filters'); const dialog = get('aw-detail');
    const labels = { high: '优先复核', medium: '关注', low: '常规', insufficient: '线索不足' };
    const reviewLabels = { pending: '待复核', cleared: '已排除', escalated: '需核实' };
    const strengths = { traceable: '来源关联', context: '相似度线索', weak: '弱线索' };
    const verdicts = { 0: '等待中', 1: 'AC', 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE', 7: 'CE', 8: 'SE', 9: '取消', 20: '评测中', 21: '编译中', 22: '已抓取', 31: '忽略' };
    let csrf = app.dataset.csrf; let timer; let listBusy = false; let paused = false; let cursor = ''; let nextCursor = null;
    let refreshQueued = false; let lastHealth = null; let detailRequest = 0; let failureCount = 0; let latestRows = []; let known = new Set(); let initialized = false; let query = '';

    function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = String(text); return element; }
    function safeUrl(value) { const url = new URL(value, location.href); if (url.origin !== location.origin) throw new Error('接口地址无效。'); return url; }
    function stamp(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—'; }
    function time(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—'; }
    async function request(value, options = {}) {
        const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(safeUrl(value), { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal });
            let payload; try { payload = await response.json(); } catch (e) { if (controller.signal.aborted) throw e; throw new Error('会话或接口异常，请刷新页面后重试。'); }
            if (!response.ok || payload.ok === false) { const error = new Error(payload.message || '请求失败。'); error.status = response.status; throw error; }
            return payload;
        } catch (e) { if (controller.signal.aborted) throw new Error('请求超时，请检查连接后重试。'); throw e; }
        finally { clearTimeout(deadline); }
    }
    function link(value, title, className) { const element = node('a', className, title); element.href = safeUrl(value).href; element.target = '_blank'; element.rel = 'noopener'; return element; }
    function priority(report) { return node('span', `aw-priority aw-priority-${report.priority}`, labels[report.priority] || '线索不足'); }
    function error(message) { get('aw-error').hidden = !message; get('aw-error').textContent = message || ''; }
    function showHealth() {
        const indicator = get('aw-health'); const online = lastHealth?.online && failureCount === 0;
        indicator.classList.toggle('is-online', Boolean(online && !paused));
        indicator.replaceChildren(node('i'), document.createTextNode(paused ? '刷新已暂停' : failureCount ? '监测连接中断' : online ? '实时监测中' : !lastHealth ? '正在连接' : lastHealth.enabled ? '监测连接中断' : '监测未启用'));
    }

    function rows(reports) {
        const body = get('aw-rows'); body.replaceChildren();
        if (!reports.length) { const row = node('tr'); const cell = node('td', 'aw-empty', '当前筛选没有提交记录。'); cell.colSpan = 7; row.append(cell); body.append(row); return; }
        for (const report of reports) {
            const row = node('tr'); row.dataset.rid = report.rid;
            const first = node('td'); const main = node('div', 'aw-record-main'); main.append(node('span', '', `P${report.pid}`));
            if (initialized && !known.has(report.rid)) main.append(node('span', 'aw-new', '新提交'));
            first.append(main, node('div', 'aw-record-sub', `${time(report.submittedAt)} · ${report.lang || '未知语言'}`), node('div', 'aw-record-sub aw-mono', report.rid.slice(-8)));
            const uid = node('td', 'aw-mono', `#${report.uid}`); const verdict = node('td');
            verdict.append(node('span', `aw-verdict ${report.verdict === 1 ? 'aw-verdict-ac' : report.verdict === 2 ? 'aw-verdict-wa' : ''}`, verdicts[report.verdict] || String(report.verdict)));
            const rank = node('td'); rank.append(priority(report));
            rank.append(node('small', 'aw-score', report.state === 'ready' ? `复核分 ${report.score} / 100` : report.state === 'failed' ? '分析失败' : '正在分析'));
            const signal = node('td', 'aw-signal'); const primary = report.signals[0];
            signal.append(node('span', '', primary?.title || (report.state === 'ready' ? report.priority === 'insufficient' ? '可用线索不足' : '未发现已配置的线索' : report.state === 'failed' ? '未作出分析结论' : '等待后台分析')));
            signal.append(node('small', '', primary ? strengths[primary.strength] || '' : '无法由此确认代码作者'));
            const review = node('td'); review.append(node('span', `aw-review aw-review-${report.review.status}`, reviewLabels[report.review.status]));
            const action = node('td'); const button = node('button', 'aw-button', '查看证据'); button.type = 'button'; button.dataset.rid = report.rid; button.setAttribute('aria-label', `查看 UID ${report.uid} 的 P${report.pid} 提交证据`); action.append(button);
            row.append(first, uid, verdict, rank, signal, review, action); body.append(row);
        }
        reports.forEach(report => known.add(report.rid)); initialized = true;
    }
    function render(payload) {
        latestRows = payload.reports; rows(payload.reports); nextCursor = payload.nextCursor;
        get('aw-next').disabled = !nextCursor; get('aw-first').hidden = !cursor;
        get('aw-total').textContent = payload.stats.total; get('aw-high').textContent = payload.stats.high;
        get('aw-pending').textContent = payload.stats.pending; get('aw-reviewed').textContent = payload.stats.cleared + payload.stats.escalated;
        const health = payload.health; lastHealth = health; showHealth();
        get('aw-scope').textContent = `${health.scope === 'contests' ? '比赛提交' : '比赛与练习提交'} · ${health.contests.length ? `${health.contests.length} 场指定比赛` : '当前域'} · 后台扫描 ${health.intervalMs / 1000} 秒 / 次`;
        get('aw-retention').textContent = health.retentionDays;
        const days = form.elements.days.value; get('aw-window').textContent = days === '1' ? '最近 24 小时' : `最近 ${days} 天`;
        get('aw-updated').textContent = `更新于 ${time(payload.generatedAt)} · 北京时间${cursor ? ' · 历史页' : ''}`;
    }
    function schedule() {
        clearTimeout(timer);
        if (!paused && !document.hidden && app.isConnected) timer = setTimeout(refresh, Math.min(30000, 2000 * Math.max(1, 2 ** Math.min(failureCount, 4))));
    }
    async function refresh() {
        if (!app.isConnected) return;
        if (listBusy) { refreshQueued = true; return; }
        listBusy = true; const selectedQuery = query; const selectedCursor = cursor;
        get('aw-refresh').disabled = true;
        try {
            const url = safeUrl(app.dataset.endpoint); url.search = query; if (cursor) url.searchParams.set('cursor', cursor);
            const payload = await request(url); failureCount = 0;
            if (selectedQuery === query && selectedCursor === cursor) { render(payload); error(''); }
        } catch (e) { failureCount++; error(e.message); showHealth(); }
        finally {
            listBusy = false; get('aw-refresh').disabled = false;
            if (refreshQueued && app.isConnected) { refreshQueued = false; void refresh(); } else schedule();
        }
    }

    function codeBlock(title, code) { const block = node('div', 'aw-code'); block.append(node('h4', '', title), node('pre', '', code || '该证据源码不可用或已过期。')); return block; }
    function section(title) { const element = node('section', 'aw-detail-section'); element.append(node('h3', '', title)); return element; }
    function drawDetail(payload) {
        const report = payload.report; const analysis = report.analysis; const activeRequest = detailRequest;
        const content = get('aw-detail-content'); content.replaceChildren();
        get('aw-detail-title').textContent = `P${report.pid} · UID ${report.uid}`;
        const meta = node('div', 'aw-detail-meta'); meta.append(priority(report), node('span', '', `复核分 ${report.score} / 100`), node('span', '', stamp(report.submittedAt)), link(report.recordUrl, '原始提交 ↗'));
        content.append(meta);
        const evidence = section('线索与依据');
        if (!analysis?.signals.length) evidence.append(node('p', '', report.state === 'ready' ? '当前规则未提供足以判断作者的线索。' : '分析尚未完成或暂时失败，不能据此形成结论。'));
        for (const signal of analysis?.signals || []) {
            const card = node('article', 'aw-evidence-card'); const title = node('h3', '', signal.title); title.append(node('span', 'aw-evidence-strength', strengths[signal.strength]));
            card.append(title, node('p', '', signal.detail));
            if (signal.metrics?.similarity !== undefined) card.append(node('p', 'aw-mono', `词法指纹相似度 ${(signal.metrics.similarity * 100).toFixed(1)}% · 非 AI 概率`));
            if (signal.reference?.completedAt) card.append(node('p', '', `站内生成时间：${stamp(signal.reference.completedAt)}`));
            if (signal.reference?.uid) card.append(node('p', '', `对照提交选手：UID ${signal.reference.uid}`));
            card.append(node('p', 'aw-caveat', signal.caveat)); evidence.append(card);
        }
        content.append(evidence);
        const coverage = node('div', 'aw-coverage'); const counts = analysis?.coverage;
        if (counts) coverage.append(node('span', '', `${counts.tokenCount} 个词法单元`), node('span', '', `${counts.historyCount} 份本人历史`), node('span', '', `${counts.peerCount} 份同题对照`), node('span', '', `${counts.sourceCount} 份站内 AI 来源`));
        content.append(coverage);
        const limits = node('div', 'aw-limitations aw-detail-section'); limits.append(node('h3', '', '分析边界'));
        const ul = node('ul'); for (const value of analysis?.limitations || ['检测仍在处理中，未作出作者判断。']) ul.append(node('li', '', value)); limits.append(ul); content.append(limits);
        const sources = section('源码对照'); const grid = node('div', 'aw-code-grid'); const comparison = payload.evidence.assistant || payload.evidence.peer;
        if (!comparison) grid.classList.add('is-single'); grid.append(codeBlock('本次提交', payload.evidence.code));
        if (payload.evidence.assistant) grid.append(codeBlock('本人先前获取的站内 AI 输出', payload.evidence.assistant.code));
        else if (payload.evidence.peer) grid.append(codeBlock(`同场对照 · UID ${payload.evidence.peer.uid}`, payload.evidence.peer.code));
        sources.append(grid); content.append(sources);
        const review = section('记录人工复核'); const reviewForm = node('form', 'aw-review-form');
        const statusLabel = node('label', '', '复核状态'); const select = node('select'); select.name = 'status';
        for (const [value, label] of Object.entries(reviewLabels)) { const option = node('option', '', label); option.value = value; select.append(option); } select.value = report.review.status; statusLabel.append(select);
        const noteLabel = node('label', '', '复核依据'); const textarea = node('textarea'); textarea.name = 'note'; textarea.maxLength = 500; textarea.value = report.review.note || ''; textarea.placeholder = '记录核实的比赛规则、选手解释或排除原因。'; noteLabel.append(textarea);
        const actions = node('div', 'aw-review-actions'); const save = node('button', 'aw-button aw-primary', '保存复核'); save.type = 'submit'; const message = node('span', 'aw-review-message'); message.setAttribute('role', 'status'); actions.append(save, message);
        reviewForm.append(statusLabel, noteLabel, actions); review.append(reviewForm);
        const history = node('div', 'aw-history');
        function drawHistory() {
            history.replaceChildren();
            for (const event of [...report.reviewHistory].reverse()) history.append(node('p', '', `${stamp(event.updatedAt)} · 管理员 ${event.reviewer} · ${reviewLabels[event.status]}：${event.note}`));
        }
        drawHistory();
        review.append(history); content.append(review);
        reviewForm.addEventListener('submit', async event => {
            event.preventDefault(); save.disabled = true; message.textContent = '正在保存…';
            try {
                const response = await request(report.detailUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csrf, status: select.value, note: textarea.value, revision: report.review.revision }) });
                report.review = response.report.review; report.reviewHistory = response.report.reviewHistory;
                if (activeRequest === detailRequest && dialog.open) { drawHistory(); message.textContent = '复核已保存。'; }
                await refresh();
            } catch (e) { if (activeRequest === detailRequest && dialog.open) message.textContent = e.message; }
            finally { save.disabled = false; }
        });
    }
    async function openDetail(report) {
        const id = ++detailRequest;
        get('aw-detail-title').textContent = `P${report.pid} · UID ${report.uid}`;
        get('aw-detail-content').replaceChildren(node('p', 'aw-subtitle', '正在读取证据…'));
        if (!dialog.open) dialog.showModal();
        try { const payload = await request(report.detailUrl); if (id !== detailRequest || !dialog.open) return; csrf = payload.csrf; drawDetail(payload); }
        catch (e) { if (id === detailRequest) get('aw-detail-content').replaceChildren(node('p', 'aw-error', e.message)); }
    }

    get('aw-rows').addEventListener('click', event => { const button = event.target.closest('button[data-rid]'); if (button) { const report = latestRows.find(v => v.rid === button.dataset.rid); if (report) void openDetail(report); } });
    get('aw-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => { detailRequest++; });
    get('aw-refresh').addEventListener('click', () => void refresh());
    get('aw-pause').addEventListener('click', () => { paused = !paused; get('aw-pause').textContent = paused ? '继续刷新' : '暂停刷新'; showHealth(); if (paused) clearTimeout(timer); else void refresh(); });
    form.addEventListener('submit', event => { event.preventDefault(); const params = new URLSearchParams(); new FormData(form).forEach((value, key) => { if (value) params.set(key, value); }); query = params.toString(); cursor = ''; void refresh(); });
    get('aw-next').addEventListener('click', () => { if (nextCursor) { cursor = nextCursor; void refresh(); } });
    get('aw-first').addEventListener('click', () => { cursor = ''; void refresh(); });
    get('aw-theme').addEventListener('click', () => { const dark = document.documentElement.classList.toggle('dark'); try { localStorage.setItem('dfacm-ai-watch-theme', dark ? 'dark' : 'light'); } catch {} });
    if (app.dataset.demo === 'true') {
        get('aw-demo').hidden = false; get('aw-demo-submit').hidden = false;
        try { if (localStorage.getItem('dfacm-ai-watch-theme') === 'dark') document.documentElement.classList.add('dark'); } catch {}
        get('aw-demo-submit').addEventListener('click', async () => { const button = get('aw-demo-submit'); button.disabled = true; try { await request('/manage/ai-watch/demo-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csrf }) }); cursor = ''; await refresh(); } catch (e) { error(e.message); } finally { button.disabled = false; } });
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (!paused) void refresh(); });
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', () => { if (!paused && !listBusy) void refresh(); });
    void refresh();
}());
