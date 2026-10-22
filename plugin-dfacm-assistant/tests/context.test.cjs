'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createContextLoader } = require('../context.cjs');
const { SOURCE, STATEMENT, CE_SOURCE, CE_LOG } = require('./fixtures.cjs');

function fixture() {
    const permissions = { PERM_VIEW_PROBLEM_SOLUTION: 'solution', PERM_VIEW_PROBLEM_SOLUTION_ACCEPT: 'after-ac' };
    const pdoc = { docId: 1001, pid: 'P1001', title: '求和', content: STATEMENT, config: { type: 'default' } };
    const record = { _id: '1234567890abcdef12345678', domainId: 'main', uid: 42, pid: 1001, lang: 'cc.cc17o2', code: SOURCE, status: 2, contest: null };
    const state = { visible: true, accepted: false, tdoc: { ended: false }, docs: [record], requested: [] };
    const user = { _id: 42, viewLang: 'zh', hasPerm: (perm) => perm === 'solution' };
    const loader = createContextLoader({
        permissions, objectId: (value) => value,
        problemModel: { get: async () => pdoc, canViewBy: () => state.visible, getStatus: async () => ({ status: state.accepted ? 1 : 2 }) },
        recordModel: { get: async () => record, getMulti: (_domainId, query) => {
            state.requested.push(query);
            return { sort() { return this; }, limit() { return this; }, toArray: async () => state.docs };
        } },
        contestModel: { get: async () => state.tdoc, isDone: (tdoc) => tdoc.ended },
    });
    return { loader, user, pdoc, record, state };
}

test('problem solve reads application context; debug takes latest own non-contest failure', async () => {
    const f = fixture();
    const solved = await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user });
    assert.equal(solved.request.problem.statement, STATEMENT);
    assert.equal(solved.request.mode, 'solve');
    const debugged = await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'debug' } });
    assert.equal(debugged.request.submission.code, SOURCE);
    assert.equal(debugged.request.submission.verdict, 'WA');
    assert.equal(debugged.request.submission.sourceLines[5].text, '    int sum = 0;');
    assert.deepEqual(f.state.requested[0], { uid: 42, pid: 1001, contest: null, status: { $in: [2, 3, 4, 5, 6, 7] } });
});

test('record page cannot analyze another user, another domain, another problem or pending result', async () => {
    for (const [key, value] of [['uid', 41], ['domainId', 'other'], ['status', 0]]) {
        const f = fixture(); f.record[key] = value;
        await assert.rejects(f.loader.load({ domainId: 'main', rid: f.record._id, user: f.user }));
    }
    const f = fixture(); f.record.pid = 1002;
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'debug', rid: f.record._id } }), { code: 'RECORD_MISMATCH' });
});

test('hidden problems and solution permissions are enforced independently', async () => {
    const f = fixture(); f.state.visible = false;
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user }), { code: 'FORBIDDEN' });
    f.state.visible = true; f.user.hasPerm = (perm) => perm === 'after-ac';
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user }), { code: 'FORBIDDEN' });
    f.state.accepted = true;
    assert.equal((await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user })).request.mode, 'solve');
});

test('active contest record is blocked; ended own contest record is available', async () => {
    const f = fixture(); f.record.contest = 'contest';
    await assert.rejects(f.loader.load({ domainId: 'main', rid: f.record._id, user: f.user }), { code: 'CONTEST_ACTIVE' });
    f.state.tdoc.ended = true;
    assert.equal((await f.loader.load({ domainId: 'main', rid: f.record._id, user: f.user })).request.submission.verdict, 'WA');
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { tid: 'contest' } }), { code: 'CONTEST_ACTIVE' });
});

test('manual source is preserved and cannot override original record page code', async () => {
    const f = fixture();
    const code = '\nint main() {\n}\n';
    const request = (await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'debug', code, verdict: 'CE' } })).request;
    assert.equal(request.submission.code, code);
    assert.equal(request.submission.sourceLines[0].text, '');
    await assert.rejects(f.loader.load({ domainId: 'main', rid: f.record._id, user: f.user, args: { code } }), { code: 'INVALID_INPUT' });
});

test('requested help level is application-owned and compiler evidence comes from the selected original source', async () => {
    const f = fixture();
    for (const level of ['hint', 'approach', 'solution']) {
        const loaded = await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'solve', level } });
        assert.equal(loaded.request.level, level); assert.equal(loaded.request.submission, null);
    }
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'solve', level: 'fake' } }), { code: 'INVALID_LEVEL' });
    f.record.code = CE_SOURCE; f.record.status = 7; f.record.compilerTexts = [CE_LOG];
    const record = await f.loader.load({ domainId: 'main', rid: f.record._id, user: f.user, args: { compiler_output: 'untrusted override', verdict: 'WA' } });
    assert.equal(record.request.submission.compilerOutput, CE_LOG); assert.equal(record.request.submission.origin, 'record'); assert.equal(record.request.submission.verdict, 'CE');
    const manual = await f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'debug', code: CE_SOURCE, verdict: 'CE', compiler_output: CE_LOG } });
    assert.equal(manual.request.submission.compilerOutput, CE_LOG); assert.equal(manual.request.submission.origin, 'manual');
    await assert.rejects(f.loader.load({ domainId: 'main', pid: 'P1001', user: f.user, args: { mode: 'debug', level: 'hint' } }), { code: 'INVALID_LEVEL' });
});
