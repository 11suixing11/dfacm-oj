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
            nid: node._id,
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
        currentNid: current ? current.nid : null,
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
    if (limit <= 0) return [];
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
        if (!entry || !Number.isSafeInteger(entry.pid) || !FAILED_STATUSES.includes(entry.status) || seen.has(entry.pid)) continue;
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

function trainingUrl(tid, nid) {
    const anchor = nid === null || nid === undefined ? '' : `#node-${encodeURIComponent(nid)}`;
    return `/training/${encodeURIComponent(tid)}${anchor}`;
}

// "tid" is reserved for Hydro contests. Training context uses its own query key.
function trainingProblemUrl(url, tid, nid) {
    if (!url) return null;
    const [base, hash] = url.split('#');
    const query = `training=${encodeURIComponent(tid)}`
        + (nid === null || nid === undefined ? '' : `&trainingNode=${encodeURIComponent(nid)}`);
    return `${base}${base.includes('?') ? '&' : '?'}${query}${hash ? `#${hash}` : ''}`;
}

// --- recent trainings for the landing page ---------------------------------
// "Recently used" is derived from the member's newest non-contest submissions:
// every record whose pid lives in a plan's dag marks that plan active at the
// record's timestamp, so the ordering signal is real activity, not enrolment.
// Enrolment carries no timestamp, so it is only the fallback for members whose
// scanned records all fall outside any plan (or who only ever enrolled).

function indexPlanPids(tdocs) {
    const byPid = new Map();
    for (const tdoc of tdocs) {
        const dag = Array.isArray(tdoc && tdoc.dag) ? tdoc.dag : [];
        for (const node of dag) {
            for (const pid of node.pids || []) {
                const key = Number(pid);
                if (!Number.isSafeInteger(key)) continue;
                if (!byPid.has(key)) byPid.set(key, []);
                byPid.get(key).push(tdoc);
            }
        }
    }
    return byPid;
}

// records: [{pid, at}] — order-independent; keeps the newest Date per plan.
function lastActiveByPlan(records, byPid) {
    const last = new Map();
    for (const record of records || []) {
        const pid = Number(record && record.pid);
        if (!Number.isSafeInteger(pid)) continue;
        const plans = byPid.get(pid);
        if (!plans) continue;
        const at = record.at instanceof Date ? record.at : null;
        if (!at) continue;
        for (const plan of plans) {
            const prev = last.get(plan);
            if (!prev || at > prev) last.set(plan, at);
        }
    }
    return last;
}

