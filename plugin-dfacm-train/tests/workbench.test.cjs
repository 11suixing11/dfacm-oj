'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    analyzeTraining, buildWorkbench, summarizeRecentFailed, summarizeWeek, weekStartShanghai,
} = require('../workbench.cjs');

test('weekStartShanghai returns Monday 00:00 in Asia/Shanghai', () => {
    // Wednesday 2026-10-07 12:00 UTC → Monday 2026-10-05 00:00 +08:00
    assert.equal(weekStartShanghai(new Date('2026-10-07T12:00:00Z')).toISOString(), '2026-10-04T16:00:00.000Z');
    // Monday 00:00 +08:00 exactly stays on that Monday
    assert.equal(weekStartShanghai(new Date('2026-10-04T16:00:00Z')).toISOString(), '2026-10-04T16:00:00.000Z');
    // Sunday 23:59 +08:00 still belongs to the week that started on Monday 09-28
    assert.equal(weekStartShanghai(new Date('2026-10-04T15:59:59Z')).toISOString(), '2026-09-27T16:00:00.000Z');
    // Sunday (CST) belongs to the week that started the previous Monday
    assert.equal(weekStartShanghai(new Date('2026-10-11T15:59:59Z')).toISOString(), '2026-10-04T16:00:00.000Z');
});

const dag = [
    { _id: 1, title: '语言基础', requireNids: [], pids: [101, 102] },
    { _id: 2, title: '枚举模拟', requireNids: [1], pids: [103, 104] },
    { _id: 3, title: '搜索', requireNids: [2], pids: [105] },
];

test('analyzeTraining mirrors Hydro node states and finds the next problem', () => {
    // 101 AC, 103 WA-tried, 102/104/105 untouched → node1 active, node2/3 locked…
    let r = analyzeTraining({ docId: 't1', title: '入门路线', dag }, { 101: { status: 1 }, 103: { status: 2 } });
    assert.equal(r.total, 5);
    assert.equal(r.done, 1);
    assert.equal(r.percent, 20);
    assert.equal(r.completed, false);
    assert.equal(r.currentTitle, '语言基础');
    assert.equal(r.nextPid, 102); // first unfinished pid of the active node
    // node1 done → node2 becomes the active node (103 already tried)
    r = analyzeTraining({ docId: 't1', title: '入门路线', dag }, {
        101: { status: 1 }, 102: { status: 1 }, 103: { status: 2 },
    });
    assert.equal(r.currentTitle, '枚举模拟');
    assert.equal(r.nextPid, 103); // tried-but-failed problems come before untouched ones
    // everything accepted → completed, no next problem
    r = analyzeTraining({ docId: 't1', title: '入门路线', dag }, {
        101: { status: 1 }, 102: { status: 1 }, 103: { status: 1 }, 104: { status: 1 }, 105: { status: 1 },
    });
    assert.equal(r.completed, true);
    assert.equal(r.nextPid, null);
    assert.equal(r.currentTitle, null);
    // empty / malformed dag never crashes
    r = analyzeTraining({ docId: 't2', title: '空路线', dag: [] }, {});
    assert.equal(r.total, 0);
    assert.equal(r.completed, false);
    assert.equal(r.nextPid, null);
});

test('summarizeWeek counts submissions, distinct problems and CST active days', () => {
    const entries = [
        { pid: 1, status: 2, at: new Date('2026-10-05T17:00:00Z') }, // Tue 01:00 CST
        { pid: 1, status: 1, at: new Date('2026-10-06T16:30:00Z') }, // Wed 00:30 CST
        { pid: 2, status: 1, at: new Date('2026-10-06T16:40:00Z') }, // Wed 00:40 CST
        { pid: 2, status: 2, at: new Date('2026-10-06T15:30:00Z') }, // Tue 23:30 CST
    ];
    const week = summarizeWeek(entries, new Date('2026-10-07T12:00:00Z'));
    assert.equal(week.submissions, 4);
    assert.equal(week.accepted, 2);
    assert.equal(week.attempted, 2);
    assert.equal(week.activeDays, 2); // UTC dates differ from CST dates here
    assert.equal(week.weekStart, '2026-10-04T16:00:00.000Z');
    const empty = summarizeWeek([], new Date('2026-10-07T12:00:00Z'));
    assert.deepEqual([empty.submissions, empty.accepted, empty.attempted, empty.activeDays], [0, 0, 0, 0]);
});

