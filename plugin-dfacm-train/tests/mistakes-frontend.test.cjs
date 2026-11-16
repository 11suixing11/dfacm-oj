'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { openMistakesBrowser, memoryStorage } = require('./mistakes-browser-fixture.cjs');

const note = (b, pid = 1001) => b.document.querySelector('#note-' + pid)?.value;
const reason = (b, pid = 1001) => b.document.querySelector('#reason-' + pid)?.value;
const message = (b, pid = 1001) => b.document.querySelector('#imsg-' + pid)?.textContent;
const button = (act, pid = 1001) => `[data-act="${act}"][data-pid="${pid}"]`;

// These literal assertions catch editor DOM replacement discarding A while an
// unrelated mutation/read changes B. DB notes prove drafts were not auto-saved.
for (const action of ['toggle', 'remove', 'sync', 'filter', 'page']) {
    test(`${action} preserves another item's raw note and reason without auto-saving`, async () => {
        const b = await openMistakesBrowser({ domainId: 'poj', extraOpen: 20 });
        b.edit(1001, { reason: 'boundary', note: 'unsaved A <script> &\nsecond line' });
        if (action === 'sync') await b.click('#sync');
        else if (action === 'filter') { await b.click('#tab-done'); await b.click('#tab-all'); }
        else if (action === 'page') { await b.click('#next'); await b.click('#prev'); }
        else await b.click(button(action, 1002));
        assert.equal(note(b), 'unsaved A <script> &\nsecond line');
        assert.equal(reason(b), 'boundary');
        assert.equal(b.storedNote(1001), 'saved A');
        assert.match(message(b), /未保存/);
        assert.equal(b.window.injected, undefined);
    });
}

test('same-tab reload restores only dirty snapshots for the explicit account/domain', async () => {
    const storage = memoryStorage();
    const a = await openMistakesBrowser({ domainId: 'poj', storage });
    a.edit(1001, { reason: 'complexity', note: 'reload draft' });
    const reloaded = await openMistakesBrowser({ domainId: 'poj', storage, fixture: a.fixture });
    assert.equal(note(reloaded), 'reload draft');
    assert.equal(reason(reloaded), 'complexity');
    assert.deepEqual(Object.keys(a.drafts()), ['1001']);
    const account = await openMistakesBrowser({ domainId: 'poj', uid: 43, storage });
    const domain = await openMistakesBrowser({ domainId: 'system', storage });
    assert.equal(note(account), 'saved A'); assert.equal(note(domain), 'saved A');
});

test('authorized UID 1 receives scoped draft persistence', async () => {
    const b = await openMistakesBrowser({ uid: 1 });
    b.edit(1001, { note: 'admin draft' });
    assert.equal(b.drafts()['1001']?.note, 'admin draft');
});

test('server scope injection keeps domain script delimiters as inert data', async () => {
    const domainId = 'poj</script><script>window.injected=true</script>&"\u2028';
    const b = await openMistakesBrowser({ domainId });
    assert.equal(b.window.__SWPU_MISTAKE_SCOPE__?.domainId, domainId);
    assert.equal(b.window.__SWPU_MISTAKE_SCOPE__?.uid, 42);
    assert.equal(b.window.injected, undefined);
});

for (const mode of ['blocked', 'quota', 'corrupt', 'invalid-scope', 'static-scope']) {
    test(`${mode} draft storage keeps editing and rerenders functional`, async () => {
        const storage = memoryStorage({ 'swpu-mistake-drafts:v1:42:system': '{bad json' });
        if (mode === 'blocked') storage.getItem = () => { throw new Error('blocked'); };
        if (mode === 'quota') storage.setItem = () => { throw new Error('quota'); };
        const transform = mode === 'invalid-scope' ? (html) => html.replace(/window\.__SWPU_MISTAKE_SCOPE__=[^\n]+?;/, 'window.__SWPU_MISTAKE_SCOPE__={uid:0,domainId:"system"};')
            : mode === 'static-scope' ? (html) => html.replace(/window\.__SWPU_MISTAKE_SCOPE__=[^\n]+?;/, '') : undefined;
        const b = await openMistakesBrowser({ storage, transform });
        b.edit(1001, { note: 'memory draft', reason: 'implement' });
        await b.click(button('toggle', 1002));
        assert.equal(note(b), 'memory draft'); assert.equal(reason(b), 'implement');
        if (mode !== 'corrupt') assert.match(b.document.querySelector('#draft-storage')?.textContent || '', /仅.*当前页面|当前页面.*保留/);
        assert.equal(b.document.querySelector('#error').hidden, true);
    });
}

test('reason-only edits become dirty; returning to the saved snapshot clears the draft', async () => {
    const b = await openMistakesBrowser();
    b.edit(1001, { reason: 'boundary' });
    assert.match(message(b), /未保存/);
    assert.equal(b.drafts()['1001']?.reason, 'boundary');
    b.edit(1001, { reason: '' });
    assert.equal(b.drafts()['1001'], undefined);
});