async function buildRecentTrainings({
    domainId,
    uid,
    trainingModel,
    problemModel,
    records, // [{pid, at}] recent non-contest submissions (at: Date)
    now = new Date(),
    maxTrainings = 3,
}) {
    const tdocs = (await trainingModel.getMulti(domainId).toArray())
        .filter((tdoc) => tdoc && Array.isArray(tdoc.dag));
    const byPid = indexPlanPids(tdocs);
    const last = lastActiveByPlan(records, byPid);
    let ranked = tdocs.filter((tdoc) => last.has(tdoc))
        .sort((a, b) => last.get(b) - last.get(a))
        .slice(0, maxTrainings);
    let source = 'record';
    if (!ranked.length) {
        // Mirrors buildWorkbench's enrolment fallback: pinned first, newest docId second.
        const tsdocs = await trainingModel.getMultiStatus(domainId, { uid, enroll: 1 }).toArray();
        const tids = tsdocs.map((doc) => doc.docId);
        const tdict = tids.length ? await trainingModel.getList(domainId, tids) : {};
        ranked = tids.map((tid) => tdict[String(tid)]).filter(Boolean)
            .sort((a, b) => (b.pin || 0) - (a.pin || 0) || String(b.docId).localeCompare(String(a.docId)))
            .slice(0, maxTrainings);
        source = 'enrolled';
    }
    const trainings = [];
    for (const tdoc of ranked) {
        const pids = [...new Set((tdoc.dag || []).flatMap((node) => node.pids || []))];
        const psdocs = pids.length ? await problemModel.getListStatus(domainId, uid, pids) : {};
        const summary = analyzeTraining(tdoc, psdocs);
        trainings.push({
            tid: summary.tid,
            title: summary.title,
            url: `/training/${summary.tid}`,
            done: summary.done,
            total: summary.total,
            percent: summary.percent,
            completed: summary.completed,
            lastActiveAt: last.has(tdoc) ? last.get(tdoc).toISOString() : null,
            source,
        });
    }
    return { generatedAt: now.toISOString(), trainings };
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
    const [weekly, recent, activity] = await Promise.all([
        records.weekly(weekStartShanghai(now)),
        records.recentFailed(),
        records.recentActivity ? records.recentActivity() : [],
    ]);
    const plans = tids.map((tid) => tdict[String(tid)]).filter(Boolean);
    const lastActive = lastActiveByPlan(activity, indexPlanPids(plans));
    const ranked = plans
        .sort((a, b) => (lastActive.get(b)?.getTime() || 0) - (lastActive.get(a)?.getTime() || 0)
            || (b.pin || 0) - (a.pin || 0) || String(b.docId).localeCompare(String(a.docId)));
    // Read shared problem statuses once for all joined routes, then choose the
    // workbench shortlist. Completed recent routes cannot hide an unfinished
    // route beyond the first three, and totals describe all existing enrollments.
    const planPids = [...new Set(ranked.flatMap((tdoc) => (tdoc.dag || []).flatMap((node) => node.pids || [])))];
    const planStatuses = planPids.length ? await problemModel.getListStatus(domainId, uid, planPids) : {};
    const summaries = ranked.map((tdoc) => ({
            ...analyzeTraining(tdoc, planStatuses),
            lastActiveAt: lastActive.has(tdoc) ? lastActive.get(tdoc).toISOString() : null,
        }));
    const shortlist = [...summaries.filter((item) => !item.completed), ...summaries.filter((item) => item.completed)];
    const trainings = shortlist.slice(0, maxTrainings);
    // The record scan contains historical failures. Resolve current problem
    // status BEFORE applying the display limit, including AC outside this week.
    const candidates = summarizeRecentFailed(recent, recent.length);
    const candidatePids = candidates.map((item) => item.pid);
    const statuses = candidatePids.length ? await problemModel.getListStatus(domainId, uid, candidatePids) : {};
    const accepted = (item) => statuses[item.pid]?.status === STATUS_ACCEPTED;
    const recentFailed = candidates.filter((item) => !accepted(item)).slice(0, recentLimit);
    const recentlyResolved = candidates.filter(accepted).slice(0, recentLimit);

    const needPids = new Set([...recentFailed, ...recentlyResolved].map((item) => item.pid));
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
            url: available ? `/p/${encodeURIComponent(pdoc.pid || item.pid)}` : null,
        };
    };
    return {
        user: { uid, uname },
        generatedAt: now.toISOString(),
        week: summarizeWeek(weekly, now),
        trainingOverview: {
            enrolled: summaries.length,
            completed: summaries.filter((item) => item.completed).length,
            inProgress: summaries.filter((item) => !item.completed).length,
            shown: trainings.length,
        },
        trainings: trainings.map((training) => {
            const next = training.nextPid ? attach({ pid: training.nextPid }) : null;
            return {
                ...training,
                url: trainingUrl(training.tid),
                currentUrl: trainingUrl(training.tid, training.currentNid),
                next: next ? { ...next, url: trainingProblemUrl(next.url, training.tid, training.currentNid) } : null,
            };
        }),
        recentFailed: recentFailed.map((item) => ({
            ...attach(item),
            recordUrl: item.rid ? `/record/${item.rid}` : null,
        })),
        recentlyResolved: recentlyResolved.map((item) => ({ ...attach(item), resolved: true })),
        mistakes: { open: openMistakes },
    };
}

module.exports = {
    buildWorkbench,
    buildRecentTrainings,
    indexPlanPids,
    lastActiveByPlan,
    analyzeTraining,
    trainingUrl,
    trainingProblemUrl,
    summarizeWeek,
    summarizeRecentFailed,
    weekStartShanghai,
    FAILED_STATUSES,
    STATUS_LABELS,
    STATUS_TEXTS,
};
