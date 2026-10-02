'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createWeeklyAccumulator, csvCell, healthMarkdown, normalizeOptions,
  pairKey, statusLabel, weeklyCsv, weeklyMarkdown, weeklyPipeline,
} = require('../report.cjs');

const NOW = new Date('2026-10-02T10:20:30Z');
class FakeObjectId {
  constructor(hex) { this.hex = hex; }
  static createFromTime(seconds) { return new FakeObjectId(seconds.toString(16).padStart(8, '0') + '0'.repeat(16)); }
  getTimestamp() { return new Date(parseInt(this.hex.slice(0, 8), 16) * 1000); }
  toString() { return this.hex; }
}

test('周报默认窗口是北京时间最近七个完整自然日，健康摘要默认最近24小时', () => {
  const weekly = normalizeOptions({}, 'weekly', NOW);
  assert.equal(weekly.domainId, 'system');
  assert.equal(weekly.until.toISOString(), '2026-10-01T16:00:00.000Z');
  assert.equal(weekly.since.toISOString(), '2026-09-24T16:00:00.000Z');
  assert.equal(weekly.timeZone, 'Asia/Shanghai');
  const health = normalizeOptions({}, 'health', NOW);
  assert.equal(health.until.toISOString(), NOW.toISOString());
  assert.equal(health.since.toISOString(), '2026-10-01T10:20:30.000Z');
  assert.equal(health.staleMinutes, 10);
});

test('日期按时区解释，ISO显式偏移保留，直到端点排除且毫秒不允许', () => {
  const utc = normalizeOptions({ since: '2026-09-25', until: '2026-10-02', timeZone: 'UTC' }, 'weekly', NOW);
  assert.equal(utc.until.toISOString(), '2026-10-02T00:00:00.000Z');
  const offset = normalizeOptions({ since: '2026-09-25T09:00:00+08:00', until: '2026-09-26T09:00:00+08:00' }, 'weekly', NOW);
  assert.equal(offset.since.toISOString(), '2026-09-25T01:00:00.000Z');
  const pipeline = weeklyPipeline(offset, FakeObjectId, [7, 8]);
  assert.equal(pipeline[0].$match._id.$gte.getTimestamp().toISOString(), offset.since.toISOString());
  assert.equal(pipeline[0].$match._id.$lt.getTimestamp().toISOString(), offset.until.toISOString());
  assert.deepEqual(pipeline[0].$match.uid, { $in: [7, 8] });
  assert.deepEqual(pipeline[0].$match.contest.$nin.map(String), ['000000000000000000000000', '000000000000000000000001']);
  assert.equal(pipeline[0].$match.rejudged, undefined, '真实提交重判后仍只按原ID计一次');
  assert.equal(pipeline[1].$group._id.day.$dateToString.timezone, 'Asia/Shanghai');
  assert.equal(JSON.stringify(pipeline).includes('code'), false);
});

test('拒绝无效日期、空域、反转/超长/未来区间、模糊时区和非法参数', () => {
  const cases = [
    null, [], { domainId: '' }, { domainId: null }, { group: null }, { group: 'a\nb' },
    { typo: true }, { since: '2026-02-30' }, { since: '2025-02-29' },
    { since: '2026-09-25T00:00:00' }, { since: '2026-09-25T00:00:00.001Z' },
    { since: '2026-09-25T24:00:00Z' }, { since: '2026-09-25T00:00:00+14:01' },
    { since: 123 }, { since: '2026-10-01', until: '2026-10-01' },
    { since: '2026-09-29', until: '2026-09-28' },
    { since: '2026-08-01', until: '2026-10-01' }, { until: '2026-10-03' },
    { timeZone: 'Bad/Zone' }, { timeZone: null },
  ];
  for (const args of cases) assert.throws(() => normalizeOptions(args, 'weekly', NOW), undefined, JSON.stringify(args));
  for (const staleMinutes of [0, -1, 0.5, 10081, '10', null]) {
    assert.throws(() => normalizeOptions({ staleMinutes }, 'health', NOW));
  }
  assert.throws(() => normalizeOptions({ group: 'x' }, 'health', NOW));
  assert.throws(() => normalizeOptions({ staleMinutes: 10 }, 'weekly', NOW));
  const leap = normalizeOptions({ since: '2024-02-29', until: '2024-03-01' }, 'weekly', NOW);
  assert.equal(leap.until - leap.since, 86400000);
});

