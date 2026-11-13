'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixtureUrl } = require('./fixture-url.cjs');
const {
    analyzeTraining, buildRecentTrainings, buildWorkbench, summarizeRecentFailed, summarizeWeek, trainingProblemUrl, weekStartShanghai,
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
    const data = await buildWorkbench({ url: fixtureUrl,
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
    assert.equal(data.trainings[0].next.url, '/p/P201?training=bbb&trainingNode=1');
    assert.equal(data.trainings[0].currentUrl, '/training/bbb#node-1');
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

test('workbench checks current AC before limiting failures, even when AC is outside the weekly scan', async () => {
    const models = fakeModels();
    models.records.weekly = async () => [];
    models.records.recentFailed = async () => [
        { pid: 101, status: 2, rid: 'old-failure' },
        { pid: 103, status: 3, rid: 'latest-failure' },
        { pid: 103, status: 2, rid: 'duplicate' },
        { pid: 201, status: 7 },
    ];
    const data = await buildWorkbench({ url: fixtureUrl, domainId: 'system', uid: 42, ...models, recentLimit: 2 });
    assert.deepEqual(data.recentFailed.map((item) => item.pid), [103, 201]);
    assert.equal(data.recentFailed[0].rid, 'latest-failure');
    assert.deepEqual(data.recentlyResolved.map((item) => item.pid), [101]);
    assert.equal(data.recentlyResolved[0].resolved, true);
    assert.equal(data.week.accepted, 0);
});

test('real recent activity takes priority over pinned routes', async () => {
    const models = fakeModels();
    models.records.recentActivity = async () => [
        { pid: 201, at: new Date('2026-10-19T03:00:00Z') },
        { pid: 102, at: new Date('2026-10-20T03:00:00Z') },
    ];
    const data = await buildWorkbench({ url: fixtureUrl, domainId: 'system', uid: 42, ...models, maxTrainings: 1 });
    assert.equal(data.trainings[0].tid, 'aaa');
    assert.equal(data.trainings[0].lastActiveAt, '2026-10-20T03:00:00.000Z');
});

test('context links preserve existing query and anchor without using contest tid', () => {
    assert.equal(trainingProblemUrl('/p/P1?lang=zh#description', 'plan', 2), '/p/P1?lang=zh&training=plan&trainingNode=2#description');
    assert.equal(trainingProblemUrl(null, 'plan', 2), null);
    assert.deepEqual(summarizeRecentFailed([{ pid: 1, status: 2 }], 0), []);
    assert.deepEqual(summarizeRecentFailed([{ pid: 1, status: 1 }, { pid: 'x', status: 2 }]), []);
});

test('many joined trainings remain counted and an unfinished route survives completed recent ones', async () => {
    const plans = Array.from({ length: 12 }, (_, i) => ({ docId: 'route-' + i, title: '训练 ' + i,
        dag: [{ _id: 1, title: '第一章', pids: [i + 1], requireNids: [] }] }));
    let statusReads = 0;
    const result = await buildWorkbench({ url: fixtureUrl, domainId: 'system', uid: 42, maxTrainings: 3,
        trainingModel: {
            getMultiStatus: () => ({ toArray: async () => [...plans.map((p) => ({ docId: p.docId })), { docId: 'deleted' }] }),
            getList: async () => Object.fromEntries(plans.map((p) => [p.docId, p])),
        },
        problemModel: {
            getListStatus: async (_domain, _uid, pids) => { statusReads++; return Object.fromEntries(pids.filter((pid) => pid <= 11).map((pid) => [pid, { status: 1 }])); },
            getList: async (_domain, pids) => Object.fromEntries(pids.map((pid) => [pid, { docId: pid, pid: 'P' + pid, title: '题 ' + pid }])),
        },
        records: { weekly: async () => [], recentFailed: async () => [],
            recentActivity: async () => [1, 2, 3, 4].map((pid) => ({ pid, at: new Date('2026-10-23T00:00:00Z') })) },
    });
    assert.equal(result.trainings.length, 3);
    assert.equal(result.trainings[0].tid, 'route-11', 'unfinished route must remain the next-step candidate');
    assert.equal(result.trainings[0].next.url, '/p/P12?training=route-11&trainingNode=1');
    assert.deepEqual(result.trainingOverview, { enrolled: 12, completed: 11, inProgress: 1, shown: 3 });
    assert.equal(statusReads, 1, 'shared problem status is fetched once across routes');
});

test('buildWorkbench handles a newcomer without enrollments or submissions', async () => {
    const data = await buildWorkbench({ url: fixtureUrl,
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

test('DTO assembly requires an explicit router even for empty responses', async () => {
    const trainingModel = { getMultiStatus: () => ({ toArray: async () => [] }), getMulti: () => ({ toArray: async () => [] }) };
    await assert.rejects(buildWorkbench({ domainId: 'poj', uid: 42, trainingModel, problemModel: {}, records: { weekly: async () => [], recentFailed: async () => [] } }), /requires a URL router/);
    const { buildRecentTrainings } = require('../workbench.cjs');
    await assert.rejects(buildRecentTrainings({ domainId: 'poj', uid: 42, trainingModel, problemModel: {}, records: [] }), /requires a URL router/);
});

test('legacy trainingUrl argument order remains usable while an explicit router preserves domains', () => {
    const { trainingUrl } = require('../workbench.cjs');
    assert.equal(trainingUrl('t1', 2), '/training/t1#node-2');
    assert.equal(trainingUrl('t1', 2, () => '/d/poj/training/t1'), '/d/poj/training/t1#node-2');
});

// Real DTO builders, with only model I/O doubled. A/B/C have newer activity,
// while D is joined and unfinished beyond the homepage's three-card boundary.
function recentFixture({ joined = ['A', 'B', 'C', 'D'], completed = [101, 102, 103], visible = [104], records } = {}) {
    const plans = [
        { docId: 'A', title: '路线 A', pin: 0, dag: [{ _id: 1, title: 'A 章', requireNids: [], pids: [101] }] },
        { docId: 'B', title: '路线 B', pin: 1, dag: [{ _id: 1, title: 'B 章', requireNids: [], pids: [102] }] },
        { docId: 'C', title: '路线 C', pin: 1, dag: [{ _id: 1, title: 'C 章', requireNids: [], pids: [103] }] },
        { docId: 'D', title: '路线 D', pin: 0, dag: [{ _id: 2, title: 'D 当前章', requireNids: [], pids: [104] },
            { _id: 3, title: 'D 锁定章', requireNids: [2], pids: [105] }] },
        { docId: 'unjoined', title: '未报名', pin: 9, dag: [{ _id: 1, title: '未报名章', requireNids: [], pids: [106] }] },
    ];
    const statusCalls = [], problemCalls = [];
    const activity = records || [
        { pid: 101, at: new Date('2026-11-14T04:00:00Z') },
        { pid: 102, at: new Date('2026-11-14T03:00:00Z') },
        { pid: 103, at: new Date('2026-11-14T02:00:00Z') },
        { pid: 104, at: new Date('2026-11-01T00:00:00Z') },
        { pid: 106, at: new Date('2026-11-14T05:00:00Z') },
    ];
    return {
        activity, statusCalls, problemCalls,
        trainingModel: {
            getMulti: () => ({ toArray: async () => plans }),
            getMultiStatus: (domainId, query) => { assert.deepEqual(query, { uid: 42, enroll: 1 });
                return { toArray: async () => [...joined.map((docId) => ({ docId })), { docId: 'deleted' }] }; },
            getList: async (_domainId, tids) => Object.fromEntries(plans.filter((p) => tids.includes(p.docId)).map((p) => [p.docId, p])),
        },
        problemModel: {
            getListStatus: async (domainId, uid, pids) => { statusCalls.push({ domainId, uid, pids });
                return Object.fromEntries(completed.map((pid) => [pid, { status: 1 }])); },
            getList: async (domainId, pids, uid, doThrow) => { problemCalls.push({ domainId, pids, uid, doThrow });
                return Object.fromEntries(pids.map((pid) => [pid, visible.includes(pid)
                    ? { docId: pid, pid: 'P' + pid, title: '题 ' + pid } : { docId: 0, title: '*' }])); },
        },
    };
}

for (const domainId of ['system', 'poj']) {
    test('recent keeps joined unfinished D ahead of recently completed A/B/C in ' + domainId, async () => {
        const f = recentFixture();
        const router = (name, args) => (domainId === 'system' ? '' : '/d/poj') + fixtureUrl(name, args);
        const recent = await buildRecentTrainings({ domainId, uid: 42, url: router, ...f, records: f.activity });
        assert.deepEqual(recent.trainings.map((t) => t.tid), ['D', 'A', 'B']);
        assert.deepEqual(f.statusCalls, [{ domainId, uid: 42, pids: [101, 102, 103, 104, 105] }],
            'all joined statuses, including D beyond the old limit, use one union query');
        assert.deepEqual(f.problemCalls, [{ domainId, uid: 42, pids: [104], doThrow: false }]);
        const prefix = domainId === 'system' ? '' : '/d/poj';
        assert.deepEqual(recent.trainings[0], {
            tid: 'D', title: '路线 D', url: prefix + '/training/D', done: 0, total: 2, percent: 0, completed: false,
            lastActiveAt: '2026-11-01T00:00:00.000Z', source: 'record', currentNid: 2, currentTitle: 'D 当前章',
            currentUrl: prefix + '/training/D#node-2', next: { pid: 104, title: '题 104', url: prefix + '/p/P104?training=D&trainingNode=2' },
        });
        assert.equal(recent.trainings[1].next, null);
        assert.equal(recent.trainings[1].currentNid, null);
        const workbench = await buildWorkbench({ domainId, uid: 42, url: router, ...f,
            records: { weekly: async () => [], recentFailed: async () => [], recentActivity: async () => f.activity } });
        assert.deepEqual(workbench.trainings.map((t) => t.tid), ['D', 'A', 'B'], 'both surfaces share the shortlist');
    });
}

test('all-complete recent routes remain review candidates with activity, pin and docId ordering', async () => {
    const f = recentFixture({ completed: [101, 102, 103, 104, 105], records: [
        { pid: 101, at: new Date('2026-11-14T04:00:00Z') },
        { pid: 102, at: new Date('2026-11-14T03:00:00Z') },
        { pid: 103, at: new Date('2026-11-14T03:00:00Z') },
    ] });
    const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl, ...f, records: f.activity });
    assert.deepEqual(result.trainings.map((t) => t.tid), ['A', 'C', 'B']);
    assert.ok(result.trainings.every((t) => t.completed && t.next === null && t.currentTitle === null));
    assert.equal(f.statusCalls.length, 1);
    assert.equal(f.problemCalls.length, 0);
});

test('joined routes without activity still rank by pin/docId and unfinished-first', async () => {
    const f = recentFixture({ records: [] });
    const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl, ...f, records: [] });
    assert.deepEqual(result.trainings.map((t) => t.tid), ['D', 'C', 'B']);
    assert.ok(result.trainings.every((t) => t.source === 'enrolled' && t.lastActiveAt === null));
});

test('no joins preserves activity-derived fallback, still computing statuses before limiting', async () => {
    const f = recentFixture({ joined: [] });
    const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl, ...f, records: f.activity });
    assert.deepEqual(result.trainings.map((t) => t.tid), ['unjoined', 'D', 'A']);
    assert.equal(f.statusCalls.length, 1);
    assert.deepEqual(f.statusCalls[0].pids, [106, 101, 102, 103, 104, 105]);
    assert.ok(result.trainings.every((t) => t.source === 'record'));
});

for (const visible of [[], [105]]) {
    test('recent hides unavailable next problems and never selects a locked chapter: visible=' + visible, async () => {
        const f = recentFixture({ visible });
        const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl, ...f, records: f.activity });
        assert.equal(result.trainings[0].tid, 'D');
        assert.equal(result.trainings[0].next, null, 'a visibility placeholder is never an authorized next target');
        assert.equal(result.trainings[0].currentUrl, '/training/D#node-2');
        assert.deepEqual(f.problemCalls[0].pids, [104], 'locked PID 105 is not a next candidate');
    });
}

