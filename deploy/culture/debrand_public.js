// One-time, idempotent public rebrand migration for d&f算法网.
// Keep runtime addon names and collection prefixes intact; only public settings
// and user-visible documents are changed.
const SYSTEM = db.getCollection('system');
const DOCUMENT = db.getCollection('document');
const NAME = 'd&f算法网';
const URL = 'https://dfacm.website/';

function setSystem(id, value) {
    SYSTEM.updateOne({ _id: id }, { $set: { value } }, { upsert: true });
}

function cleanText(value) {
    if (typeof value !== 'string') return value;
    const compatibilityUrls = [];
    const protectedValue = value.replace(
        /(?:https?:\/\/)?(?:www\.)?swpuacm\.xyz(?:[/?#][^\s"'<>)]*)?/gi,
        (match) => {
            const token = `__DFACM_COMPAT_URL_${compatibilityUrls.length}__`;
            compatibilityUrls.push([token, match]);
            return token;
        },
    );
    const cleaned = protectedValue
        .replace(/西南石油大学\s*ACM\s*团队/g, `${NAME}社区`)
        .replace(/西南石油大学本科生/g, '社区成员')
        .replace(/西南石油大学/g, NAME)
        .replace(/SWPU\s*ACM/gi, NAME)
        .replace(/SWPU\s*OJ/gi, NAME)
        .replace(/SWPU/gi, NAME)
        .replace(/校内选拔赛/g, '专题挑战赛')
        .replace(/校赛/g, '专题赛')
        .replace(/新生答疑 QQ 群：?879670443/g, '训练交流群：1128735782')
        .replace(/新一届队员/g, '社区成员')
        .replace(/队员/g, '社区成员');
    return compatibilityUrls.reduce(
        (result, [token, original]) => result.replace(token, original),
        cleaned,
    );
}

setSystem('server.name', NAME);
setSystem('server.url', URL);

const config = SYSTEM.findOne({ _id: 'config' });
if (config && typeof config.value === 'string') {
    const value = config.value
        .replace(/^(\s*name:\s*).*$/m, `$1${NAME}`)
        .replace(/^(\s*url:\s*).*$/m, `$1${URL}`);
    setSystem('config', value);
}

const smtp = SYSTEM.findOne({ _id: 'smtp.from' });
if (smtp && typeof smtp.value === 'string') {
    setSystem('smtp.from', smtp.value.replace(/^"[^"]*"/, `"${NAME}"`));
}

const nodes = SYSTEM.findOne({ _id: 'discussion.nodes' });
if (nodes && typeof nodes.value === 'string') {
    setSystem('discussion.nodes', nodes.value.replace(/^SWPU:/m, `${NAME}:`));
}

const about = SYSTEM.findOne({ _id: 'ui-default.about' });
if (about && typeof about.value === 'string') {
    const match = about.value.match(/\/discuss\/([a-f0-9]{24})/i);
    const guide = match ? `/discuss/${match[1]}` : '/discuss';
    const privacyAt = about.value.indexOf('\n# privacy');
    const preserved = privacyAt >= 0 ? about.value.slice(privacyAt + 1) : '';
    const head = `# about 关于我们

**${NAME}社区**面向所有热爱程序设计的人开放，致力于提供稳定、清晰、可持续的算法训练体验。

本站 **${NAME}**（dfacm.website）是独立维护的在线评测平台。我们相信，每个人都能在算法竞赛这条路上找到属于自己的 final：

- **4300+ 题库**：《信息学奥赛一本通》、蓝桥杯历年真题、Codeforces、LOJ、CSP-J/S 真题，以及 POJ 远程判题；
- **训练路线**：[一本通 396 题入门计划](/training/6abf5251aaa235606eedfb84)与[蓝桥杯 254 题备赛计划](/training/6abf552caaa235606eedfbee)，章节按顺序解锁；
- **训练赛**：周赛 / 月赛 / 专题赛全程在站内进行，实时 RP 排名；
- **工作台与错题本**：练习进度一目了然，错题自动收录，补题闭环；
- **QQ 机器人播报**：比赛与 AC 动态实时播报到训练交流群。

第一次来请先读讨论区置顶的[《算法入门须知》](${guide})，从这里开始你的训练之旅。

# contact 联系我们

- **训练交流群：1128735782**（加群请注明「ACM」）
- 对 OJ 的建议、bug 反馈：讨论区「建议」节点
- 出题投稿：见讨论区置顶《出题规范与数据制作教程》
- 注册 / 登录遇到问题：答疑群内喊管理员`;
    setSystem('ui-default.about', head + (preserved ? `\n\n${preserved}` : ''));
}

// Replace the old onboarding article with the independent-platform version.
const guideId = ObjectId('6ac380a38b364d5443b9edc5');
DOCUMENT.updateOne({ _id: guideId }, {
    $set: {
        content: `> 本文是 ${NAME} 的入门指南。文中流程会随社区实践持续调整，请以站内公告为准。

## 关于我们

${NAME}面向所有希望提升算法能力的人开放。每个人都能在算法竞赛这条路上找到属于自己的 final。你可以按自己的节奏训练、参加公开赛、记录错题，也可以在讨论区和其他选手交流。

通过参加程序设计竞赛，可以锻炼算法能力和逻辑思考能力，也能参加 ICPC、CCPC、SCPC、蓝桥杯等比赛，与全国乃至全世界的优秀程序设计选手一同较量。

本站（dfacm.website）由社区维护，是独立的训练 OJ：邮箱验证码即可注册登录，内置训练路线、工作台、错题本，比赛与 AC 动态会实时播报到训练交流群。

## 如何训练

- 每周选择一个训练计划，按自己的节奏完成章节；
- 每周参与一场公开赛，赛后补题、复盘和整理题解；
- 遇到问题先看题解和讨论区，把复现步骤、尝试过程和具体问题写清楚；
- 保持稳定提交、及时复盘，找到适合自己的节奏。

## 结语

算法训练需要时间，但不必把它变成负担。稳定前进，比短期爆发更容易走到山顶。`,
    },
});

// Remove school wording from the remaining public documents without touching
// problem data, addon internals, or historical backups.
let changed = 0;
DOCUMENT.find({
    docType: { $in: [20, 21, 30, 40] },
    $or: [
        { title: /西南石油|SWPU|swpuacm|校内|校赛/i },
        { content: /西南石油|SWPU|swpuacm|校内|校赛/i },
    ],
}).forEach((doc) => {
    const update = {};
    if (typeof doc.title === 'string') {
        const title = cleanText(doc.title);
        if (title !== doc.title) update.title = title;
    }
    if (typeof doc.content === 'string') {
        const content = cleanText(doc.content);
        if (content !== doc.content) update.content = content;
    }
    if (Object.keys(update).length) {
        DOCUMENT.updateOne({ _id: doc._id }, { $set: update });
        changed += 1;
    }
});

// Discussion node documents mirror the setting above.
const nodeResult = DOCUMENT.updateMany({ docType: 20, content: 'SWPU' }, { $set: { content: NAME } });
const badgeResult = db.getCollection('badge').updateOne(
    { _id: 1 },
    {
        $set: {
            title: `${NAME}创始成员`,
            content: `授予参与${NAME}建设与运营的创始成员。佩戴后将显示在排行榜、讨论区等用户名旁。`,
        },
    },
);
print(`DEBRAND_DONE docs=${changed} nodeDocs=${nodeResult.modifiedCount} badge=${badgeResult.modifiedCount}`);
