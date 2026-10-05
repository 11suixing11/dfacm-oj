// d&f算法网 training plan: mountain-flavored section titles + community-tone descriptions
// Idempotent: safe to re-run (titles/content are plain $set).
const ybtId = ObjectId('6abf5251aaa235606eedfb84');
const lqId = ObjectId('6abf552caaa235606eedfbee');
const ybtTitles = {
    1: '第1章 大本营 · 语言基础与输入输出（1000-1049）',
    2: '第2章 林间小径 · 分支与循环（1050-1099）',
    3: '第3章 溪谷穿行 · 循环进阶与枚举模拟（1100-1149）',
    4: '第4章 岩壁初攀 · 函数与递归入门（1150-1197）',
    5: '第5章 迷雾森林 · 递归与搜索（1198-1247）',
    6: '第6章 冰原跋涉 · 贪心与分治（1248-1297）',
    7: '第7章 风雪冲刺 · 动态规划（1298-1347）',
    8: '第8章 登顶眺望 · 数据结构基础（1348-1396）',
};
const lqTitles = {
    1: '第1关 热身步道 · 基础训练（15题）',
    2: '第2关 半山营地 · 算法训练（92题）',
    3: '第3关 冲顶路段 · 算法提高（113题）',
    4: '第4关 峰顶实录 · 历届真题（34题）',
};
const ybtContent = '从山脚到雪线的 8 段路线，共 396 题，全部来自《信息学奥赛一本通》基础篇：从 Hello,World! 一路刷到动态规划与数据结构，一章一章往上爬。每题配完整测试数据与标程题解——卡住了就翻题解，翻完合上自己再写一遍。建议节奏：每天 5~10 题，别攒到周末爆肝。入门先读讨论区置顶《ACM 入门须知》。';
const lqContent = '备赛蓝桥杯的正式路线：基础训练 15 题热身 → 算法训练 92 题打地基 → 算法提高 113 题上强度 → 历届真题 34 题实战演练。四关按顺序解锁，别跳关（笑）。全部题目带完整测试数据，提交即评测——省赛前把三、四关过完，心里就有底了。';

function upd(id, titles, content) {
    const d = db.getCollection('document').findOne({ _id: id });
    if (!d) { print('MISS ' + id); return; }
    let changed = 0;
    d.dag.forEach(function (s) { if (titles[s._id]) { s.title = titles[s._id]; changed++; } });
    db.getCollection('document').updateOne({ _id: id }, { $set: { dag: d.dag, content: content } });
    print('updated "' + d.title + '" sections=' + changed + ' contentLen=' + content.length);
}
upd(ybtId, ybtTitles, ybtContent);
upd(lqId, lqTitles, lqContent);
print('TRAIN_DONE');
