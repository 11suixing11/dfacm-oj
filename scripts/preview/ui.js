'use strict';

// Interactions for the local layout fixtures. Production Hydro pages use their
// own controls; production workbench/mistakes keep their shipped inline scripts.
(function () {
    const root = document.documentElement;
    const params = new URLSearchParams(location.search);
    const theme = document.getElementById('preview-theme');
    function paintTheme() {
        const dark = root.classList.contains('theme--dark');
        if (!theme) return;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#070d18' : '#f4f7fb');
        theme.textContent = dark ? '白天' : '夜间';
        theme.setAttribute('aria-label', dark ? '切换到白天模式' : '切换到夜间模式');
        theme.setAttribute('aria-pressed', String(dark));
    }
    if (theme) {
        paintTheme();
        theme.addEventListener('click', () => {
            const dark = !root.classList.contains('theme--dark');
            root.classList.toggle('theme--dark', dark); root.classList.toggle('theme--light', !dark);
            try { localStorage.setItem('swpu-theme', dark ? 'dark' : 'light'); } catch {}
            paintTheme();
        });
    }
    const scenario = document.getElementById('preview-scenario');
    if (scenario) {
        scenario.value = params.get('scenario') || 'normal';
        scenario.addEventListener('change', () => {
            const next = new URL(location.href);
            next.searchParams.set('scenario', scenario.value);
            location.assign(next.pathname + next.search);
        });
    }
    const mode = document.getElementById('preview-member');
    if (mode) {
        mode.value = params.get('member') === '1' ? '1' : '0';
        mode.addEventListener('change', () => location.assign('/?member=' + mode.value));
    }
    const verdict = document.getElementById('preview-verdict');
    for (const button of document.querySelectorAll('[data-preview-expand], [data-preview-collapse]')) button.addEventListener('click', () => {
        const section = button.closest('.training__section');
        const expanded = button.hasAttribute('data-preview-expand');
        section.classList.toggle('expanded', expanded);
        section.classList.toggle('collapsed', !expanded);
    });
    if (verdict) verdict.addEventListener('change', () => {
        const status = Number(verdict.value);
        const text = status === 1 ? 'Accepted' : status === 2 ? 'Wrong Answer' : 'Judging';
        const title = document.getElementById('preview-verdict-text');
        title.textContent = text;
        title.className = 'section__title record-status--text ' + (status === 1 ? 'pass' : status === 2 ? 'fail' : 'progress');
        document.getElementById('preview-case-text').textContent = text;
        document.getElementById('status').setAttribute('data-status', String(status));
    });
    const pid = /^\/p\/P(\d+)$/.exec(location.pathname)?.[1];
    const code = document.getElementById('preview-code');
    if (code && pid) {
        const key = 'dfacm-preview-code-' + pid;
        try { if (sessionStorage.getItem(key)) code.value = sessionStorage.getItem(key); } catch {}
        code.addEventListener('input', () => { try { sessionStorage.setItem(key, code.value); } catch {} });
    }
    const recordCode = document.getElementById('preview-record-code');
    if (recordCode) {
        try { recordCode.textContent = sessionStorage.getItem('dfacm-preview-code-' + recordCode.dataset.pid) || '// 示例提交代码'; } catch {}
    }
    for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
        const source = document.getElementById(button.dataset.copy);
        if (!source) return;
        try { await navigator.clipboard.writeText(source.value || source.textContent); button.textContent = '已复制'; }
        catch { button.textContent = '请选中后复制'; }
    });
    document.getElementById('preview-submit')?.addEventListener('click', () => { document.getElementById('preview-editor-message').hidden = false; });
    for (const tab of document.querySelectorAll('[role="tab"]')) tab.addEventListener('click', () => {
        for (const other of document.querySelectorAll('[role="tab"]')) {
            const selected = other === tab;
            other.setAttribute('aria-selected', String(selected));
            other.tabIndex = selected ? 0 : -1;
            const panel = document.getElementById(other.getAttribute('aria-controls'));
            if (panel) panel.hidden = !selected;
        }
    });
    for (const tab of document.querySelectorAll('[role="tab"]')) tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...document.querySelectorAll('[role="tab"]')];
        const i = tabs.indexOf(tab);
        const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1]
            : tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        target.click(); target.focus();
    });

    const rows = document.getElementById('problem-rows');
    if (rows) fetch('/preview/problems.json').then((response) => response.json()).then((problems) => {
        const search = document.getElementById('problem-search');
        const topic = document.getElementById('problem-topic');
        const level = document.getElementById('problem-level');
        let page = 1, filter = 'all';
        topic.value = params.get('topic') || '';
        function render() {
            const matching = problems.filter((p) => (!search.value || (p.id + ' ' + p.title).toLowerCase().includes(search.value.toLowerCase()))
                && (!topic.value || p.topic === topic.value) && (!level.value || p.level === level.value)
                && (filter === 'all' || p.status === filter));
            const pages = Math.max(1, Math.ceil(matching.length / 8)); page = Math.min(page, pages);
            rows.textContent = '';
            for (const p of matching.slice((page - 1) * 8, page * 8)) {
                const tr = document.createElement('tr');
                for (let index = 0; index < 5; index++) {
                    const td = document.createElement('td');
                    if (index === 0) { td.textContent = ({ accepted: '✓', attempted: '◔', todo: '·' })[p.status]; td.className = 'col--status'; td.setAttribute('aria-label', ({ accepted: '已通过', attempted: '尝试过', todo: '未开始' })[p.status]); }
                    if (index === 1) { td.textContent = p.id; td.className = 'col--id'; }
                    if (index === 2) {
                        td.className = 'col--problem-name';
                        const link = document.createElement('a'); link.href = '/p/' + p.id; link.textContent = p.title; td.appendChild(link);
                        const label = document.createElement('span'); label.className = 'preview-topic'; label.textContent = p.topic; td.appendChild(label);
                    }
                    if (index === 3) { td.textContent = p.level; td.className = 'col--difficulty'; }
                    if (index === 4) { td.textContent = p.rate; td.className = 'col--rate'; }
                    tr.appendChild(td);
                }
                rows.appendChild(tr);
            }
            document.getElementById('problem-empty').hidden = matching.length > 0;
            document.getElementById('problem-count').textContent = matching.length + ' 道示例题目';
            document.getElementById('problem-range').textContent = matching.length ? `${(page - 1) * 8 + 1}–${Math.min(page * 8, matching.length)} / ${matching.length}` : '0 / 0';
            document.getElementById('problem-prev').disabled = page === 1;
            document.getElementById('problem-next').disabled = page === pages;
            for (let n = 1; n <= 2; n++) {
                const button = document.getElementById('problem-page-' + n); button.hidden = n > pages;
                button.classList.toggle('current', n === page);
                if (n === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
            }
            for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
        }
        [search, topic, level].forEach((control) => control.addEventListener(control === search ? 'input' : 'change', () => { page = 1; render(); }));
        for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter; page = 1; render(); });
        for (const button of document.querySelectorAll('[data-topic]')) button.addEventListener('click', () => { topic.value = button.dataset.topic; page = 1; render(); });
        document.getElementById('problem-reset').addEventListener('click', () => { search.value = ''; topic.value = ''; level.value = ''; filter = 'all'; page = 1; render(); });
        document.getElementById('problem-prev').addEventListener('click', () => { page--; render(); });
        document.getElementById('problem-next').addEventListener('click', () => { page++; render(); });
        for (let n = 1; n <= 2; n++) document.getElementById('problem-page-' + n).addEventListener('click', () => { page = n; render(); });
        render();
    });
})();
