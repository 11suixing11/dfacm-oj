'use strict';

const { AssistantError, VERDICTS, problemDto, submissionDto, assistanceLevel } = require('./protocol.cjs');

function createContextLoader({ problemModel, recordModel, contestModel, permissions, objectId }) {
    async function visibleProblem(domainId, pid, user) {
        const pdoc = await problemModel.get(domainId, pid);
        if (!pdoc) throw new AssistantError('NOT_FOUND', '这道题不存在或已删除。', 404);
        if (!problemModel.canViewBy(pdoc, user)) throw new AssistantError('FORBIDDEN', '你暂时不能查看这道题。', 403);
        const accepted = user.hasPerm(permissions.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT)
            && (await problemModel.getStatus(domainId, pdoc.docId, user._id))?.status === 1;
        if (!user.hasPerm(permissions.PERM_VIEW_PROBLEM_SOLUTION) && !accepted) {
            throw new AssistantError('FORBIDDEN', '你暂时没有查看题解的权限。', 403);
        }
        return pdoc;
    }

    async function ownRecord(domainId, rid, user) {
        if (typeof rid !== 'string' || !/^[a-f0-9]{24}$/i.test(rid)) {
            throw new AssistantError('INVALID_RECORD', '提交记录编号无效。');
        }
        const rdoc = await recordModel.get(domainId, objectId(rid));
        if (!rdoc || rdoc.uid !== user._id || rdoc.domainId !== domainId) {
            throw new AssistantError('NOT_FOUND', '没有找到你自己的这份提交。', 404);
        }
        if (!VERDICTS[rdoc.status]) throw new AssistantError('NOT_FAILED', '这份提交尚未失败，评测结束后再诊断。');
        if (rdoc.contest) {
            const tdoc = await contestModel.get(domainId, rdoc.contest);
            if (!tdoc || !contestModel.isDone(tdoc)) {
                throw new AssistantError('CONTEST_ACTIVE', '请在比赛结束后使用题解与诊断。', 403);
            }
        }
        return rdoc;
    }

    async function latestFailed(domainId, pid, user) {
        const records = await recordModel.getMulti(domainId, {
            uid: user._id, pid, contest: null, status: { $in: Object.keys(VERDICTS).map(Number) },
        }).sort({ _id: -1 }).limit(1).toArray();
        return records[0] || null;
    }

    async function load({ domainId, pid, rid, user, args = {} }) {
        if (!user?._id || user._id <= 0) throw new AssistantError('LOGIN_REQUIRED', '请先登录后使用题目助手。', 401);
        if (args.tid) throw new AssistantError('CONTEST_ACTIVE', '比赛题目页暂不提供题解与诊断。', 403);
        const mode = args.mode || (rid ? 'debug' : 'solve');
        if (!['solve', 'debug'].includes(mode)) throw new AssistantError('INVALID_MODE', '请选择题解或代码诊断。');
        let rdoc = null;
        if (rid) {
            if (mode !== 'debug') throw new AssistantError('INVALID_MODE', '提交页用于代码诊断。');
            rdoc = await ownRecord(domainId, rid, user);
            pid = rdoc.pid;
        }
        if (typeof pid !== 'string' && !Number.isSafeInteger(pid)) throw new AssistantError('INVALID_PROBLEM', '题目编号无效。');
        const pdoc = await visibleProblem(domainId, pid, user);
        const request = { source: 'oj', mode, problem: problemDto(pdoc, user.viewLang), submission: null };
        if (mode === 'solve') request.level = assistanceLevel(args.level);
        else if (args.level) throw new AssistantError('INVALID_LEVEL', '代码诊断不使用题解层级。');
        if (mode === 'debug') {
            if (rid && (args.code !== undefined || args.rid !== undefined)) {
                throw new AssistantError('INVALID_INPUT', '提交页诊断始终使用这份提交的原始代码。');
            }
            if (!rdoc && typeof args.code === 'string' && args.code.trim()) {
                request.submission = submissionDto({ code: args.code, language: 'cpp', verdict: args.verdict || 'UNKNOWN',
                    compilerOutput: args.compiler_output || '', origin: 'manual' });
            } else {
                if (!rdoc && args.rid) rdoc = await ownRecord(domainId, args.rid, user);
                if (!rdoc) rdoc = await latestFailed(domainId, pdoc.docId, user);
                if (!rdoc) throw new AssistantError('NO_CODE', '没有找到未通过的提交，请粘贴你的代码。');
                if (rdoc.uid !== user._id || rdoc.domainId !== domainId || rdoc.pid !== pdoc.docId || !VERDICTS[rdoc.status]) {
                    throw new AssistantError('RECORD_MISMATCH', '这份提交不属于当前题目。', 400);
                }
                request.submission = submissionDto({
                    code: rdoc.code || '', language: rdoc.lang,
                    verdict: VERDICTS[rdoc.status], compilerOutput: rdoc.compilerTexts, origin: 'record',
                });
            }
        }
        return { request, pdoc, rdoc, scope: `${domainId}:${user._id}` };
    }

    return { visibleProblem, ownRecord, load };
}

module.exports = { createContextLoader };
