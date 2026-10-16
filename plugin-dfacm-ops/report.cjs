'use strict';

const DAY_MS = 86400000;
const RESERVED_CONTESTS = ['000000000000000000000000', '000000000000000000000001'];
// Hydro 5.0.7 packages/common/status.ts, pinned in README.
const STATUS_LABELS = Object.freeze({
  0: 'Waiting', 1: 'AC', 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE',
  7: 'CE', 8: 'SE', 9: 'Canceled', 10: 'Unknown', 11: 'Hacked',
  20: 'Judging', 21: 'Compiling', 22: 'Fetched', 30: 'Ignored', 31: 'FormatError',
  32: 'HackSuccessful', 33: 'HackUnsuccessful',
});
const PENDING_STATUSES = [0, 20, 21, 22];
const ERROR_LABELS = ['WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'SE'];
const MAX_PAIRS = 100000;

function parseDate(value, timeZone, field) {
  if (typeof value !== 'string') throw new Error(`${field} 必须是日期字符串。`);
  let iso = value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    iso += timeZone === 'Asia/Shanghai' ? 'T00:00:00+08:00' : 'T00:00:00Z';
  }
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/);
  if (!parts) throw new Error(`${field} 请用 YYYY-MM-DD，或带时区且精确到秒的 ISO 时间。`);
  const [, year, month, day, hour, minute, second, zone] = parts;
  const y = Number(year); const m = Number(month); const d = Number(day);
  if (y < 1970 || y > 2105 || m < 1 || m > 12 || d < 1
      || d > new Date(Date.UTC(y, m, 0)).getUTCDate()
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error(`${field} 日期不存在或超出支持范围（1970–2105）。`);
  }
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute)) {
      throw new Error(`${field} 时区偏移无效。`);
    }
  }
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || date.getTime() < 0) throw new Error(`${field} 日期无效。`);
  return date;
}

