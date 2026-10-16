'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createOperations, writeExports } = require('../operations.cjs');

const NOW = new Date('2026-10-02T10:20:30Z');
class FakeObjectId {
  constructor(hex) { this.hex = hex; }
  static createFromTime(seconds) { return new FakeObjectId(seconds.toString(16).padStart(8, '0') + '0'.repeat(16)); }
  getTimestamp() { return new Date(parseInt(this.hex.slice(0, 8), 16) * 1000); }
}
function cursor(rows, closed) {
  return {
    async *[Symbol.asyncIterator]() { yield* rows; },
    async toArray() { return rows; },
    async close() { closed.count++; },
  };
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'swpu-ops-test-'));
  // Only delete the new, explicitly resolved test directory inside the OS temp dir.
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^swpu-ops-test-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test('周报使用原生模型、窗口聚合和候选历史AC查询，完整写文件且只返回摘要路径', async (t) => {
  const root = await fixture(t);
  const calls = [];
  const closed = { count: 0 };
  const api = {
    ObjectId: FakeObjectId,
    DomainModel: { async get(domainId) { assert.equal(domainId, 'system'); return { _id: 'system' }; } },
    UserModel: { async listGroup(...args) {
      assert.deepEqual(args, ['system', undefined, ['队员'], undefined, 1]);
      return [{ name: '队员', uids: [7, 8, 8, 0] }];
    } },
    RecordModel: { coll: { aggregate(pipeline, options) {
      calls.push(pipeline);
      assert.equal(options.maxTimeMS, 60000);
      if (pipeline.length === 3) return cursor([
        { uid: 7, pid: 101, status: 1, day: '2026-09-25', count: 2 },
        { uid: 7, pid: 102, status: 1, day: '2026-09-26', count: 1 },
      ], closed);
      return cursor([{ _id: { uid: 7, pid: 101 } }], closed);
    } } },
    TaskModel: { coll: {} },
  };
  const messages = [];
  const ops = createOperations(api, { reportRoot: root, clock: () => NOW });
  assert.equal(await ops.weeklyReport({ group: '队员' }, (item) => messages.push(item.message)), true);
  assert.equal(closed.count, 2);
  assert.deepEqual(calls[0][0].$match.uid, { $in: [7, 8] });
  assert.deepEqual(calls[1][0].$match.$or, [{ uid: 7, pid: 101 }, { uid: 7, pid: 102 }]);
  assert.equal(calls[1][0].$match.status, 1);
  assert.equal(calls[1][0].$match._id.$lt.getTimestamp().toISOString(), '2026-09-24T16:00:00.000Z');
  assert.deepEqual(calls[1][1], { $group: { _id: { uid: '$uid', pid: '$pid' } } });
  assert.equal(JSON.stringify(calls).includes('code'), false);
  assert.equal(JSON.stringify(calls).includes('record.history'), false);
  const dirs = await fs.readdir(root);
  assert.equal(dirs.length, 1);
  const csv = await fs.readFile(path.join(root, dirs[0], 'weekly.csv'), 'utf8');
  assert.match(csv, /7,3,2,1,2/);
  assert.match(csv, /8,0,0,0,0/);
  const markdown = await fs.readFile(path.join(root, dirs[0], 'weekly.md'), 'utf8');
  assert.match(markdown, /新增 AC 1 个/);
  assert.equal(messages.some((message) => message.includes('UID,提交数')), false);
  assert.ok(messages.some((message) => message.includes('weekly.csv:')));
});

