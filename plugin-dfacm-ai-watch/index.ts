import { Context, db, Handler, Logger, ObjectId, PRIV, ProblemModel, RecordModel } from 'hydrooj';

const { configFromEnv } = require('./config.cjs');
const { createMongoStore } = require('./store.cjs');
const { createEngine } = require('./engine.cjs');
const { createHandlers } = require('./http.cjs');

export const inject = ['db'];

export async function apply(ctx: Context) {
    const config = configFromEnv();
    const logger = new Logger('dfacm-ai-watch');
    // Never log code, student notes, credentials, or database query payloads.
    const log = (stage: string, error: any) => logger.warn(`${stage} failed (${String(error?.code || 'INTERNAL')}).`);
    const reports = db.collection('dfacm_ai_watch_reports' as any);
    const sources = db.collection('dfacm_ai_watch_sources' as any);
    const state = db.collection('dfacm_ai_watch_state' as any);
    // Only indexes owned by this addon are created. Hydro and the assistant
    // retain their installed versions and original collection schemas.
    await db.ensureIndexes(reports,
        { key: { expireAt: 1 }, name: 'expiry', expireAfterSeconds: 0 },
        { key: { domainId: 1, rid: -1 }, name: 'domain_rid', unique: true },
        { key: { domainId: 1, state: 1, submittedAt: 1 }, name: 'pending' },
        { key: { domainId: 1, verdict: 1, rid: 1 }, name: 'verdict_reconcile' },
        { key: { domainId: 1, contest: 1, submittedAt: -1 }, name: 'contest' });
    await db.ensureIndexes(sources,
        { key: { expireAt: 1 }, name: 'expiry', expireAfterSeconds: 0 },
        { key: { domainId: 1, uid: 1, pid: 1, completedAt: -1 }, name: 'source_context' });
    await db.ensureIndexes(state, { key: { expireAt: 1 }, name: 'expiry', expireAfterSeconds: 0 });

    const store = createMongoStore({ reports, sources, state, jobs: db.collection('dfacm_assistant_jobs' as any),
        records: RecordModel.coll, problemModel: ProblemModel, objectId: (value: string) => new ObjectId(value), config });
    const engine = createEngine({ store, config, log });
    const handlers = createHandlers({ Handler, store, config, adminPrivilege: PRIV.PRIV_MANAGE_ALL_DOMAIN, root: __dirname, log });
    ctx.Route('dfacm_ai_watch', '/manage/ai-watch', handlers.WatchPageHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('dfacm_ai_watch_data', '/manage/ai-watch/data', handlers.WatchDataHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('dfacm_ai_watch_report', '/manage/ai-watch/report/:rid', handlers.WatchReportHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('dfacm_ai_watch_asset', '/manage/ai-watch/assets/:file', handlers.WatchAssetHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.injectUI('ControlPanel', 'dfacm_ai_watch', { family: '提交审核', icon: 'search' }, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.i18n.load('zh', { dfacm_ai_watch: 'AI 作答线索审核' });
    ctx.i18n.load('en', { dfacm_ai_watch: 'Submission Review' });
    // The judged-result path never awaits the analysis worker. Mongo leases
    // deduplicate work across all Hydro / pm2 processes.
    if (!process.env.HYDRO_CLI) {
        ctx.on('record/change', engine.enqueue);
        ctx.effect(() => { engine.start(); return () => engine.stop(); });
    }
    logger.info('Submission review ready: /manage/ai-watch');
}
