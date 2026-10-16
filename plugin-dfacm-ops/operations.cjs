'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  PENDING_STATUSES, createWeeklyAccumulator, eligibleRecordFilter, healthMarkdown,
  normalizeOptions, objectIdAt, pairKey, weeklyCsv, weeklyMarkdown, weeklyPipeline,
} = require('./report.cjs');

const QUERY_OPTIONS = { maxTimeMS: 60000, allowDiskUse: true };

async function forEachCursor(cursor, callback) {
  try {
    for await (const item of cursor) callback(item);
  } finally {
    await cursor.close();
  }
}

async function writeExports(root, files) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  // Each run gets a fresh directory; fixed file names never overwrite earlier exports.
  const directory = await fs.mkdtemp(path.join(root, 'export-'));
  const paths = {};
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(directory, name);
    await fs.writeFile(destination, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    paths[name] = destination;
  }
  return paths;
}

function createOperations(api, options = {}) {
  const { DomainModel, ObjectId, RecordModel, TaskModel, UserModel } = api;
  const reportRoot = options.reportRoot || path.join(os.homedir(), '.hydro', 'reports', 'swpu-ops');
  const clock = options.clock || (() => new Date());

  async function checkDomain(domainId) {
    if (!await DomainModel.get(domainId)) throw new Error(`域不存在：${domainId}`);
  }
  async function historicalAccepted(domainId, since, candidates) {
    const existing = new Set();
    const pairs = [...candidates.values()];
    // Only inspect historical AC for this period's candidates, in bounded batches.
    // Mongo groups on the server; historical submissions/code never enter JS memory.
    for (let offset = 0; offset < pairs.length; offset += 100) {
      const cursor = RecordModel.coll.aggregate([
        { $match: {
          ...eligibleRecordFilter(ObjectId), domainId, status: 1,
          _id: { $lt: objectIdAt(since, ObjectId) },
          $or: pairs.slice(offset, offset + 100).map(({ uid, pid }) => ({ uid, pid })),
        } },
        { $group: { _id: { uid: '$uid', pid: '$pid' } } },
      ], QUERY_OPTIONS);
      await forEachCursor(cursor, ({ _id }) => existing.add(pairKey(_id.uid, _id.pid)));
    }
    return existing;
  }

  return {
    async weeklyReport(args, report = () => {}) {
      const input = normalizeOptions(args, 'weekly', clock());
      await checkDomain(input.domainId);
      let memberUids;
      if (input.group) {
        const groups = await UserModel.listGroup(input.domainId, undefined, [input.group], undefined, 1);
        if (!groups.length) throw new Error(`小组不存在：${input.group}`);
        memberUids = [...new Set(groups[0].uids.filter((uid) => Number.isSafeInteger(uid) && uid > 0))];
        if (memberUids.length > 50000) throw new Error('小组超过 50000 人，请拆分小组。');
      }
      const accumulator = createWeeklyAccumulator(memberUids);
      // The native record collection has a unique _id and retains the original id on
      // rejudge. Do not read record.history or exclude genuine rejudged submissions.
      await forEachCursor(
        RecordModel.coll.aggregate(weeklyPipeline(input, ObjectId, memberUids), QUERY_OPTIONS),
        (bucket) => accumulator.add(bucket),
      );
      const historical = await historicalAccepted(input.domainId, input.since, accumulator.candidates);
      const result = accumulator.finish(historical);
      const paths = await writeExports(reportRoot, {
        'weekly.csv': weeklyCsv(result),
        'weekly.md': weeklyMarkdown(result, input),
      });
      report({ message: `周报完成：${result.totals.activeUsers} 人活跃，${result.totals.submissions} 次提交，新增 AC ${result.totals.newAcProblems} 个用户题目组合。` });
      for (const [format, filename] of Object.entries(paths)) report({ message: `${format}: ${filename}` });
      return true;
    },

    async healthSummary(args, report = () => {}) {
      const now = clock();
      const input = normalizeOptions(args, 'health', now);
      await checkDomain(input.domainId);
      const eligible = { ...eligibleRecordFilter(ObjectId), domainId: input.domainId };
      const [queueRows, pending, recent, staleOriginalSubmissions] = await Promise.all([
        TaskModel.coll.aggregate([
          { $match: { domainId: input.domainId, type: { $in: ['judge', 'remotejudge', 'generate'] } } },
          { $group: { _id: '$type', count: { $sum: 1 }, oldest: { $min: '$_id' } } },
        ], QUERY_OPTIONS).toArray(),
        RecordModel.coll.aggregate([
          { $match: { ...eligible, status: { $in: PENDING_STATUSES } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ], QUERY_OPTIONS).toArray(),
        RecordModel.coll.aggregate([
          { $match: { ...eligible, _id: {
            $gte: objectIdAt(input.since, ObjectId), $lt: objectIdAt(input.until, ObjectId),
          } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ], QUERY_OPTIONS).toArray(),
        RecordModel.coll.countDocuments({
          ...eligible, status: { $in: PENDING_STATUSES }, rejudged: { $ne: true },
          _id: { $lt: objectIdAt(new Date(now.getTime() - input.staleMinutes * 60000), ObjectId) },
        }, { maxTimeMS: QUERY_OPTIONS.maxTimeMS }),
      ]);
      const data = {
        generatedAt: now.toISOString(),
        queue: ['judge', 'remotejudge', 'generate'].map((type) => {
          const row = queueRows.find((item) => item._id === type);
          return { type, count: row?.count || 0, oldestAt: row?.oldest?.getTimestamp().toISOString() || null };
        }),
        pending: pending.map(({ _id, count }) => ({ status: _id, count })),
        recent: recent.map(({ _id, count }) => ({ status: _id, count })),
        staleOriginalSubmissions,
      };
      const paths = await writeExports(reportRoot, {
        'health.md': healthMarkdown(data, input),
        'health.json': JSON.stringify({ options: input, ...data }, null, 2) + '\n',
      });
      report({ message: `健康摘要完成：未领取任务 ${data.queue.reduce((n, row) => n + row.count, 0)} 条，未结束提交 ${data.pending.reduce((n, row) => n + row.count, 0)} 条。` });
      for (const [format, filename] of Object.entries(paths)) report({ message: `${format}: ${filename}` });
      return true;
    },
  };
}

module.exports = { createOperations, writeExports };
