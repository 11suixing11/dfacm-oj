'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { submissionTime, sourceTiming, sourceWindow } = require('../time.cjs');
const at = Date.parse('2026-10-31T08:00:00.000Z');
const rid = (at / 1000).toString(16) + '0000000000000001';

test('ObjectId creation is a half-open second; arrival, judgment and unverified timestamps cannot refine it', () => {
    const time = submissionTime({ _id: rid, firstSeenAt: new Date(at + 900), judgeAt: new Date(at + 950), createdAt: new Date(at + 900),
        submissionTime: { precision: 'millisecond', origin: 'trusted', lower: new Date(at + 900), upper: new Date(at + 901) } });
    assert.deepEqual(time, { precision: 'second', origin: 'objectId', lower: new Date(at), upper: new Date(at + 1000) });
    for (const [offset, expected] of [[-1000, 'earlier'], [-1, 'earlier'], [0, 'uncertain'], [100, 'uncertain'], [999, 'uncertain'], [1000, 'later']]) {
        assert.equal(sourceTiming(new Date(at + offset), time), expected);
    }
    assert.equal(sourceTiming('invalid', time), 'unknown'); assert.equal(sourceTiming(null, time), 'unknown');
    assert.deepEqual(sourceWindow(time), { $gte: new Date(at - 86400000), $lt: new Date(at + 1000) });
});

test('legacy reports recover conservative bounds and absent creation time stays unknown', () => {
    assert.deepEqual(submissionTime({ submittedAt: new Date(at + 900) }), {
        precision: 'second', origin: 'legacy-submittedAt', lower: new Date(at), upper: new Date(at + 1000) });
    assert.equal(submissionTime({ firstSeenAt: new Date(at), judgeAt: new Date(at) }), null);
    assert.equal(sourceTiming(new Date(at), null), 'unknown');
});