test('历史候选查询分批而非读取全部历史；小组不存在和无效参数阻止查询', async (t) => {
  const root = await fixture(t);
  let historicalBatches = 0;
  const bucketRows = Array.from({ length: 201 }, (_, i) => ({ uid: 7, pid: i + 1, status: 1, day: '2026-09-25', count: 1 }));
  const api = {
    ObjectId: FakeObjectId, DomainModel: { async get() { return {}; } },
    UserModel: { async listGroup() { return []; } }, TaskModel: {},
    RecordModel: { coll: { aggregate(pipeline) {
      if (pipeline.length === 3) return cursor(bucketRows, { count: 0 });
      historicalBatches++;
      assert.ok(pipeline[0].$match.$or.length <= 100);
      assert.ok(pipeline[0].$match.$or.length > 0);
      return cursor([], { count: 0 });
    } } },
  };
  const ops = createOperations(api, { reportRoot: root, clock: () => NOW });
  await assert.rejects(ops.weeklyReport({ group: '不存在' }), /小组不存在/);
  assert.equal(historicalBatches, 0);
  await assert.rejects(ops.weeklyReport({ typo: 'system' }), /未知参数/);
  await ops.weeklyReport({});
  assert.equal(historicalBatches, 3);
});

test('健康摘要只使用aggregate/countDocuments，队列不假装包含正在评测任务', async (t) => {
  const root = await fixture(t);
  const calls = [];
  const api = {
    ObjectId: FakeObjectId, DomainModel: { async get() { return {}; } }, UserModel: {},
    TaskModel: { coll: { aggregate(pipeline) {
      calls.push({ collection: 'task', pipeline });
      return cursor([{ _id: 'judge', count: 5, oldest: FakeObjectId.createFromTime(1790910000) }], { count: 0 });
    } } },
    RecordModel: { coll: {
      aggregate(pipeline) {
        calls.push({ collection: 'record', pipeline });
        return cursor(pipeline[0].$match.status ? [{ _id: 20, count: 2 }] : [{ _id: 1, count: 3 }, { _id: 8, count: 1 }], { count: 0 });
      },
      async countDocuments(filter, options) {
        assert.equal(filter.rejudged.$ne, true);
        assert.equal(options.maxTimeMS, 60000);
        assert.equal(filter._id.$lt.getTimestamp().toISOString(), '2026-10-02T10:10:30.000Z');
        return 1;
      },
    } },
  };
  const ops = createOperations(api, { reportRoot: root, clock: () => NOW });
  await ops.healthSummary({});
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].pipeline[0].$match, { domainId: 'system', type: { $in: ['judge', 'remotejudge', 'generate'] } });
  const [directory] = await fs.readdir(root);
  const data = JSON.parse(await fs.readFile(path.join(root, directory, 'health.json'), 'utf8'));
  assert.equal(data.queue[0].count, 5);
  assert.equal(data.queue[1].count, 0);
  assert.deepEqual(data.pending, [{ status: 20, count: 2 }]);
  assert.equal(data.staleOriginalSubmissions, 1);
  const markdown = await fs.readFile(path.join(root, directory, 'health.md'), 'utf8');
  assert.match(markdown, /task 只包含 worker 尚未领取/);
  assert.equal(JSON.stringify(calls).includes('$out'), false);
});

test('重复导出新建目录，不覆盖已有报表；未知域不生成文件', async (t) => {
  const root = await fixture(t);
  const first = await writeExports(root, { 'weekly.csv': 'first\n' });
  const second = await writeExports(root, { 'weekly.csv': 'second\n' });
  assert.notEqual(first['weekly.csv'], second['weekly.csv']);
  assert.equal(await fs.readFile(first['weekly.csv'], 'utf8'), 'first\n');
  assert.equal(await fs.readFile(second['weekly.csv'], 'utf8'), 'second\n');
  if (process.platform !== 'win32') assert.equal((await fs.stat(first['weekly.csv'])).mode & 0o777, 0o600);
  const ops = createOperations({ DomainModel: { async get() { return null; } } }, { reportRoot: path.join(root, 'unused'), clock: () => NOW });
  await assert.rejects(ops.weeklyReport({}), /域不存在/);
  await assert.rejects(fs.stat(path.join(root, 'unused')), { code: 'ENOENT' });
});