test('新增AC排除历史同题；重复AC去重、活跃日去重、错误分布保留且零提交成员补齐', () => {
  const accumulator = createWeeklyAccumulator([7, 8, 9]);
  [
    { uid: 7, pid: 101, status: 1, day: '2026-09-25', count: 2 },
    { uid: 7, pid: 101, status: 1, day: '2026-09-26', count: 1 },
    { uid: 7, pid: 102, status: 1, day: '2026-09-26', count: 1 },
    { uid: 7, pid: 102, status: 2, day: '2026-09-26', count: 3 },
    { uid: 7, pid: 102, status: 20, day: '2026-09-26', count: 1 },
    { uid: 8, pid: 101, status: 1, day: '2026-09-25', count: 1 },
    { uid: 8, pid: 103, status: 99, day: '2026-09-25', count: 2 },
  ].forEach((bucket) => accumulator.add(bucket));
  assert.equal(accumulator.candidates.size, 3);
  const report = accumulator.finish(new Set([pairKey(7, 101)]));
  assert.deepEqual(report.totals, { users: 3, activeUsers: 2, submissions: 11, newAcProblems: 2, acProblems: 3 });
  const user7 = report.rows.find((row) => row.uid === 7);
  assert.deepEqual(user7, { uid: 7, submissions: 8, acProblems: 2, newAcProblems: 1, activeDays: 2, statuses: { AC: 4, WA: 3, Judging: 1 } });
  assert.deepEqual(report.rows.find((row) => row.uid === 9), { uid: 9, submissions: 0, acProblems: 0, newAcProblems: 0, activeDays: 0, statuses: {} });
  assert.equal(statusLabel(99), 'Status(99)');
  assert.throws(() => accumulator.add({ uid: 0, pid: 101, status: 1, day: '2026-09-25', count: 1 }));
});

test('CSV支持Excel BOM和CRLF、转义完整；Markdown说明口径，不导出个人敏感字段', () => {
  const accumulator = createWeeklyAccumulator([7]);
  accumulator.add({ uid: 7, pid: 101, status: 8, day: '2026-09-25', count: 3 });
  const report = accumulator.finish();
  const csv = weeklyCsv(report);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.split('\r\n').length, 3);
  assert.match(csv, /7,3,0,0,1,0,0,0,0,0,0,3,0,0/);
  assert.equal(csvCell('a,"b"\n'), '"a,""b""\n"');
  assert.equal(csvCell('=CMD()'), "'=CMD()");
  const markdown = weeklyMarkdown(report, normalizeOptions({ group: '队|名<test>' }, 'weekly', NOW));
  assert.match(markdown, /队\\\|名\\<test\\>/);
  assert.match(markdown, /record\.history/);
  assert.equal(csv.includes('邮箱'), false);
  assert.equal(csv.includes('源码'), false);
});

test('空报表和健康摘要可导出，并正确区分队列、评测状态与只读局限', () => {
  const report = createWeeklyAccumulator().finish();
  assert.equal(report.rows.length, 0);
  const summary = healthMarkdown({ generatedAt: NOW.toISOString(), queue: [], pending: [{ status: 20, count: 2 }], recent: [{ status: 8, count: 1 }], staleOriginalSubmissions: 1 }, normalizeOptions({}, 'health', NOW));
  assert.match(summary, /Judging \| 2 \| 0/);
  assert.match(summary, /SE \| 0 \| 1/);
  assert.match(summary, /不代表端到端判题已验证/);
});

module.exports = { FakeObjectId };