test('summarizeRecentFailed dedupes by pid keeping the newest first', () => {
    const entries = [
        { pid: 1, status: 2, rid: 'r1', at: new Date('2026-10-07T10:00:00Z') },
        { pid: 2, status: 3, rid: 'r2', at: new Date('2026-10-07T09:00:00Z') },
        { pid: 1, status: 6, rid: 'r0', at: new Date('2026-10-06T09:00:00Z') }, // older same-problem failure dropped
    ];
    const recent = summarizeRecentFailed(entries, 8);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].pid, 1);
    assert.equal(recent[0].rid, 'r1');
    assert.equal(recent[0].statusLabel, 'WA');
    assert.equal(recent[1].statusText, '超出时间限制');
    assert.equal(summarizeRecentFailed(entries, 1).length, 1);
});

function fakeModels() {
    const trainings = [{
        docId: 'aaa', title: '入门路线', pin: 0, dag,
    }, {
        docId: 'bbb', title: '进阶路线', pin: 1, dag: [{ _id: 1, title: '提高', requireNids: [], pids: [201] }],
    }];
    return {
        trainingModel: {
            getMultiStatus: (domainId, query) => ({
                toArray: async () => {
                    assert.equal(query.uid, 42);
                    assert.equal(query.enroll, 1);
                    return [{ docId: 'aaa' }, { docId: 'bbb' }, { docId: 'deleted' }];
                },
            }),
            getList: async (domainId, tids) => Object.fromEntries(
                trainings.filter((t) => tids.includes(t.docId)).map((t) => [t.docId, t]),
            ),
        },
        problemModel: {
            getListStatus: async (domainId, uid, pids) => ({
                101: { status: 1 }, 103: { status: 2 }, 201: { status: 2 },
            }),
            getList: async (domainId, pids, uid, doThrow) => {
                assert.equal(doThrow, false);
                const docs = {
                    102: { docId: 102, pid: 'P102', title: 'A+B 问题' },
                    103: { docId: 103, pid: 'P103', title: '高度计算' },
                    201: { docId: 201, pid: 'P201', title: '树上差分' },
                };
                return Object.fromEntries(pids.map((pid) => [pid, docs[pid] || { docId: 0, title: '*' }]));
            },
        },
        records: {
            weekly: async (sinceId) => {
                assert.ok(sinceId);
                return [{ pid: 101, status: 1, at: new Date('2026-10-06T12:00:00Z') }];
            },
            recentFailed: async () => [
                { pid: 103, status: 2, rid: 'rid-x', at: new Date('2026-10-07T10:00:00Z') },
                { pid: 999, status: 7, rid: 'rid-y', at: new Date('2026-10-07T09:00:00Z') }, // deleted problem
            ],
        },
    };
}

test('buildWorkbench assembles routes, next problems, week stats and recent failures', async () => {
    const data = await buildWorkbench({
        domainId: 'system',
        uid: 42,
        uname: 'student',
        ...fakeModels(),
        openMistakes: 3,
        now: new Date('2026-10-07T12:00:00Z'),
    });
    assert.equal(data.user.uname, 'student');
    // pinned training first; deleted enrollment skipped
    assert.deepEqual(data.trainings.map((t) => t.title), ['进阶路线', '入门路线']);
    assert.equal(data.trainings[0].url, '/training/bbb');
    assert.equal(data.trainings[0].next.title, '树上差分');
    assert.equal(data.trainings[0].next.url, '/p/P201');
    assert.equal(data.trainings[1].next.title, 'A+B 问题');
    assert.equal(data.trainings[1].percent, 20);
    assert.equal(data.week.submissions, 1);
    assert.equal(data.week.accepted, 1);
    assert.equal(data.recentFailed.length, 2);
    assert.equal(data.recentFailed[0].url, '/p/P103');
    assert.equal(data.recentFailed[0].recordUrl, '/record/rid-x');
    // deleted problems stay listed but unlinkable
    assert.equal(data.recentFailed[1].title, '#999（不可见或已删除）');
    assert.equal(data.recentFailed[1].url, null);
    assert.equal(data.mistakes.open, 3);
});

test('buildWorkbench handles a newcomer without enrollments or submissions', async () => {
    const data = await buildWorkbench({
        domainId: 'system',
        uid: 43,
        uname: 'newbie',
        trainingModel: {
            getMultiStatus: () => ({ toArray: async () => [] }),
            getList: async () => ({}),
        },
        problemModel: { getListStatus: async () => ({}), getList: async () => ({}) },
        records: { weekly: async () => [], recentFailed: async () => [] },
        openMistakes: 0,
        now: new Date('2026-10-07T12:00:00Z'),
    });
    assert.deepEqual(data.trainings, []);
    assert.equal(data.week.submissions, 0);
    assert.deepEqual(data.recentFailed, []);
});