test('successful save clears only its exact submitted note/reason snapshot', async () => {
    const b = await openMistakesBrowser();
    b.edit(1001, { note: 'submitted', reason: 'boundary' });
    const gate = b.deferNext({ method: 'POST' });
    await b.click(button('save'));
    b.edit(1001, { note: 'typed during save', reason: 'complexity' });
    gate.resolve(); await b.flush();
    assert.equal(b.storedNote(1001), 'submitted');
    assert.equal(note(b), 'typed during save'); assert.equal(reason(b), 'complexity');
    assert.equal(b.drafts()['1001']?.note, 'typed during save'); assert.match(message(b), /未保存/);
    await b.click(button('save'));
    assert.equal(b.storedNote(1001), 'typed during save'); assert.equal(b.drafts()['1001'], undefined);
    assert.match(message(b), /已保存/);
});

test('save completing while its row is filtered away never clears a newer draft', async () => {
    const b = await openMistakesBrowser();
    b.edit(1001, { note: 'submitted' });
    const gate = b.deferNext({ method: 'POST' }); await b.click(button('save'));
    b.edit(1001, { note: 'newer hidden draft' }); await b.click('#tab-done');
    gate.resolve(); await b.flush(); await b.click('#tab-all');
    assert.equal(note(b), 'newer hidden draft'); assert.match(message(b), /未保存/);
    assert.equal(b.storedNote(1001), 'submitted');
});

for (const failure of ['network', 'rejected', 'timeout']) {
    test(`${failure} save keeps the draft, per-item error and a working retry`, async () => {
        const b = await openMistakesBrowser(); b.edit(1001, { note: 'retry me', reason: 'boundary' });
        const gate = b.deferNext({ method: 'POST' }); await b.click(button('save'));
        if (failure === 'network') gate.reject(new Error('offline'));
        else if (failure === 'rejected') gate.resolve({ body: { ok: false, message: '会话已过期' } });
        else { await b.tick(14999); assert.equal(b.document.querySelector(button('save')).disabled, true); await b.tick(1); }
        await b.flush();
        assert.equal(note(b), 'retry me'); assert.equal(reason(b), 'boundary');
        assert.equal(b.drafts()['1001']?.note, 'retry me');
        assert.match(message(b), /失败|超时|过期/); assert.equal(b.document.querySelector(button('save')).disabled, false);
        assert.equal(b.storedNote(1001), 'saved A');
        await b.click(button('save')); assert.equal(b.storedNote(1001), 'retry me');
        assert.equal(b.drafts()['1001'], undefined);
    });
}

test('successful explicit remove clears just that PID; cancelled/failed removal keeps it', async () => {
    const b = await openMistakesBrowser();
    b.edit(1001, { note: 'A draft' }); b.edit(1002, { note: 'B draft' });
    b.window.confirm = () => false; await b.click(button('remove', 1002));
    assert.equal(note(b, 1002), 'B draft');
    b.window.confirm = () => true;
    const gate = b.deferNext({ method: 'POST' }); await b.click(button('remove', 1002));
    gate.resolve({ body: { ok: false, message: '移除失败' } }); await b.flush();
    assert.equal(b.drafts()['1002']?.note, 'B draft');
    await b.click(button('remove', 1002));
    assert.equal(b.drafts()['1002'], undefined); assert.equal(b.drafts()['1001']?.note, 'A draft');
    assert.equal(b.storedNote(1002), undefined); assert.equal(note(b), 'A draft');
});

test('successful toggle followed by a failed refresh keeps retained editors usable', async () => {
    const b = await openMistakesBrowser(); b.edit(1001, { note: 'A draft' });
    const gate = b.deferNext({ method: 'GET' }); await b.click(button('toggle', 1002));
    gate.reject(new Error('refresh offline')); await b.flush();
    assert.equal(b.document.querySelector(button('toggle', 1002)).disabled, false);
    assert.equal(note(b), 'A draft'); assert.equal(b.document.querySelector('#error').hidden, false);
    await b.click('#retry'); assert.deepEqual(b.rows(), [1001]);
});

test('successful remove prevents editing its deleted row while the refresh is pending', async () => {
    const b = await openMistakesBrowser(); b.edit(1002, { note: 'removed draft' });
    const gate = b.deferNext({ method: 'GET' }); await b.click(button('remove', 1002));
    assert.equal(note(b, 1002), undefined); assert.equal(b.drafts()['1002'], undefined);
    gate.reject(new Error('refresh offline')); await b.flush();
    assert.equal(b.storedNote(1002), undefined); assert.equal(b.drafts()['1002'], undefined);
});

