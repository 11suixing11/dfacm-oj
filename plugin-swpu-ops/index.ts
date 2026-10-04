import { Context, db, DomainModel, ObjectId, RecordModel, Schema, TaskModel, UserModel } from 'hydrooj';

const { createOperations } = require('./operations.cjs');
const { createLiveRp } = require('./live-rp.cjs');
const {
    createPurgeDoc, createRpLock, createRpSweep, createSanitize, serviceUidsFromEnv,
} = require('./rp-sweep.cjs');

// Hydro's script administration requires PRIV_EDIT_SYSTEM and sudo authentication.
// CLI execution is reserved for the server account with access to Hydro's config.
// Deliberately register no HTTP route; the background work is the live-RP hook
// plus the hourly sweep (see rp-sweep.cjs).
export function apply(ctx: Context) {
    const ops = createOperations({ DomainModel, ObjectId, RecordModel, TaskModel, UserModel });
    const windowFields = {
        domainId: Schema.string().default('system'),
        since: Schema.string().default(''),
        until: Schema.string().default(''),
        timeZone: Schema.union(['Asia/Shanghai', 'UTC']).default('Asia/Shanghai'),
    };
    ctx.addScript('swpuWeeklyReport', 'SWPU 训练周报：导出 CSV 与 Markdown', Schema.object({
        ...windowFields,
        group: Schema.string().default(''),
    }), ops.weeklyReport);
    ctx.addScript('swpuHealthSummary', 'SWPU 判题健康摘要（只读）', Schema.object({
        ...windowFields,
        staleMinutes: Schema.number().default(10),
    }), ops.healthSummary);
    // Immediate full recalculation for ops, e.g. after out-of-band data fixes:
    //   hydrooj cli script swpuRpSweep '{}'
    // Purges service-account rows from document.status first, then reruns the
    // RP script for every domain.
    const statusColl = db.collection('document.status' as any);
    const manualSweep = createRpSweep({ sanitize: createSanitize(statusColl, serviceUidsFromEnv()) });
    ctx.addScript('swpuRpSweep', 'SWPU RP 立即全域重算（先清服务号 document.status 残留）', Schema.object({}),
        async () => ({ recalculated: await manualSweep.runOnce('manual'), failures: [...manualSweep.failures] }));
    // RP normally only recalculates in task.daily (03:00); rerun it shortly
    // after each judged submission so the ranking page stays current, and
    // hourly as a safety net for mutations that bypass the record flow
    // (contest deletion, admin edits, manual database fixes — no events).
    // Both paths purge service-account rows before computing, so the judge
    // account can never resurrect phantom RP (the v1.12.0 incident).
    if (process.env.SWPU_LIVE_RP !== '0' && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')) {
        const serviceUids = serviceUidsFromEnv();
        const sanitize = createSanitize(statusColl, serviceUids);
        const lock = createRpLock();
        const live = createLiveRp({
            sanitize,
            purgeDoc: createPurgeDoc(statusColl),
            serviceUids,
            lock,
        });
        ctx.on('record/change', live.hook);
        ctx.on('dispose', live.stop);
        if (process.env.SWPU_RP_SWEEP !== '0') {
            const sweep = createRpSweep({ sanitize, lock });
            sweep.start();
            ctx.on('dispose', sweep.stop);
        }
    }
}
