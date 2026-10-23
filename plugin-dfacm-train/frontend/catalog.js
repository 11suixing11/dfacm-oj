'use strict';

function mountTrainingCatalog({ document, config, location }) {
    if (!config || !Array.isArray(config.items) || !Array.isArray(config.categories)
        || !Array.isArray(config.views) || !config.filters) return null;
    const form = document.querySelector('form[name="filter-form"]');
    const section = form?.closest('.section');
    if (!section || section.querySelector('.dfacm-catalog-tools')) return null;
    const base = new URL(config.url, location.href);
    if (base.origin !== new URL(location.href).origin || !['http:', 'https:'].includes(base.protocol)
        || base.username || base.password) return null;
    const make = (tag, className, text) => {
        const node = document.createElement(tag); node.className = className || '';
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const href = (changes = {}) => {
        const target = new URL(location.href);
        target.pathname = base.pathname; target.hash = ''; target.searchParams.delete('page');
        for (const [key, value] of Object.entries({ q: config.q || '', ...config.filters, ...changes })) {
            if (value && !(key === 'view' && value === 'all')) target.searchParams.set(key, value);
            else target.searchParams.delete(key);
        }
        return target.pathname + target.search;
    };
    const chip = (label, count, target, selected) => {
        const link = make('a', 'dfacm-catalog-chip', label);
        link.href = target;
        link.appendChild(make('span', 'dfacm-catalog-count', String(count)));
        if (selected) link.setAttribute('aria-current', 'page');
        return link;
    };
    const tools = make('div', 'dfacm-catalog-tools');
    const directions = make('nav', 'dfacm-catalog-filters'); directions.setAttribute('aria-label', '训练方向');
    directions.appendChild(chip('全部方向', config.directionTotal, href({ category: '' }), !config.filters.category));
    for (const item of config.categories) directions.appendChild(chip(item.label, item.count,
        href({ category: item.value }), item.value === config.filters.category));
    tools.appendChild(directions);
    if (config.member) {
        const views = make('nav', 'dfacm-catalog-filters dfacm-catalog-views'); views.setAttribute('aria-label', '我的训练状态');
        for (const item of config.views) views.appendChild(chip(item.label, item.count,
            href({ view: item.value }), item.value === config.filters.view));
        tools.appendChild(views);
    }
    const note = make('div', 'dfacm-catalog-note');
    note.appendChild(make('span', '', `找到 ${config.total} 条训练${config.pages > 1 ? ` · 第 ${config.page} / ${config.pages} 页` : ''}`));
    if (config.q || config.filters.category || config.filters.view !== 'all') {
        const reset = make('a', '', '清除筛选'); reset.href = href({ q: '', category: '', view: 'all' }); note.appendChild(reset);
    }
    tools.appendChild(note);
    const list = make('ol', 'section__list all primary training__list dfacm-catalog-list');
    for (const item of config.items) {
        const target = new URL(item.url, base);
        if (target.origin !== base.origin || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) continue;
        const row = make('li', 'section__list__item training__item dfacm-catalog-item');
        const text = make('div', 'dfacm-catalog-content');
        const title = make('h2', 'dfacm-catalog-title');
        const link = make('a', '', item.title); link.href = target.pathname + target.search; title.appendChild(link); text.appendChild(title);
        if (item.summary) text.appendChild(make('p', 'dfacm-catalog-summary', item.summary));
        text.appendChild(make('p', 'dfacm-catalog-meta', `${item.sections} 小节 · ${item.total} 道题 · ${item.attend} 人已加入`));
        row.appendChild(text);
        const action = make('div', 'dfacm-catalog-action');
        if (item.enrolled) {
            action.appendChild(make('span', item.completed ? 'dfacm-catalog-completed' : '', item.completed ? '已完成' : `已完成 ${item.percent}%`));
            const progress = make('div', 'dfacm-catalog-progress');
            progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', item.title + '完成进度');
            progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
            progress.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, Number(item.percent) || 0))));
            const track = make('i'); track.style.width = progress.getAttribute('aria-valuenow') + '%'; progress.appendChild(track); action.appendChild(progress);
        } else action.appendChild(make('span', '', '未加入'));
        const enter = make('a', 'dfacm-catalog-enter', item.enrolled && !item.completed ? '继续训练 →' : '查看训练 →');
        enter.href = link.href; enter.setAttribute('aria-label', `${item.title}：${enter.textContent}`); action.appendChild(enter);
        row.appendChild(action); list.appendChild(row);
    }
    const header = form.closest('.section__header');
    section.classList.add('dfacm-catalog-section');
    if (header) {
        header.classList.add('dfacm-catalog-header');
        const title = header.querySelector('.section__title'); if (title) title.textContent = '训练目录';
        header.insertAdjacentElement('afterend', tools);
    } else section.prepend(tools);
    // Preserve GET navigation, form semantics, backend search and native pager.
    form.setAttribute('action', base.pathname);
    const input = form.querySelector('input[name="q"]');
    if (input) { input.placeholder = '搜索训练名称'; input.setAttribute('aria-label', '搜索训练名称'); }
    for (const [name, value] of Object.entries(config.filters)) {
        let hidden = form.querySelector(`input[name="${name}"]`);
        if (!hidden) { hidden = make('input'); hidden.type = 'hidden'; hidden.name = name; form.appendChild(hidden); }
        hidden.value = value;
    }
    const original = section.querySelector('.training__list.all');
    if (original) original.replaceWith(list);
    // The native empty state stays in place when there are no results.
    return { element: section };
}

module.exports = { mountTrainingCatalog };
