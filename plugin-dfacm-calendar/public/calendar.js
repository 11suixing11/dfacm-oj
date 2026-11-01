/* d&f算法网 contest list enhancement. The page and filter links also work
 * without JavaScript. All dimensions share one URL and subscription state. */
(function () {
    'use strict';
    var root = document.getElementById('dfacm-calendar');
    var bootElement = document.getElementById('dfacm-calendar-boot');
    if (!root || !bootElement || root.dataset.ready) return;
    var boot;
    try { boot = JSON.parse(bootElement.textContent); } catch (_) { return; }
    var query = boot.query || '';
    var types = new Set(boot.selectedTypes || []);
    var interests = new Set(boot.interests || []);
    var scope = boot.scope || '';
    var source = boot.source || '';
    var status = boot.status || '';
    var sort = boot.sort || 'schedule';
    var cards = Array.from(root.querySelectorAll('[data-calendar-card]'));
    var groups = Array.from(root.querySelectorAll('[data-calendar-group]'));
    var typeLinks = Array.from(root.querySelectorAll('[data-calendar-type]'));
    var interestLinks = Array.from(root.querySelectorAll('[data-calendar-interest]'));
    var scopeLinks = Array.from(root.querySelectorAll('[data-calendar-scope]'));
    var search = document.getElementById('dfacm-calendar-search');
    var form = document.getElementById('dfacm-calendar-search-form');
    var countEl = document.getElementById('dfacm-calendar-count');
    var emptyEl = document.getElementById('dfacm-calendar-no-results');
    var subscribeDialog = document.getElementById('dfacm-calendar-subscribe');
    var archive = root.querySelector('.dfacm-cal__archive');
    var archiveWasOpen = isFiltering() ? false : undefined;

    function isFiltering() { return !!(query || types.size || interests.size || scope || source || status); }
    function stateParams(changes) {
        var state = Object.assign({ types: Array.from(types), interests: Array.from(interests), scope: scope,
            source: source, status: status, sort: sort, q: query }, changes || {});
        var params = new URLSearchParams();
        if (state.types.length) params.set('types', state.types.join(','));
        if (state.interests.length) params.set('interests', state.interests.join(','));
        ['scope', 'source', 'status'].forEach(function (key) { if (state[key]) params.set(key, state[key]); });
        if (state.sort !== 'schedule') params.set('sort', state.sort);
        if (state.q) params.set('q', state.q);
        return params;
    }
    function address(path, changes) {
        var params = stateParams(changes);
        return path + (params.size ? '?' + params.toString() : '');
    }
    function toggled(values, key) {
        return !key ? [] : values.has(key) ? Array.from(values).filter(function (value) { return value !== key; }) : Array.from(values).concat(key);
    }
    function mark(link, on) { link.classList.toggle('is-on', on); link.setAttribute('aria-pressed', String(on)); }
    function updateLinks() {
        var feed = address('/calendar/feed.ics');
        root.querySelectorAll('[data-calendar-feed]').forEach(function (link) { link.href = feed; });
        document.querySelectorAll('[data-calendar-rss]').forEach(function (link) { link.href = address('/calendar/feed.xml'); });
        document.getElementById('dfacm-calendar-feed-url').value = new URL(feed, location.origin).href;
        document.getElementById('dfacm-calendar-selected-types').value = Array.from(types).join(',');
        document.getElementById('dfacm-calendar-selected-interests').value = Array.from(interests).join(',');
        document.getElementById('dfacm-calendar-selected-scope').value = scope;
        typeLinks.forEach(function (link) { link.href = address('/calendar', { types: toggled(types, link.dataset.calendarType) }); });
        interestLinks.forEach(function (link) { link.href = address('/calendar', { interests: toggled(interests, link.dataset.calendarInterest) }); });
        scopeLinks.forEach(function (link) { link.href = address('/calendar', { scope: link.dataset.calendarScope }); });
        var params = new URLSearchParams(location.search);
        ['type', 'types', 'q', 'scope', 'interests', 'source', 'status', 'sort'].forEach(function (key) { params.delete(key); });
        stateParams().forEach(function (value, key) { params.set(key, value); });
        try { history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash); } catch (_) { /* optional URL state */ }
    }
    function compareCards(a, b, group) {
        var va = Number(a.getAttribute('data-sort-' + sort)), vb = Number(b.getAttribute('data-sort-' + sort));
        var sa = Number(a.dataset.sortSchedule), sb = Number(b.dataset.sortSchedule);
        if (sort === 'prize') {
            if ((va < 0) !== (vb < 0)) return va < 0 ? 1 : -1;
            return a.dataset.currency.localeCompare(b.dataset.currency) || vb - va || sa - sb;
        }
        return (sort === 'newest' || group === 'ended' ? -1 : 1) * (va - vb) || sa - sb;
    }
    function filter() {
        var needle = query.toLowerCase();
        var shown = 0, deadlines = 0;
        cards.forEach(function (card) {
            var tags = (card.dataset.tags || '').split(',');
            var sources = (card.dataset.sources || '').split(',');
            card.hidden = !!types.size && !types.has(card.dataset.type)
                || !!scope && card.dataset.track !== scope
                || !!interests.size && !Array.from(interests).some(function (tag) { return tags.includes(tag); })
                || !!source && !sources.includes(source)
                || !!status && (status === 'active' ? card.dataset.status === 'ended' : card.dataset.status !== status)
                || !!needle && !card.dataset.search.toLowerCase().includes(needle);
            if (!card.hidden) { shown++; if (card.querySelector('[data-calendar-registration]')) deadlines++; }
        });
        typeLinks.forEach(function (link) { var key = link.dataset.calendarType; mark(link, key ? types.has(key) : !types.size); });
        interestLinks.forEach(function (link) { var key = link.dataset.calendarInterest; mark(link, key ? interests.has(key) : !interests.size); });
        scopeLinks.forEach(function (link) { mark(link, scope === link.dataset.calendarScope); });
        groups.forEach(function (group) {
            var rows = Array.from(group.querySelectorAll('[data-calendar-card]'));
            var count = rows.filter(function (card) { return !card.hidden; }).length;
            group.hidden = !count;
            group.querySelector('[data-group-count]').textContent = String(count);
            rows.sort(function (a, b) { return compareCards(a, b, group.dataset.group); });
            var list = group.querySelector('.dfacm-cal__rows');
            rows.forEach(function (card) { list.appendChild(card); });
        });
        if (archive) {
            if (isFiltering() && archiveWasOpen === undefined) archiveWasOpen = archive.open;
            if (isFiltering()) archive.open = true;
            else if (archiveWasOpen !== undefined) { archive.open = archiveWasOpen; archiveWasOpen = undefined; }
        }
        countEl.textContent = shown + ' 场赛事' + (deadlines ? ' · ' + deadlines + ' 项报名截止' : '');
        emptyEl.hidden = shown > 0;
        document.getElementById('dfacm-calendar-prize-note').hidden = sort !== 'prize';
        updateLinks();
    }
    function simpleClick(event) { return !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !(event.button > 0); }
    function wire(links, action) {
        links.forEach(function (link) { link.addEventListener('click', function (event) {
            if (!simpleClick(event)) return;
            event.preventDefault(); action(link); filter();
        }); });
    }
    function toggle(values, key) { if (!key) values.clear(); else if (values.has(key)) values.delete(key); else values.add(key); }
    filter();
    root.dataset.ready = 'true';
    wire(typeLinks, function (link) { toggle(types, link.dataset.calendarType); });
    wire(interestLinks, function (link) { toggle(interests, link.dataset.calendarInterest); });
    wire(scopeLinks, function (link) { scope = link.dataset.calendarScope; });
    wire(Array.from(root.querySelectorAll('[data-calendar-clear]')), function () {
        query = scope = source = status = ''; sort = 'schedule'; types.clear(); interests.clear(); search.value = '';
        ['source', 'status', 'sort'].forEach(function (key) { document.getElementById('dfacm-calendar-' + key).value = key === 'sort' ? 'schedule' : ''; });
    });
    ['source', 'status', 'sort'].forEach(function (key) { document.getElementById('dfacm-calendar-' + key).addEventListener('change', function (event) {
        if (key === 'source') source = event.target.value;
        else if (key === 'status') status = event.target.value;
        else sort = event.target.value;
        filter();
    }); });
    search.addEventListener('input', function () { query = search.value.trim().slice(0, 80); filter(); });
    form.addEventListener('submit', function (event) { event.preventDefault(); query = search.value.trim().slice(0, 80); filter(); });
    document.getElementById('dfacm-subscribe-open').addEventListener('click', function (event) {
        if (typeof subscribeDialog.showModal !== 'function' || !simpleClick(event)) return;
        event.preventDefault(); subscribeDialog.showModal();
    });
    document.getElementById('dfacm-subscribe-close').addEventListener('click', function () { subscribeDialog.close(); });
    document.getElementById('dfacm-subscribe-copy').addEventListener('click', async function () {
        var field = document.getElementById('dfacm-calendar-feed-url');
        var message = document.getElementById('dfacm-subscribe-message');
        try { await navigator.clipboard.writeText(field.value); message.textContent = '订阅地址已复制'; }
        catch (_) { field.focus(); field.select(); message.textContent = '请复制选中的订阅地址'; }
    });
    subscribeDialog.addEventListener('click', function (event) {
        var bounds = subscribeDialog.getBoundingClientRect();
        if (event.target === subscribeDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) subscribeDialog.close();
    });
})();
