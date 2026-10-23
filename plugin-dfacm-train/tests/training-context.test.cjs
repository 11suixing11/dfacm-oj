'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseTrainingRequest, buildTrainingContext } = require('../training-context.cjs');

const tid = '6abf5251aaa235606eedfb84';
const url = (name, args) => '/d/classroom/' + (name === 'training_detail' ? 'training/' + args.tid : 'p/' + args.pid);
const tdoc = { docId: tid, title: '基础路线', dag: [
    { _id: 1, title: '语言', requireNids: [], pids: [1] },
    { _id: 2, title: '循环', requireNids: [1], pids: [2, 3] },
    { _id: 3, title: '搜索', requireNids: [2], pids: [4] },
] };
const pdocs = Object.fromEntries([1, 2, 3, 4].map((pid) => [pid, { docId: pid, pid: 'P' + pid, title: '题目 ' + pid }]));

test('training query is separate from contests and rejects malformed IDs', () => {
    assert.deepEqual(parseTrainingRequest({ training: tid.toUpperCase(), trainingNode: '2' }), { tid, nid: 2 });
    for (const query of [{ tid }, { training: [tid] }, { training: 'not-an-id' }, { training: tid, trainingNode: '-1' }, { training: tid, trainingNode: '2junk' }, { training: tid, trainingNode: '9007199254740993' }]) {
        assert.equal(parseTrainingRequest(query), null);
    }
});

test('retry keeps the original chapter and an AC advances within it then unlocks the next chapter', () => {
    const options = { tdoc, pdocs, pid: 2, nid: 2, url };
    const failed = buildTrainingContext({ ...options, psdocs: { 1: { status: 1 }, 2: { status: 2 } } });
    assert.equal(failed.chapterUrl, `/d/classroom/training/${tid}#node-2`);
    assert.equal(failed.next.pid, 2);
    assert.equal(failed.problem.url, `/d/classroom/p/P2?training=${tid}&trainingNode=2`);
    const passed = buildTrainingContext({ ...options, psdocs: { 1: { status: 1 }, 2: { status: 1 } } });
    assert.equal(passed.next.pid, 3);
    const chapterDone = buildTrainingContext({ ...options, psdocs: { 1: { status: 1 }, 2: { status: 1 }, 3: { status: 1 } } });
    assert.equal(chapterDone.next.pid, 4);
    assert.equal(chapterDone.chapterUrl, `/d/classroom/training/${tid}#node-2`);
    assert.match(chapterDone.next.url, /trainingNode=3$/);
});

test('locked chapters, unrelated problems and a mismatched chapter cannot create context', () => {
    assert.equal(buildTrainingContext({ tdoc, pdocs, pid: 4, url }), null);
    assert.equal(buildTrainingContext({ tdoc, pdocs, pid: 9, url }), null);
    assert.equal(buildTrainingContext({ tdoc, pdocs, pid: 1, nid: 2, url }), null);
});

test('completed training has no next link; hidden problems never acquire links', () => {
    const psdocs = Object.fromEntries([1, 2, 3, 4].map((pid) => [pid, { status: 1 }]));
    const done = buildTrainingContext({ tdoc, pdocs, psdocs, pid: 4, url });
    assert.equal(done.completed, true);
    assert.equal(done.next, null);
    const hidden = buildTrainingContext({ tdoc, pdocs: { 1: { docId: 0, title: '*' } }, pid: 1, url });
    assert.equal(hidden.problem, null);
    assert.equal(hidden.next, null);
});

test('a repeated problem keeps the selected chapter instead of the first occurrence', () => {
    const repeated = { ...tdoc, dag: [
        { _id: 1, title: '第一处', requireNids: [], pids: [1] },
        { _id: 2, title: '复习', requireNids: [], pids: [1, 2] },
    ] };
    const data = buildTrainingContext({ tdoc: repeated, pdocs, pid: 1, nid: 2, url });
    assert.equal(data.chapterTitle, '复习');
    assert.match(data.problem.url, /trainingNode=2$/);
    assert.match(data.next.url, /trainingNode=2$/);
});