test('recent accepts an empty no-joins fallback without status or problem queries', async () => {
    const f = recentFixture({ joined: [], records: [] });
    const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl, ...f, records: [] });
    assert.deepEqual(result.trainings, []);
    assert.deepEqual(f.statusCalls, []);
    assert.deepEqual(f.problemCalls, []);
});

test('recent batches shared status and all visible next problems across its shortlist', async () => {
    const plans = [
        { docId: 'x', title: 'X', dag: [{ _id: 0, title: '零章', requireNids: [], pids: [10, 20] }] },
        { docId: 'y', title: 'Y', dag: [{ _id: 4, title: '四章', requireNids: [], pids: [10, 30] }] },
        { docId: 'z', title: 'Z', dag: [{ _id: 5, title: '五章', requireNids: [], pids: [40] }] },
    ];
    const statusCalls = [], problemCalls = [];
    const result = await buildRecentTrainings({ domainId: 'system', uid: 42, url: fixtureUrl,
        trainingModel: {
            getMultiStatus: () => ({ toArray: async () => plans.map((p) => ({ docId: p.docId })) }),
            getList: async () => Object.fromEntries(plans.map((p) => [p.docId, p])),
        },
        problemModel: {
            getListStatus: async (domainId, uid, pids) => { statusCalls.push({ domainId, uid, pids }); return { 10: { status: 1 } }; },
            getList: async (domainId, pids, uid, doThrow) => { problemCalls.push({ domainId, pids, uid, doThrow }); return {
                20: { docId: 20, title: '数字 PID' }, 30: { docId: 30, pid: 'P30', title: '公开 PID' }, 40: { docId: 0, title: '*' },
            }; },
        }, records: [],
    });
    assert.deepEqual(statusCalls, [{ domainId: 'system', uid: 42, pids: [40, 10, 30, 20] }]);
    assert.deepEqual(problemCalls, [{ domainId: 'system', uid: 42, pids: [40, 30, 20], doThrow: false }]);
    assert.deepEqual(result.trainings.map((t) => t.next && t.next.url), [null, '/p/P30?training=y&trainingNode=4', '/p/20?training=x&trainingNode=0']);
});
