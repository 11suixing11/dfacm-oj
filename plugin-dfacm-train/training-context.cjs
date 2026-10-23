'use strict';

const { analyzeTraining, trainingProblemUrl } = require('./workbench.cjs');

function parseTrainingRequest(query = {}) {
    if (typeof query.training !== 'string' || !/^[a-f\d]{24}$/i.test(query.training)) return null;
    let nid = null;
    if (query.trainingNode !== undefined) {
        if (!/^[1-9]\d*$/.test(String(query.trainingNode))) return null;
        nid = Number(query.trainingNode);
        if (!Number.isSafeInteger(nid)) return null;
    }
    return { tid: query.training.toLowerCase(), nid };
}

function unlockedNodes(tdoc, psdocs) {
    const done = new Set();
    const unlocked = [];
    for (const node of tdoc.dag || []) {
        if (!(node.requireNids || []).every((nid) => done.has(nid))) continue;
        unlocked.push(node);
        if ((node.pids || []).every((pid) => psdocs[pid]?.status === 1)) done.add(node._id);
    }
    return unlocked;
}

// Pure DTO assembly. Callers validate domain, permissions, enrollment and record
// ownership before supplying documents. URLs come from Hydro's domain-aware router.
function buildTrainingContext({ tdoc, psdocs = {}, pdocs = {}, pid = null, nid = null, url }) {
    if (!tdoc || !Array.isArray(tdoc.dag)) return null;
    const summary = analyzeTraining(tdoc, psdocs);
    const unlocked = unlockedNodes(tdoc, psdocs);
    const node = pid === null
        ? unlocked.find((item) => item._id === summary.currentNid)
        : unlocked.find((item) => (nid === null || item._id === nid) && item.pids.includes(pid));
    if (pid !== null && !node) return null;
    const tid = String(tdoc.docId);
    const route = url('training_detail', { tid: tdoc.docId });
    const chapter = (id) => id == null ? route : `${route}#node-${encodeURIComponent(id)}`;
    const nextPid = node?.pids.find((id) => psdocs[id]?.status !== 1) ?? summary.nextPid;
    const nextNode = node?.pids.includes(nextPid) ? node
        : unlocked.find((item) => item._id === summary.currentNid);
    const problem = (id, nodeId) => {
        const doc = pdocs[id];
        if (!doc || doc.docId !== id) return null;
        const base = url('problem_detail', { pid: doc.pid || id });
        return {
            pid: id, title: doc.title,
            url: trainingProblemUrl(base, tid, nodeId),
            accepted: psdocs[id]?.status === 1,
        };
    };
    return {
        tid, nid: node?._id ?? null,
        title: tdoc.title || '', chapterTitle: node?.title || '',
        trainingUrl: route, chapterUrl: chapter(node?._id),
        done: summary.done, total: summary.total, percent: summary.percent,
        completed: summary.completed,
        unlockedNids: unlocked.map((item) => item._id),
        problem: pid === null ? null : problem(pid, node._id),
        next: nextPid === null ? null : problem(nextPid, nextNode?._id),
    };
}

module.exports = { parseTrainingRequest, unlockedNodes, buildTrainingContext };
