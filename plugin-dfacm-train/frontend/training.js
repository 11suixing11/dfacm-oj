'use strict';

// Only navigation metadata crosses pages. Native editor contents, submit fields,
// self-test requests, judging sockets and assistant configuration stay with Hydro.
function localUrl(value, location) {
    if (typeof value !== 'string' || !value) return null;
    try {
        const base = new URL(location.href);
        const result = new URL(value, base);
        return ['http:', 'https:'].includes(result.protocol) && result.origin === base.origin
            && !result.username && !result.password ? result : null;
    } catch { return null; }
}

function withContext(value, config, location, nid = config.nid) {
    const url = localUrl(value, location);
    if (!url || url.searchParams.has('tid')) return value;
    url.searchParams.set('training', config.tid);
    if (nid !== null && nid !== undefined) url.searchParams.set('trainingNode', String(nid));
    else url.searchParams.delete('trainingNode');
    return url.pathname + url.search + url.hash;
}

function mountTrainingContext({ document, config, uiContext = {}, location, fetchImpl, Observer }) {
    if (!config || !/^[a-f\d]{24}$/i.test(config.tid)
        || !['training', 'problem', 'submit', 'record'].includes(config.page)
        || !localUrl(config.chapterUrl, location)) return null;
    const main = document.querySelector('.main');
    if (!main || document.getElementById('dfacm-training')) return null;
    let data = config;
    let disposed = false;
    let controller;
    let observer;
    let busy = false;
    let lastStatus = config.status;
    let statusRevision = 0;
    let refreshQueued = false;
    let progressStale = false;
    let error = '';
    const view = document.defaultView;
    const pending = (status) => [0, 20, 21, 22].includes(status);
    const wrap = document.createElement('div');
    wrap.className = 'row dfacm-training-wrap';
    const column = document.createElement('div');
    column.className = 'columns';
    const panel = document.createElement('section');
    panel.id = 'dfacm-training';
    panel.className = 'dfacm-training';
    panel.setAttribute('aria-label', '训练进度与下一步');
    const content = document.createElement('div');
    content.className = 'dfacm-training__content';
    const actions = document.createElement('div');
    actions.className = 'dfacm-training__actions';
    panel.append(content, actions);
    column.appendChild(panel);
    wrap.appendChild(column);
    main.insertBefore(wrap, main.firstChild);

    function element(tag, className, text) {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function link(text, href, primary = false) {
        const url = localUrl(href, location);
        if (!url) return;
        const anchor = element('a', `dfacm-training__link${primary ? ' dfacm-training__link--primary' : ''}`, text);
        anchor.href = url.pathname + url.search + url.hash;
        actions.appendChild(anchor);
    }
    function render() {
        panel.setAttribute('aria-busy', String(busy));
        content.textContent = '';
        actions.textContent = '';
        const route = element('a', 'dfacm-training__route', data.title);
        route.href = localUrl(data.chapterUrl, location)?.href || data.trainingUrl;
        content.appendChild(route);
        let title = data.chapterTitle || (data.completed ? '这条路线已完成' : '继续你的训练');
        let description = `路线进度：${Number(data.done) || 0} / ${Number(data.total) || 0} 题`;
        if (data.page === 'record') {
            if (data.status === 1) {
                title = data.completed ? 'Accepted · 这条路线已完成' : 'Accepted · 继续下一步';
            } else if ([2, 3, 4, 5, 6, 7].includes(data.status)) {
                title = !progressStale && data.problem?.accepted ? '本次未通过，此题已有 AC 记录' : '这次未通过，回到题目继续修改';
            } else if (pending(data.status)) {
                title = '正在评测，稍等一下';
            } else {
                title = '查看下方评测结果，再继续训练';
            }
            description = `${data.chapterTitle || '当前训练'} · ${description}`;
        }
        content.appendChild(element('h2', 'dfacm-training__title', title));
        content.appendChild(element('p', 'dfacm-training__meta', description));
        if (data.page === 'training') {
            if (data.next?.url) link(`继续做题 · ${data.next.title}`, data.next.url, true);
            link(data.completed ? '查看训练路线' : '查看当前章节', data.chapterUrl);
        } else if (data.page === 'record') {
            const passed = data.status === 1 || (!progressStale && data.problem?.accepted);
            if (passed && !progressStale && data.next?.url && data.next.pid !== data.problem?.pid) link(`下一题 · ${data.next.title}`, data.next.url, true);
            else if (!passed && data.problem?.url) link(pending(data.status) ? '返回题目' : '返回题目修改', data.problem.url, true);
            link('返回本章', data.chapterUrl, passed && !data.next?.url);
            if (passed && data.problem?.url) link('查看题目', data.problem.url);
            if (data.refreshUrl) {
                const refresh = element('button', 'dfacm-training__refresh', busy ? '正在更新…' : '更新训练进度');
                refresh.type = 'button'; refresh.disabled = busy;
                refresh.addEventListener('click', refreshProgress);
                actions.appendChild(refresh);
            }
        } else {
            link('返回本章', data.chapterUrl);
            link('训练工作台', data.workbenchUrl);
        }
        if (error) {
            const message = element('p', 'dfacm-training__message', error);
            message.setAttribute('role', 'status');
            content.appendChild(message);
        }
    }

    function viewingOther() {
        const uid = new URL(location.href).searchParams.get('uid');
        return data.page === 'training' && !!uid && Number(uid) !== data.viewerUid;
    }

    function revealChapter(hash = new URL(location.href).hash) {
        if (data.page !== 'training' || viewingOther()) return;
        const match = /^#node-([1-9]\d*)$/.exec(hash);
        if (!match || !data.unlockedNids?.includes(Number(match[1]))) return;
        const heading = document.getElementById(hash.slice(1));
        const section = heading?.closest('.training__section');
        if (!section) return;
        section.classList.remove('collapsed');
        section.classList.add('expanded');
        heading.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    }

    function onHashChange() { revealChapter(); }
    function onChapterClick(event) {
        if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target.closest?.('a[href]');
        const target = localUrl(anchor?.getAttribute('href'), location);
        const current = new URL(location.href);
        if (target && target.pathname === current.pathname && target.search === current.search) revealChapter(target.hash);
    }

    function matchesWithin(root, selector) {
        return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
    }

    function annotate(root = document) {
        if (data.page === 'training') {
            wrap.hidden = viewingOther();
            if (wrap.hidden) return;
            for (const anchor of matchesWithin(root, '.col--problem-name a[href], .col--status a[href]')) {
                const section = anchor.closest('.training__section');
                const heading = section?.querySelector('[id^="node-"]');
                const nid = Number(heading?.id.slice(5));
                if (!data.unlockedNids?.includes(nid)) continue;
                const href = anchor.getAttribute('href');
                const url = localUrl(href, location);
                if (!url || !/\/(?:p|record)\/[^/]+$/.test(url.pathname)) continue;
                const next = withContext(href, data, location, nid);
                if (next !== href) anchor.setAttribute('href', next);
            }
            return;
        }
        if (!['problem', 'submit'].includes(data.page)) return;
        const paths = [...(data.problemPaths || []), ...(data.submitPaths || [])]
            .map((value) => localUrl(value, location)?.pathname).filter(Boolean);
        for (const anchor of matchesWithin(root, 'a[href]')) {
            const href = anchor.getAttribute('href');
            const url = localUrl(href, location);
            if (!url || (!paths.includes(url.pathname) && !/\/record\/[a-f\d]{24}$/i.test(url.pathname))) continue;
            const next = withContext(href, data, location);
            if (next !== href) anchor.setAttribute('href', next);
        }
        const submitPaths = (data.submitPaths || []).map((value) => localUrl(value, location)?.pathname);
        for (const form of matchesWithin(root, 'form')) {
            if (form.getAttribute('method')?.toLowerCase() !== 'post') continue;
            const action = form.getAttribute('action') || location.href;
            if (submitPaths.includes(localUrl(action, location)?.pathname)) {
                const next = withContext(action, data, location);
                if (next !== action) form.setAttribute('action', next);
            }
        }
    }

    async function refreshProgress() {
        if (disposed || !fetchImpl || !localUrl(data.refreshUrl, location)) return;
        if (busy) { refreshQueued = true; return; }
        busy = true;
        do {
            refreshQueued = false; error = ''; render();
            const revision = statusRevision;
            const requestController = new AbortController();
            controller = requestController;
            const timer = setTimeout(() => requestController.abort(), 12000);
            try {
                const response = await fetchImpl(data.refreshUrl, {
                    headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: requestController.signal,
                });
                const payload = await response.json();
                if (disposed) return;
                // A verdict received while this request was in flight makes its
                // progress obsolete. Queue the final verdict instead of dropping it.
                if (revision !== statusRevision) { refreshQueued ||= !pending(lastStatus); continue; }
                if (!response.ok || !payload?.ok) throw new Error('unavailable');
                if (!payload.data) { dispose(); return; }
                if (payload.data.tid !== data.tid || !localUrl(payload.data.chapterUrl, location)
                    || (data.page === 'record' && payload.data.status !== lastStatus)) throw new Error('invalid');
                data = { ...data, ...payload.data };
                progressStale = false;
            } catch {
                if (revision === statusRevision) error = '训练进度暂时无法更新，可重试或返回本章查看。';
            } finally {
                clearTimeout(timer);
            }
        } while (refreshQueued && !disposed);
        busy = false;
        if (!disposed) render();
    }

    function syncStatus() {
        const value = document.getElementById('status')?.getAttribute('data-status');
        const status = value == null || value === '' ? null : Number(value);
        if (!Number.isInteger(status) || status === lastStatus) return;
        lastStatus = status; statusRevision++; progressStale = true;
        data = { ...data, status }; render();
        if (!pending(status)) refreshProgress();
    }

    function dispose() {
        disposed = true; controller?.abort(); observer?.disconnect();
        view?.removeEventListener('hashchange', onHashChange);
        document.removeEventListener('click', onChapterClick, true);
        wrap.remove();
    }

    if (['problem', 'submit'].includes(data.page)) {
        for (const key of ['getRecordDetailUrl', 'postSubmitUrl']) {
            if (uiContext[key]) uiContext[key] = withContext(uiContext[key], data, location);
        }
    }
    render();
    annotate();
    revealChapter();
    if (data.page === 'training') {
        view?.addEventListener('hashchange', onHashChange);
        document.addEventListener('click', onChapterClick, true);
    }
    observer = Observer ? new Observer((mutations) => {
        if (disposed) return;
        if (data.page === 'record') { syncStatus(); return; }
        if (data.page === 'training') wrap.hidden = viewingOther();
        // Native editors frequently mutate their DOM. Only inspect newly added
        // subtrees, never rescan every link on the page after each editor update.
        for (const mutation of mutations) {
            if (wrap.contains(mutation.target)) continue;
            for (const node of mutation.addedNodes || []) {
                if (node.nodeType !== 1 || wrap.contains(node)) continue;
                annotate(node);
                if (data.page === 'training' && node.contains(document.getElementById(new URL(location.href).hash.slice(1)))) revealChapter();
            }
        }
    }) : null;
    observer?.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-status'] });
    if (data.page === 'record') syncStatus();
    return { refresh: refreshProgress, dispose };
}

module.exports = { localUrl, withContext, mountTrainingContext };
