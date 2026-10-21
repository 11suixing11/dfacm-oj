/* d&f算法网 contest list enhancement. All race information is server-rendered,
 * and ordinary search/filter links remain usable when this script is absent. */
(function () {
    'use strict';
    var root = document.getElementById('dfacm-calendar');
    var bootElement = document.getElementById('dfacm-calendar-boot');
    if (!root || !bootElement || root.dataset.ready) return;
    var boot;
    try { boot = JSON.parse(bootElement.textContent); } catch (_) { return; }

    var query = boot.query || '';
    var types = new Set(boot.selectedTypes || []);
    var cards = Array.from(root.querySelectorAll('[data-calendar-card]'));
    var groups = Array.from(root.querySelectorAll('[data-calendar-group]'));
    var typeLinks = Array.from(root.querySelectorAll('[data-calendar-type]'));
    var search = document.getElementById('dfacm-calendar-search');
    var form = document.getElementById('dfacm-calendar-search-form');
    var countEl = document.getElementById('dfacm-calendar-count');
    var emptyEl = document.getElementById('dfacm-calendar-no-results');
    var subscribeDialog = document.getElementById('dfacm-calendar-subscribe');
    var archive = root.querySelector('.dfacm-cal__archive');
    // The server opens filtered archive results; clearing starts from the
    // ordinary collapsed list, while later searches retain the user's choice.
    var archiveWasOpen = query || types.size ? false : undefined;

    function feedUrl() {
        var params = new URLSearchParams();
        if (types.size) params.set('types', Array.from(types).join(','));
        if (query) params.set('q', query);
        return '/calendar/feed.ics' + (params.size ? '?' + params.toString() : '');
    }
    function updateLinks() {
        var feed = feedUrl();
        root.querySelectorAll('[data-calendar-feed]').forEach(function (link) { link.href = feed; });
        document.getElementById('dfacm-calendar-feed-url').value = new URL(feed, location.origin).href;
        document.getElementById('dfacm-calendar-selected-types').value = Array.from(types).join(',');
        typeLinks.forEach(function (link) {
            var type = link.dataset.calendarType;
            var next = !type ? [] : types.has(type) ? Array.from(types).filter(function (value) { return value !== type; }) : Array.from(types).concat(type);
            var filterParams = new URLSearchParams();
            if (next.length) filterParams.set('types', next.join(','));
            if (query) filterParams.set('q', query);
            link.href = '/calendar' + (filterParams.size ? '?' + filterParams.toString() : '');
        });
        var params = new URLSearchParams(location.search);
        params.delete('type'); params.delete('types'); params.delete('q');
        if (types.size) params.set('types', Array.from(types).join(','));
        if (query) params.set('q', query);
        try { history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash); } catch (_) { /* optional URL state */ }
    }
    function filter() {
        var needle = query.toLowerCase();
        var shown = 0;
        var deadlines = 0;
        cards.forEach(function (card) {
            card.hidden = !!types.size && !types.has(card.dataset.type)
                || !!needle && !card.dataset.search.toLowerCase().includes(needle);
            if (!card.hidden) { shown++; if (card.querySelector('[data-calendar-registration]')) deadlines++; }
        });
        typeLinks.forEach(function (link) {
            var type = link.dataset.calendarType;
            var on = type ? types.has(type) : !types.size;
            link.classList.toggle('is-on', on);
            link.setAttribute('aria-pressed', String(on));
        });
        groups.forEach(function (group) {
            var count = Array.from(group.querySelectorAll('[data-calendar-card]')).filter(function (card) { return !card.hidden; }).length;
            group.hidden = !count;
            group.querySelector('[data-group-count]').textContent = String(count);
        });
        if (archive) {
            var filtering = !!query || !!types.size;
            if (filtering && archiveWasOpen === undefined) archiveWasOpen = archive.open;
            if (filtering) archive.open = true;
            else if (archiveWasOpen !== undefined) { archive.open = archiveWasOpen; archiveWasOpen = undefined; }
        }
        countEl.textContent = shown + ' 场赛事' + (deadlines ? ' · ' + deadlines + ' 项报名截止' : '');
        emptyEl.hidden = shown > 0;
        updateLinks();
    }

    filter();
    root.dataset.ready = 'true';
    typeLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
            event.preventDefault();
            var type = link.dataset.calendarType;
            if (!type) types.clear(); else if (types.has(type)) types.delete(type); else types.add(type);
            filter();
        });
    });
    search.addEventListener('input', function () { query = search.value.trim().slice(0, 80); filter(); });
    form.addEventListener('submit', function (event) { event.preventDefault(); query = search.value.trim().slice(0, 80); filter(); });
    document.getElementById('dfacm-subscribe-open').addEventListener('click', function (event) {
        if (typeof subscribeDialog.showModal !== 'function' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
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
