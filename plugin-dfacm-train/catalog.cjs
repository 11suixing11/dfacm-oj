'use strict';

// Classify by the site's existing title prefixes. New prefixes become new
// directions automatically; no training IDs or catalogue size are hardcoded.
const OTHER = '__other__';
const PREFIX = /^\s*【([^】\r\n]{1,32})】/u;
const VIEWS = new Set(['all', 'enrolled', 'completed']);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function categoryOf(title) {
    return PREFIX.exec(String(title || ''))?.[1] || OTHER;
}

function readFilters(query = {}, member = false) {
    const category = typeof query.category === 'string' && query.category.length <= 32
        && !/[【】\r\n]/u.test(query.category) ? query.category : '';
    return { category, view: member && VIEWS.has(query.view) ? query.view : 'all' };
}

function filterClauses(filters, statuses = []) {
    const clauses = [];
    if (filters.category) {
        clauses.push({ title: filters.category === OTHER ? { $not: PREFIX }
            : { $regex: new RegExp(`^\\s*【${escapeRegex(filters.category)}】`, 'u') } });
    }
    if (filters.view !== 'all') {
        const ids = statuses.filter((doc) => doc.enroll && (filters.view !== 'completed' || doc.done))
            .map((doc) => doc.docId);
        clauses.push({ docId: { $in: ids } });
    }
    return clauses;
}

function withoutOwnClauses(query, own) {
    const result = { ...query };
    if (Array.isArray(query.$and)) {
        result.$and = query.$and.filter((clause) => !own.includes(clause));
        if (!result.$and.length) delete result.$and;
    }
    return result;
}

function summaryOf(tdoc) {
    return String(tdoc.description || tdoc.content || '').replace(/<[^>]*>/g, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`#]/g, '')
        .replace(/\s+/g, ' ').trim().slice(0, 240);
}

function buildCatalog({ docs, items, statuses = {}, filters, page = 1, pages = 1, url, member, q = '' }) {
    const statusOf = (doc) => statuses[String(doc.docId)] || {};
    const matchesView = (doc, view) => view === 'all' || (statusOf(doc).enroll
        && (view !== 'completed' || statusOf(doc).done));
    const matchesCategory = (doc) => !filters.category || categoryOf(doc.title) === filters.category;
    const groups = new Map();
    for (const doc of docs.filter((item) => matchesView(item, filters.view))) {
        const key = categoryOf(doc.title);
        groups.set(key, (groups.get(key) || 0) + 1);
    }
    // Keep a selected direction visible even when a search has no matches.
    if (filters.category && !groups.has(filters.category)) groups.set(filters.category, 0);
    const priority = ['入门', '进阶', '蓝桥杯', '专题'];
    const rank = (value) => { const i = priority.indexOf(value); return i < 0 ? priority.length : i; };
    const categories = [...groups].sort(([a], [b]) => rank(a) - rank(b)
        || (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, 'zh-CN')))
        .map(([value, count]) => ({ value, label: value === OTHER ? '其他训练' : value, count }));
    return {
        filters, member, q, page, pages, url,
        total: docs.filter((doc) => matchesCategory(doc) && matchesView(doc, filters.view)).length,
        directionTotal: docs.filter((doc) => matchesView(doc, filters.view)).length,
        categories,
        views: ['all', 'enrolled', 'completed'].map((value) => ({ value,
            label: ({ all: '全部训练', enrolled: '我加入的', completed: '已完成' })[value],
            count: docs.filter((doc) => matchesCategory(doc) && matchesView(doc, value)).length,
        })).filter((view) => member || view.value === 'all'),
        items: items.map((doc) => {
            const status = statusOf(doc);
            const pids = [...new Set((doc.dag || []).flatMap((node) => node.pids || []))];
            const done = new Set(status.donePids || []);
            const accepted = pids.filter((pid) => done.has(pid)).length;
            return { tid: String(doc.docId), title: doc.title || '', summary: summaryOf(doc),
                url: `${url.replace(/\/$/, '')}/${encodeURIComponent(String(doc.docId))}`,
                category: categoryOf(doc.title), sections: (doc.dag || []).length, total: pids.length,
                attend: Math.max(0, Number(doc.attend) || 0), enrolled: !!status.enroll, completed: !!status.done,
                percent: status.done ? 100 : pids.length ? Math.min(100, Math.round(accepted / pids.length * 100)) : 0,
            };
        }),
    };
}

module.exports = { OTHER, categoryOf, readFilters, filterClauses, withoutOwnClauses, buildCatalog };
