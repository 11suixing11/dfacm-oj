'use strict';

// Workbench assembly for swpu-train. Pure logic module: all data access is
// injected so node:test can run it without hydrooj or mongodb.

const DAY_MS = 86400000;
const CST_OFFSET = 8 * 3600000; // Asia/Shanghai has no DST.

const STATUS_ACCEPTED = 1;
const FAILED_STATUSES = Object.freeze([2, 3, 4, 5, 6, 7]); // WA/TLE/MLE/OLE/RE/CE
const STATUS_LABELS = Object.freeze({ 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE', 7: 'CE' });
const STATUS_TEXTS = Object.freeze({
    2: '答案错误', 3: '超出时间限制', 4: '超出内存限制', 5: '输出超出限制', 6: '运行错误', 7: '编译错误',
});

// Monday 00:00 in Asia/Shanghai for the week containing `now`.
function weekStartShanghai(now = new Date()) {
    const shifted = new Date(now.getTime() + CST_OFFSET);
    const day = (shifted.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - day * DAY_MS - CST_OFFSET);
}

const isSubset = (need, have) => (need || []).every((x) => have.has(x));

// Mirrors Hydro 5.0.7 TrainingModel.isDone/isProgress/isOpen over the dag,
// using the user's problem status docs (keyed by numeric docId).
function analyzeTraining(tdoc, psdocs) {
    const dag = Array.isArray(tdoc && tdoc.dag) ? tdoc.dag : [];
    const pids = [...new Set(dag.flatMap((node) => node.pids || []))];
    const donePids = new Set();
    const progPids = new Set();
    for (const pid of pids) {
        const status = psdocs && psdocs[pid] ? psdocs[pid].status : undefined;
        if (status === STATUS_ACCEPTED) donePids.add(pid);
        else if (status) progPids.add(pid);
    }
    const doneNids = new Set();
    const nodes = dag.map((node) => {
        const unlocked = isSubset(node.requireNids, doneNids);
        const done = unlocked && isSubset(node.pids, donePids);
        const touched = (node.pids || []).some((pid) => donePids.has(pid) || progPids.has(pid));
        if (done) doneNids.add(node._id);
        return {
            title: node.title || '',
            state: done ? 'done' : !unlocked ? 'locked' : touched ? 'active' : 'open',
            nextPids: (node.pids || []).filter((pid) => !donePids.has(pid)),
        };
    });
    const current = nodes.find((node) => node.state === 'active') || nodes.find((node) => node.state === 'open') || null;
    return {
        tid: String(tdoc.docId),
        title: tdoc.title || '',
        total: pids.length,
        done: donePids.size,
        percent: pids.length ? Math.round((donePids.size / pids.length) * 100) : 0,
        completed: dag.length > 0 && nodes.every((node) => node.state === 'done'),
        currentTitle: current ? current.title : null,
        nextPid: current && current.nextPids.length ? current.nextPids[0] : null,
    };
}

// entries: [{ pid, status, at }] — non-contest submissions in the window.
function summarizeWeek(entries, now = new Date()) {
    const acPids = new Set();
    const attempted = new Set();
    const days = new Set();
    for (const entry of entries) {
        if (!entry || !Number.isSafeInteger(entry.pid)) continue;
        attempted.add(entry.pid);
        if (entry.status === STATUS_ACCEPTED) acPids.add(entry.pid);
        const at = entry.at instanceof Date ? entry.at : null;
        if (at) {
            const shifted = new Date(at.getTime() + CST_OFFSET);
            days.add(`${shifted.getUTCFullYear()}-${shifted.getUTCMonth() + 1}-${shifted.getUTCDate()}`);
        }
    }
    return {
        submissions: entries.length,
        accepted: acPids.size,
        attempted: attempted.size,
        activeDays: days.size,
        weekStart: weekStartShanghai(now).toISOString(),
    };
}

// entries: newest-first [{ pid, status, rid, at }]; dedupes by pid.
function summarizeRecentFailed(entries, limit = 8) {
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
        if (!entry || seen.has(entry.pid)) continue;
        seen.add(entry.pid);
        out.push({
            pid: entry.pid,
            status: entry.status,
            statusLabel: STATUS_LABELS[entry.status] || String(entry.status),
            statusText: STATUS_TEXTS[entry.status] || '未通过',
            rid: entry.rid ? String(entry.rid) : null,
            at: entry.at instanceof Date ? entry.at.toISOString() : null,
        });
        if (out.length >= limit) break;
    }
    return out;
}

async function buildWorkbench({
    domainId,
    uid,
    uname = '',
    trainingModel,
    problemModel,
    records, // { weekly(weekStart: Date): [{pid,status,at}], recentFailed(): [{pid,status,rid,at}] }
    openMistakes = 0,
    now = new Date(),
    maxTrainings = 3,
    recentLimit = 8,
}) {
    const tsdocs = await trainingModel.getMultiStatus(domainId, { uid, enroll: 1 }).toArray();
    const tids = tsdocs.map((doc) => doc.docId);
    const tdict = tids.length ? await trainingModel.getList(domainId, tids) : {};
    const enrolled = tids.map((tid) => tdict[String(tid)]).filter(Boolean)
        .sort((a, b) => (b.pin || 0) - (a.pin || 0) || String(b.docId).localeCompare(String(a.docId)))
        .slice(0, maxTrainings);
    const trainings = [];
    for (const tdoc of enrolled) {
        const pids = [...new Set((tdoc.dag || []).flatMap((node) => node.pids || []))];
        const psdocs = pids.length ? await problemModel.getListStatus(domainId, uid, pids) : {};
        trainings.push(analyzeTraining(tdoc, psdocs));
    }
    const [weekly, recent] = await Promise.all([records.weekly(weekStartShanghai(now)), records.recentFailed()]);
    const recentFailed = summarizeRecentFailed(recent, recentLimit);

    const needPids = new Set(recentFailed.map((item) => item.pid));
    for (const training of trainings) if (training.nextPid) needPids.add(training.nextPid);
    const pdocs = needPids.size
        ? await problemModel.getList(domainId, [...needPids], uid, false)
        : {};
    const attach = (item) => {
        const pdoc = pdocs[item.pid];
        const available = !!pdoc && pdoc.docId === item.pid;
        return {
            ...item,
            title: available ? pdoc.title : `#${item.pid}（不可见或已删除）`,
            url: available ? `/p/${pdoc.pid || item.pid}` : null,
        };
    };
    return {
        user: { uid, uname },
        generatedAt: now.toISOString(),
        week: summarizeWeek(weekly, now),
        trainings: trainings.map((training) => ({
            ...training,
            url: `/training/${training.tid}`,
            next: training.nextPid
                ? attach({ pid: training.nextPid })
                : null,
        })),
        recentFailed: recentFailed.map((item) => ({
            ...attach(item),
            recordUrl: item.rid ? `/record/${item.rid}` : null,
        })),
        mistakes: { open: openMistakes },
    };
}

module.exports = {
    buildWorkbench,
    analyzeTraining,
    summarizeWeek,
    summarizeRecentFailed,
    weekStartShanghai,
    FAILED_STATUSES,
    STATUS_LABELS,
    STATUS_TEXTS,
};