function normalizeOptions(input = {}, mode = 'weekly', now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须是 JSON 对象。');
  const allowed = ['domainId', 'since', 'until', 'timeZone', mode === 'weekly' ? 'group' : 'staleMinutes'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error(`未知参数：${key}`);
  const domainId = input.domainId === undefined ? 'system' : input.domainId;
  const timeZone = input.timeZone === undefined ? 'Asia/Shanghai' : input.timeZone;
  if (typeof domainId !== 'string' || !domainId.trim() || domainId.length > 100 || /[\x00-\x1f\x7f]/.test(domainId)) {
    throw new Error('domainId 不能为空、超过 100 字符或包含控制字符。');
  }
  if (!['Asia/Shanghai', 'UTC'].includes(timeZone)) throw new Error('timeZone 仅支持 Asia/Shanghai 或 UTC。');
  const nowMs = Math.floor(now.getTime() / 1000) * 1000;
  const offset = timeZone === 'Asia/Shanghai' ? 8 * 3600000 : 0;
  const defaultEnd = mode === 'weekly' ? Math.floor((nowMs + offset) / DAY_MS) * DAY_MS - offset : nowMs;
  const until = input.until === undefined || input.until === '' ? new Date(defaultEnd) : parseDate(input.until, timeZone, 'until');
  const since = input.since === undefined || input.since === ''
    ? new Date(until.getTime() - (mode === 'weekly' ? 7 : 1) * DAY_MS) : parseDate(input.since, timeZone, 'since');
  if (since >= until) throw new Error('since 必须早于 until，统计区间为 [since, until)。');
  if (since.getTime() < 0) throw new Error('since 不能早于 1970 年。');
  if (until.getTime() > nowMs) throw new Error('until 不能晚于当前时间。');
  if (until - since > 31 * DAY_MS) throw new Error('单次最多统计 31 天，请缩小时间窗口。');
  const result = { domainId: domainId.trim(), timeZone, since, until };
  if (mode === 'weekly') {
    const group = input.group === undefined ? '' : input.group;
    if (typeof group !== 'string' || group.length > 100 || /[\x00-\x1f\x7f]/.test(group)) throw new Error('group 必须是小组名称（不超过 100 字符）。');
    result.group = group;
  } else {
    const staleMinutes = input.staleMinutes === undefined ? 10 : input.staleMinutes;
    if (!Number.isInteger(staleMinutes) || staleMinutes < 1 || staleMinutes > 10080) throw new Error('staleMinutes 必须是 1–10080 的整数。');
    result.staleMinutes = staleMinutes;
  }
  return result;
}

function pairKey(uid, pid) { return `${uid}:${pid}`; }
function statusLabel(status) { return STATUS_LABELS[status] || `Status(${status})`; }
function eligibleRecordFilter(ObjectId) {
  return { uid: { $gt: 0 }, pid: { $gt: 0 }, contest: { $nin: RESERVED_CONTESTS.map((id) => new ObjectId(id)) } };
}
function objectIdAt(date, ObjectId) { return ObjectId.createFromTime(Math.floor(date.getTime() / 1000)); }
function weeklyPipeline(options, ObjectId, memberUids) {
  const match = {
    ...eligibleRecordFilter(ObjectId), domainId: options.domainId,
    _id: { $gte: objectIdAt(options.since, ObjectId), $lt: objectIdAt(options.until, ObjectId) },
  };
  if (memberUids !== undefined) match.uid = { $in: memberUids };
  return [
    { $match: match },
    { $group: {
      _id: { uid: '$uid', pid: '$pid', status: '$status', day: { $dateToString: {
        format: '%Y-%m-%d', date: { $toDate: '$_id' }, timezone: options.timeZone,
      } } },
      count: { $sum: 1 },
    } },
    { $project: { _id: 0, uid: '$_id.uid', pid: '$_id.pid', status: '$_id.status', day: '$_id.day', count: 1 } },
  ];
}

function createWeeklyAccumulator(memberUids = []) {
  const users = new Map();
  const candidates = new Map();
  const addUser = (uid) => {
    if (!users.has(uid)) users.set(uid, { uid, submissions: 0, acPids: new Set(), days: new Set(), statuses: {} });
    if (users.size > 50000) throw new Error('统计用户数超过 50000，请按小组或较短时间统计。');
    return users.get(uid);
  };
  for (const uid of memberUids) addUser(uid);
  return {
    candidates,
    add(bucket) {
      const { uid, pid, status, day, count } = bucket;
      if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(pid) || pid <= 0
          || !Number.isSafeInteger(status) || status < 0
          || !Number.isSafeInteger(count) || count < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        throw new Error('提交聚合数据格式不合法。');
      }
      const row = addUser(uid);
      row.submissions += count;
      row.days.add(day);
      const label = statusLabel(status);
      row.statuses[label] = (row.statuses[label] || 0) + count;
      if (status === 1) {
        row.acPids.add(pid);
        candidates.set(pairKey(uid, pid), { uid, pid });
        if (candidates.size > MAX_PAIRS) throw new Error('本期 AC 题目组合超过 100000，请缩小统计范围。');
      }
    },
    finish(historicalAc = new Set()) {
      const rows = [...users.values()].map((row) => ({
        uid: row.uid, submissions: row.submissions, acProblems: row.acPids.size,
        newAcProblems: [...row.acPids].filter((pid) => !historicalAc.has(pairKey(row.uid, pid))).length,
        activeDays: row.days.size, statuses: row.statuses,
      })).sort((a, b) => b.newAcProblems - a.newAcProblems || b.acProblems - a.acProblems || a.uid - b.uid);
      return {
        rows,
        totals: {
          users: rows.length, activeUsers: rows.filter((row) => row.submissions > 0).length,
          submissions: rows.reduce((n, row) => n + row.submissions, 0),
          newAcProblems: rows.reduce((n, row) => n + row.newAcProblems, 0),
          acProblems: rows.reduce((n, row) => n + row.acProblems, 0),
        },
      };
    },
  };
}