for (const oldResult of ['success', 'failure']) {
    test(`older open ${oldResult} cannot replace latest done/all rows, counts or pager`, async () => {
        const b = await openMistakesBrowser({ extraOpen: 20 }); b.edit(1001, { note: 'retained' });
        const old = b.deferNext({ method: 'GET', ignoreAbort: true }); await b.click('#tab-open');
        await b.click('#tab-done'); assert.deepEqual(b.rows(), [1003]);
        await b.click('#tab-all');
        const currentRows = [1001, 1002, 1003, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
            2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016];
        assert.deepEqual(b.rows(), currentRows);
        assert.equal(b.document.querySelector('#page-info').textContent, '1 / 2 页 · 共 23 题');
        if (oldResult === 'success') old.resolve(); else old.reject(new Error('old failed'));
        await b.flush();
        assert.deepEqual(b.rows(), currentRows);
        assert.equal(b.document.querySelector('#n-open').textContent, '22');
        assert.equal(b.document.querySelector('#page-info').textContent, '1 / 2 页 · 共 23 题');
        assert.equal(b.document.querySelector('#error').hidden, true); assert.equal(b.document.querySelector('#loading').hidden, true);
        assert.equal(note(b), 'retained');
        assert.equal(b.calls.filter((call) => call.method === 'GET').at(-3).signal?.aborted, true);
        assert.equal(b.timers.size, 0);
    });
}

test('repeated next clicks own fixed page snapshots; late earlier page cannot append rows', async () => {
    const b = await openMistakesBrowser({ extraOpen: 45 }); b.edit(1001, { note: 'paging draft' });
    const old = b.deferNext({ method: 'GET', ignoreAbort: true }); await b.click('#next');
    await b.click('#next');
    assert.equal(b.document.querySelector('#page-info').textContent, '3 / 3 页 · 共 47 题');
    const current = [2038, 2039, 2040, 2041, 2042, 2043, 2044]; assert.deepEqual(b.rows(), current);
    old.resolve(); await b.flush(); assert.deepEqual(b.rows(), current);
    await b.click('#prev'); await b.click('#prev'); assert.equal(note(b), 'paging draft');
    assert.equal(b.document.querySelector('#page-info').textContent, '1 / 3 页 · 共 47 题');
});

test('latest GET has a 10-second deadline; timed-out response cannot later overwrite retry', async () => {
    const b = await openMistakesBrowser(); b.edit(1001, { note: 'deadline draft' });
    const late = b.deferNext({ method: 'GET', ignoreAbort: true }); await b.click('#tab-done');
    await b.tick(9999); assert.equal(b.document.querySelector('#loading').hidden, false);
    await b.tick(1); assert.equal(b.document.querySelector('#error').hidden, false);
    assert.equal(b.document.querySelector('#loading').hidden, true);
    assert.equal(b.calls.at(-1).signal?.aborted, true);
    await b.click('#tab-all'); assert.deepEqual(b.rows(), [1001, 1002, 1003]);
    late.resolve(); await b.flush(); assert.deepEqual(b.rows(), [1001, 1002, 1003]);
    assert.equal(note(b), 'deadline draft'); assert.equal(b.document.querySelector('#error').hidden, true);
    assert.equal(b.timers.size, 0);
});

test('stalled response.json obeys the full 10-second read deadline and cannot overwrite retry', async () => {
    const b = await openMistakesBrowser({ domainId: 'poj', extraOpen: 20 });
    b.edit(1001, { note: 'JSON deadline draft', reason: 'complexity' });
    const retainedRows = b.rows(), retainedDrafts = b.drafts();
    const late = b.deferNext({ method: 'GET', phase: 'json', ignoreAbort: true });
    await b.click('#tab-done');
    await b.tick(9999);
    assert.equal(b.document.querySelector('#loading').hidden, false);
    assert.equal(b.document.querySelector('#error').hidden, true);
    assert.deepEqual(b.rows(), retainedRows);
    await b.tick(1);
    assert.equal(b.document.querySelector('#error').hidden, false);
    assert.equal(b.document.querySelector('#loading').hidden, true);
    assert.deepEqual(b.rows(), retainedRows);
    assert.equal(note(b), 'JSON deadline draft'); assert.equal(reason(b), 'complexity');
    assert.deepEqual(b.drafts(), retainedDrafts); assert.equal(b.storedNote(1001), 'saved A');
    assert.equal(b.calls.at(-1).signal?.aborted, true);
    assert.equal(b.timers.size, 0);

    await b.click('#tab-all');
    const currentRows = [1001, 1002, 1003, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
        2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016];
    assert.deepEqual(b.rows(), currentRows);
    late.resolve(); await b.flush();
    assert.deepEqual(b.rows(), currentRows);
    assert.equal(b.document.querySelector('#n-open').textContent, '22');
    assert.equal(b.document.querySelector('#page-info').textContent, '1 / 2 页 · 共 23 题');
    assert.equal(b.document.querySelector('#pager').hidden, false);
    assert.equal(b.document.querySelector('#empty').hidden, true);
    assert.equal(b.document.querySelector('#error').hidden, true);
    assert.equal(b.document.querySelector('#loading').hidden, true);
    assert.equal(note(b), 'JSON deadline draft'); assert.equal(reason(b), 'complexity');
    assert.deepEqual(b.drafts(), retainedDrafts); assert.equal(b.storedNote(1001), 'saved A');
    assert.equal(b.timers.size, 0);
});
