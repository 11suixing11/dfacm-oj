'use strict';

// Fixed, local-only examples. Never imported by the Hydro plugins or deploy scripts.
const problems = [
  { id: 'P1000', title: 'A + B Problem', topic: '语言基础', level: '入门', status: 'accepted', rate: '86%', submissions: 1280 },
  { id: 'P1001', title: '数列求和', topic: '分支循环', level: '入门', status: 'todo', rate: '73%', submissions: 946 },
  { id: 'P1002', title: '最后一个满足条件的位置', topic: '二分查找', level: '基础', status: 'attempted', rate: '42%', submissions: 815 },
  { id: 'P1003', title: '最长上升子序列', topic: '动态规划', level: '进阶', status: 'todo', rate: '38%', submissions: 627 },
  { id: 'P1004', title: '山间的最短路线', topic: '图论', level: '进阶', status: 'todo', rate: '49%', submissions: 592 },
  { id: 'P1005', title: '合并区间', topic: '贪心算法', level: '基础', status: 'accepted', rate: '62%', submissions: 780 },
  { id: 'P1006', title: '统计字符出现的次数', topic: '字符串', level: '入门', status: 'todo', rate: '81%', submissions: 1068 },
  { id: 'P1007', title: '迷雾森林：在包含重复元素的序列中寻找第一个可行解', topic: '递归搜索', level: '基础', status: 'attempted', rate: '45%', submissions: 438 },
  { id: 'P1008', title: '前缀和与区间查询', topic: '数据结构', level: '基础', status: 'todo', rate: '67%', submissions: 702 },
  { id: 'P1009', title: '最大公约数', topic: '数论', level: '基础', status: 'accepted', rate: '78%', submissions: 1124 },
  { id: 'P1010', title: '寻找连通的区域', topic: '图论', level: '基础', status: 'todo', rate: '56%', submissions: 510 },
  { id: 'P1011', title: '背包里的选择', topic: '动态规划', level: '进阶', status: 'todo', rate: '41%', submissions: 654 },
];
const trainingId = '6abf5251aaa235606eedfb84';
const chapters = [
  { name: '大本营', topic: '语言基础', total: 50, done: 50 },
  { name: '林间小径', topic: '分支循环', total: 50, done: 18 },
  { name: '溪谷穿行', topic: '枚举模拟', total: 50, done: 0 },
  { name: '岩壁初攀', topic: '函数递归', total: 48, done: 0 },
  { name: '迷雾森林', topic: '递归搜索', total: 49, done: 0 },
  { name: '冰原跋涉', topic: '贪心分治', total: 50, done: 0 },
  { name: '风雪冲刺', topic: '动态规划', total: 50, done: 0 },
  { name: '登顶眺望', topic: '数据结构', total: 49, done: 0 },
];
const workbench = {
  ok: true,
  data: {
    user: { uname: '预览同学' },
    week: { weekStart: '2026-10-19T00:00:00+08:00', submissions: 24, accepted: 12, attempted: 16, activeDays: 5 },
    trainings: [{ url: '/training/' + trainingId, title: '【入门】一本通基础 396 题', done: 68, total: 396, percent: 17, currentTitle: '林间小径 · 分支循环', completed: false, next: { title: '数列求和', url: '/p/P1001' } }],
    recentFailed: [
      { title: '最后一个满足条件的位置', url: '/p/P1002', statusLabel: 'WA', recordUrl: '', at: '2026-10-23T10:20:00+08:00' },
      { title: problems[7].title, url: '/p/P1007', statusLabel: 'TLE', recordUrl: '', at: '2026-10-22T19:30:00+08:00' },
    ],
    mistakes: { open: 2 },
  },
};
const mistakes = [
  { pid: 1002, title: problems[2].title, url: '/p/P1002', statusLabel: 'WA', statusText: 'Wrong Answer', attempts: 3, lastAt: '2026-10-23T10:20:00+08:00', resolved: false, recordUrl: '', reason: 'boundary', note: '检查左闭右开区间的终止条件；把最小输入和不存在答案的情况单独推演一遍。' },
  { pid: 1007, title: problems[7].title, url: '/p/P1007', statusLabel: 'TLE', statusText: 'Time Limit Exceeded', attempts: 2, lastAt: '2026-10-22T19:30:00+08:00', resolved: false, recordUrl: '', reason: 'complexity', note: '重复状态可以合并。下一次先估算状态数，再决定搜索和记忆化的范围。' },
  { pid: 1005, title: problems[5].title, url: '/p/P1005', statusLabel: 'WA', statusText: 'Wrong Answer', attempts: 1, lastAt: '2026-10-21T14:00:00+08:00', resolved: true, resolvedAt: '2026-10-22T15:00:00+08:00', recordUrl: '', reason: 'implement', note: '排序后合并相交区间，注意最后一段也需要计入答案。' },
];

module.exports = { problems, trainingId, chapters, workbench, mistakes };
