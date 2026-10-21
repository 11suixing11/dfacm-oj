/* d&f算法网 calendar enhancement. The server-rendered schedule remains usable
 * when JavaScript or a calendar asset fails. Upstream data never becomes HTML. */
(function () {
    'use strict';
    var root = document.getElementById('dfacm-calendar');
    var bootElement = document.getElementById('dfacm-calendar-boot');
    if (!root || !bootElement || root.dataset.ready) return;
    var boot;
    try { boot = JSON.parse(bootElement.textContent); } catch (_) { return; }
    if (!window.FullCalendar) return;

    var calendar;
    var query = boot.query || '';
    var types = new Set(boot.selectedTypes || []);
    var calendarEl = document.getElementById('dfacm-calendar-grid');
    var listEl = document.getElementById('dfacm-calendar-list');
    var titleEl = document.getElementById('dfacm-calendar-title');
    var countEl = document.getElementById('dfacm-calendar-count');
    var dialog = document.getElementById('dfacm-calendar-detail');
    var subscribeDialog = document.getElementById('dfacm-calendar-subscribe');
    var preference;
    try { preference = localStorage.getItem('dfacm-calendar-view'); } catch (_) { /* optional preference */ }
    var activeView = ['month', 'week', 'list'].includes(preference) ? preference : window.matchMedia('(max-width: 680px)').matches ? 'list' : 'month';

    function matches(event) {
        var props = event.extendedProps || {};
        return (!types.size || types.has(props.type)) && (!query || String(props.searchText || event.title).toLowerCase().includes(query.toLowerCase()));
    }
    function feedUrl() {
        var params = new URLSearchParams();
        if (types.size) params.set('types', Array.from(types).join(','));
        if (query) params.set('q', query);
        return '/calendar/feed.ics' + (params.size ? '?' + params.toString() : '');
    }
    function updateLinks() {
        var feed = feedUrl();
        document.querySelectorAll('[data-calendar-feed]').forEach(function (link) { link.href = feed; });
        var field = document.getElementById('dfacm-calendar-feed-url');
        if (field) field.value = new URL(feed, location.origin).href;
        document.getElementById('dfacm-calendar-selected-types').value = Array.from(types).join(',');
        root.querySelectorAll('[data-calendar-type]').forEach(function (link) {
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
        history.replaceState(null, '', location.pathname + (params.size ? '?' + params.toString() : '') + location.hash);
    }
    function filter() {
        var events = (boot.events || []).filter(matches);
        calendar.getEventSources().forEach(function (source) { source.remove(); });
        calendar.addEventSource(events);
        document.querySelectorAll('[data-calendar-type]').forEach(function (link) {
            var type = link.dataset.calendarType;
            var on = type ? types.has(type) : !types.size;
            link.classList.toggle('is-on', on);
            link.setAttribute('aria-pressed', String(on));
        });
        document.querySelectorAll('[data-calendar-card]').forEach(function (card) {
            card.hidden = !(!types.size || types.has(card.dataset.type)) || (!!query && !card.dataset.search.toLowerCase().includes(query.toLowerCase()));
        });
        document.querySelectorAll('[data-calendar-group]').forEach(function (group) {
            var shown = Array.from(group.querySelectorAll('[data-calendar-card]')).filter(function (card) { return !card.hidden; }).length;
            group.hidden = !shown;
            var counter = group.querySelector('[data-group-count]');
            if (counter) counter.textContent = String(shown);
        });
        var contests = events.filter(function (event) { return event.extendedProps.kind === 'contest'; }).length;
        countEl.textContent = contests + ' 场赛事 · ' + (events.length - contests) + ' 项报名截止';
        document.getElementById('dfacm-calendar-no-results').hidden = events.length > 0;
        updateLinks();
    }
    function showView(view) {
        activeView = view;
        calendarEl.hidden = view === 'list';
        listEl.hidden = view !== 'list';
        document.querySelectorAll('[data-calendar-view]').forEach(function (button) {
            var selected = button.dataset.calendarView === view;
            button.classList.toggle('is-on', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        document.querySelectorAll('[data-calendar-nav]').forEach(function (button) { button.hidden = view === 'list'; });
        if (view !== 'list') calendar.changeView(view === 'week' ? 'timeGridWeek' : 'dayGridMonth');
        else titleEl.textContent = '近期赛程';
        try { localStorage.setItem('dfacm-calendar-view', view); } catch (_) { /* optional preference */ }
    }
    function detail(info) {
        info.jsEvent.preventDefault();
        var props = info.event.extendedProps;
        document.getElementById('dfacm-detail-title').textContent = info.event.title;
        document.getElementById('dfacm-detail-type').textContent = props.typeLabel + ' · ' + props.countdownText;
        document.getElementById('dfacm-detail-date').textContent = props.dateText + (props.timeText ? ' · ' + props.timeText : '') + '（北京时间）';
        document.getElementById('dfacm-detail-place').textContent = props.placeText || '地点以赛事通知为准';
        document.getElementById('dfacm-detail-reg').textContent = props.regText || '';
        document.getElementById('dfacm-detail-note').textContent = props.note || '';
        document.getElementById('dfacm-detail-source').textContent = props.source === 'clist' ? '赛事数据由 CLIST 提供' : props.source === 'manual' ? '官方通知整理' : props.typeLabel + ' 赛程';
        var link = document.getElementById('dfacm-detail-link');
        var safe = /^https?:\/\//.test(props.url || '');
        link.hidden = !safe;
        if (safe) link.href = props.url;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else if (safe) window.open(props.url, '_blank', 'noopener');
    }

    try {
        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'zh-cn', timeZone: 'Asia/Shanghai', firstDay: 1,
            initialView: activeView === 'week' ? 'timeGridWeek' : 'dayGridMonth', headerToolbar: false,
            height: 'auto', fixedWeekCount: false, dayMaxEvents: 3, nowIndicator: true,
            slotMinTime: '00:00:00', scrollTime: '08:00:00', slotDuration: '01:00:00',
            editable: false, selectable: false, eventDisplay: 'block', eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
            events: (boot.events || []).filter(matches),
            datesSet: function (info) { if (activeView !== 'list') titleEl.textContent = info.view.title; },
            eventClick: detail,
            eventDidMount: function (info) { info.el.setAttribute('title', info.event.title + ' · ' + info.event.extendedProps.typeLabel); },
        });
        calendar.render();
        root.dataset.ready = 'true';
        root.classList.add('is-ready');
        document.getElementById('dfacm-calendar-tools').hidden = false;
        document.getElementById('dfacm-calendar-title').hidden = false;
        document.querySelectorAll('[data-calendar-view]').forEach(function (button) { button.addEventListener('click', function () { showView(button.dataset.calendarView); }); });
        document.querySelectorAll('[data-calendar-nav]').forEach(function (button) {
            button.addEventListener('click', function () { calendar[button.dataset.calendarNav](); });
        });
        document.querySelectorAll('[data-calendar-type]').forEach(function (link) {
            link.addEventListener('click', function (event) {
                event.preventDefault();
                var type = link.dataset.calendarType;
                if (!type) types.clear(); else if (types.has(type)) types.delete(type); else types.add(type);
                filter();
            });
        });
        var search = document.getElementById('dfacm-calendar-search');
        search.addEventListener('input', function () { query = search.value.trim().slice(0, 80); filter(); });
        document.getElementById('dfacm-calendar-search-form').addEventListener('submit', function (event) { event.preventDefault(); });
        document.getElementById('dfacm-detail-close').addEventListener('click', function () { dialog.close(); });
        document.getElementById('dfacm-subscribe-open').addEventListener('click', function (event) {
            if (typeof subscribeDialog.showModal !== 'function') return;
            event.preventDefault(); subscribeDialog.showModal();
        });
        document.getElementById('dfacm-subscribe-close').addEventListener('click', function () { subscribeDialog.close(); });
        document.getElementById('dfacm-subscribe-copy').addEventListener('click', async function () {
            var field = document.getElementById('dfacm-calendar-feed-url');
            var message = document.getElementById('dfacm-subscribe-message');
            try { await navigator.clipboard.writeText(field.value); message.textContent = '订阅地址已复制'; }
            catch (_) { field.focus(); field.select(); message.textContent = '请复制选中的订阅地址'; }
        });
        [dialog, subscribeDialog].forEach(function (modal) {
            modal.addEventListener('click', function (event) {
                var bounds = modal.getBoundingClientRect();
                if (event.target === modal && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) modal.close();
            });
        });
        filter();
        showView(activeView);
    } catch (_) {
        if (calendar) { try { calendar.destroy(); } catch (_) {} }
        root.classList.remove('is-ready');
        delete root.dataset.ready;
        calendarEl.hidden = true;
        listEl.hidden = false;
        document.getElementById('dfacm-calendar-tools').hidden = true;
    }
})();
