import {
    Context, Handler, Logger, ObjectId, PERM, PRIV, ProblemModel, RecordModel, TrainingModel,
} from 'hydrooj';

const { parseTrainingRequest, buildTrainingContext } = require('./training-context.cjs');
const { trainingProblemUrl } = require('./workbench.cjs');
const logger = new Logger('swpu-train-context');

function allowed(handler: Handler) {
    return handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) && handler.user.hasPerm(PERM.PERM_VIEW_TRAINING);
}

function ordinaryProblem(handler: Handler, pdoc: any) {
    return pdoc && pdoc.domainId === handler.args.domainId && !handler.args.tid
        && !handler.response.body?.tdoc && ProblemModel.canViewBy(pdoc, handler.user);
}

function ordinaryOwnRecord(handler: Handler, record: any) {
    return record && record.domainId === handler.args.domainId && record.uid === handler.user._id
        && !record.contest && !record.files?.hack && !record.hackTarget && !handler.args.rev;
}

async function loadContext(handler: Handler, pdoc: any, record?: any) {
    const request = parseTrainingRequest(handler.request.query);
    if (!request || !allowed(handler) || !ordinaryProblem(handler, pdoc)) return null;
    if (record && !ordinaryOwnRecord(handler, record)) return null;
    // Record views do not run ProblemDetail's prepare hook. Honor addon problem
    // access rules here too, including refreshes from the standalone JSON route.
    if (record) await handler.ctx.parallel('problem/get', pdoc, handler);
    const domainId = handler.args.domainId;
    const tid = new ObjectId(request.tid);
    const tdoc = await TrainingModel.get(domainId, tid);
    // Preserve permission hooks installed by other addons, just as TrainingDetail does.
    await handler.ctx.parallel('training/get', tdoc, handler);
    const tsdoc = await TrainingModel.getStatus(domainId, tid, handler.user._id);
    if (!tsdoc?.enroll) return null;
    const pids = [...new Set<number>((tdoc.dag || []).flatMap((node) => node.pids || []))];
    if (!pids.includes(pdoc.docId)) return null;
    const [psdocs, pdocs] = await Promise.all([
        ProblemModel.getListStatus(domainId, handler.user._id, pids),
        ProblemModel.getList(domainId, pids, handler.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || handler.user._id, false),
    ]);
    // A freshly finished AC is authoritative even before the async problem-status
    // update is visible. Never overwrite stored progress with a failed record.
    const status = record?.status === 1 ? { ...psdocs, [pdoc.docId]: { status: 1 } } : psdocs;
    return buildTrainingContext({
        tdoc, psdocs: status, pdocs, pid: pdoc.docId, nid: request.nid,
        url: (name: string, args: any) => handler.url(name, args),
    });
}

function expose(handler: Handler, data: any, page: string) {
    handler.UiContext.dfacmTraining = { ...data, page, viewerUid: handler.user._id, workbenchUrl: handler.url('swpu_workbench') };
    handler.response.addHeader('Cache-Control', 'private, no-store');
}

function recordContext(handler: Handler, data: any, record: any) {
    return {
        ...data, status: record.status,
        refreshUrl: trainingProblemUrl(handler.url('swpu_training_context', { query: { rid: String(record._id) } }), data.tid, data.nid),
    };
}

class TrainingContextHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'private, no-store');
        await this.limitRate('swpu_train_context', 60, 30, `u${this.user._id}`);
        const rid = this.request.query.rid;
        this.response.body = { ok: true, data: null };
        if (!allowed(this) || typeof rid !== 'string' || !/^[a-f\d]{24}$/i.test(rid)) return;
        try {
            const record = await RecordModel.get(this.args.domainId, new ObjectId(rid));
            if (!ordinaryOwnRecord(this, record)) return;
            const pdoc = await ProblemModel.get(this.args.domainId, record.pid);
            const data = await loadContext(this, pdoc, record);
            if (data) this.response.body.data = { ...recordContext(this, data, record), page: 'record' };
        } catch {
            // Deleted/inaccessible plans degrade to the native record view.
            this.response.body = { ok: false, data: null };
        }
    }
}

export function registerTrainingContext(ctx: Context) {
    ctx.Route('swpu_training_context', '/workbench/context', TrainingContextHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after/TrainingDetail#get', (handler: Handler) => {
        if (handler.request.json || handler.response.template !== 'training_detail.html' || !allowed(handler)) return;
        const { tdoc, tsdoc, psdict, pdict } = handler.response.body;
        if (!tdoc || !tsdoc?.enroll || (handler.args.uid && Number(handler.args.uid) !== handler.user._id)) return;
        const data = buildTrainingContext({ tdoc, psdocs: psdict, pdocs: pdict, url: (name: string, args: any) => handler.url(name, args) });
        if (data) expose(handler, data, 'training');
    });
    const addProblem = async (handler: Handler) => {
        if (handler.request.json || !['problem_detail.html', 'problem_submit.html'].includes(handler.response.template)) return;
        try {
            const pdoc = handler.response.body?.pdoc;
            const data = await loadContext(handler, pdoc);
            if (!data) return;
            const urls = [pdoc.pid, pdoc.docId].filter(Boolean);
            expose(handler, {
                ...data,
                problemPaths: urls.map((pid) => handler.url('problem_detail', { pid })),
                submitPaths: urls.map((pid) => handler.url('problem_submit', { pid })),
            }, handler.response.template === 'problem_submit.html' ? 'submit' : 'problem');
        } catch (error) { logger.error('problem training context unavailable:', error); }
    };
    ctx.on('handler/after/ProblemDetail#get', addProblem);
    ctx.on('handler/after/ProblemSubmit#get', addProblem);
    ctx.on('handler/after/RecordDetail#get', async (handler: Handler) => {
        if (handler.request.json || handler.response.template !== 'record_detail.html') return;
        const { pdoc, rdoc } = handler.response.body;
        if (!ordinaryOwnRecord(handler, rdoc)) return;
        try {
            const data = await loadContext(handler, pdoc, rdoc);
            if (data) expose(handler, recordContext(handler, data, rdoc), 'record');
        } catch (error) { logger.error('record training context unavailable:', error); }
    });
    ctx.on('handler/after/ProblemSubmit#post', async (handler: Handler) => {
        if (!handler.response.body?.rid || !handler.response.redirect || handler.args.pretest) return;
        try {
            const data = await loadContext(handler, (handler as any).pdoc);
            if (data) handler.response.redirect = trainingProblemUrl(handler.response.redirect, data.tid, data.nid);
        } catch (error) { logger.error('submit training context unavailable:', error); }
    });
}