function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function md(value) { return String(value).replace(/[|\\`<>]/g, (char) => `\\${char}`).replace(/[\r\n]/g, ' '); }
function rowCells(row) {
  const pending = PENDING_STATUSES.reduce((n, status) => n + (row.statuses[statusLabel(status)] || 0), 0);
  const known = new Set(['AC', ...ERROR_LABELS, ...PENDING_STATUSES.map(statusLabel)]);
  const other = Object.entries(row.statuses).filter(([label]) => !known.has(label)).reduce((n, [, count]) => n + count, 0);
  return [row.uid, row.submissions, row.acProblems, row.newAcProblems, row.activeDays,
    ...ERROR_LABELS.map((label) => row.statuses[label] || 0), pending, other];
}
const HEADERS = ['UID', '提交数', '本期AC题数', '新增AC题数', '活跃天数', ...ERROR_LABELS, '待评测', '其他'];
function weeklyCsv(report) {
  return '\ufeff' + [HEADERS, ...report.rows.map(rowCells)].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
function weeklyMarkdown(report, options) {
  const t = report.totals;
  const lines = [
    '# d&f算法网训练周报', '',
    `域：${md(options.domainId)}；小组：${md(options.group || '全部有提交的用户')}。`,
    `提交时间：${options.since.toISOString()} ≤ t < ${options.until.toISOString()}；活跃天数按 ${options.timeZone}。`, '',
    `统计 ${t.users} 人，活跃 ${t.activeUsers} 人，提交 ${t.submissions} 次，新增 AC ${t.newAcProblems} 个「用户 × 题目」组合。`, '',
    '口径：按原提交 ObjectId 时间和当前评测结果统计；同一提交重判只计一次，不读取 record.history。排除自测、数据生成和管理脚本。',
    '新增 AC 排除区间开始前当前仍为 AC 的同域同题记录；本期 AC 按每个用户的不同题去重。待评测与错误状态按导出时快照。',
    '不读取姓名、邮箱、学号、IP 或提交源码。小组成员使用导出时的当前名单。', '',
    '| ' + HEADERS.map(md).join(' | ') + ' |',
    '| ' + HEADERS.map(() => '---').join(' | ') + ' |',
    ...report.rows.map((row) => '| ' + rowCells(row).map(md).join(' | ') + ' |'), '',
  ];
  return lines.join('\n');
}
function healthMarkdown(data, options) {
  const lines = [
    '# d&f算法网判题健康摘要', '', `域：${md(options.domainId)}；快照：${data.generatedAt}。`,
    `近期提交窗口：[${options.since.toISOString()}, ${options.until.toISOString()})。`, '',
    '## 未领取任务队列', '', '| 类型 | 数量 | 最早任务创建时间 |', '| --- | --- | --- |',
    ...data.queue.map((row) => `| ${md(row.type)} | ${row.count} | ${row.oldestAt || '-'} |`), '',
    'task 只包含 worker 尚未领取的任务。任务领取后即删除，不能用队列数代表正在评测数。', '',
    '## 提交状态', '', '| 状态 | 当前未结束提交 | 近期提交数 |', '| --- | --- | --- |',
    ...[...new Set([...data.pending.map((row) => row.status), ...data.recent.map((row) => row.status)])].sort((a, b) => a - b)
      .map((status) => `| ${md(statusLabel(status))} | ${data.pending.find((row) => row.status === status)?.count || 0} | ${data.recent.find((row) => row.status === status)?.count || 0} |`), '',
    `原提交创建超过 ${options.staleMinutes} 分钟且仍未结束（排除已重判记录）：${data.staleOriginalSubmissions} 条。`,
    '该时间反映原提交年龄，不是 worker 的执行时长；历史异常记录也可能被计入。', '',
    '本摘要只读数据库，不探测沙箱、编译器或判题机心跳，不代表端到端判题已验证；无自动重判、重启或队列修改。', '',
  ];
  return lines.join('\n');
}

module.exports = {
  ERROR_LABELS, PENDING_STATUSES, RESERVED_CONTESTS, createWeeklyAccumulator, csvCell,
  eligibleRecordFilter, healthMarkdown, normalizeOptions, objectIdAt, pairKey,
  statusLabel, weeklyCsv, weeklyMarkdown, weeklyPipeline,
};
