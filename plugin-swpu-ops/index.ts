import { Context, db, DomainModel, ObjectId, RecordModel, Schema, TaskModel, UserModel } from 'hydrooj';

const { createOperations } = require('./operations.cjs');
const { createLiveRp } = require('./live-rp.cjs');
const {
    assertServiceAccounts, createAutoJoin, createJoinReconcile, createPurgeDoc, createRpLock, createRpSweep, createSanitize, dryRunFromEnv, serviceUidsFromEnv,
} = require('./rp-sweep.cjs');

// Hydro's script administration requires PRIV_EDIT_SYSTEM and sudo authentication.
// CLI execution is reserved for the server account with access to Hydro's config.
// Deliberately register no HTTP route; the background work is the live-RP hook
// plus the hourly sweep (see rp-sweep.cjs).
export async function apply(ctx: Context) {
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
    // Purges service-account rows from document.status, reconciles ranking-
    // domain joins, then reruns the RP script for every domain.
    const statusColl = db.collection('document.status' as any);
    const domainUserColl = db.collection('domain.user' as any);
    const userColl = db.collection('user' as any);
    const serviceUids = serviceUidsFromEnv();
    const dryRun = dryRunFromEnv();
    const reconcile = createJoinReconcile({ userColl, domainUserColl, uids: serviceUids });
    // The purge is the only destructive thing this plugin does, and it runs
    // unattended. Verify each target uid really is a service account before
    // arming it, so a retired judge uid reassigned to a person cannot have that
    // account's statuses wiped hourly. SWPU_SERVICE_UIDS_DRYRUN=1 then reports
    // the blast radius without deleting anything.
    if (serviceUids.length) {
        const targets = await userColl.find({ _id: { $in: serviceUids } }, { projection: { _id: 1, uname: 1 } }).toArray();
        assertServiceAccounts(targets, serviceUids);
        const missing = serviceUids.filter((uid) => !targets.some((doc) => doc && doc._id === uid));
        if (missing.length) console.warn('swpu-ops [W] SWPU_SERVICE_UIDS names uids with no user row:', missing.join(', '));
        if (dryRun) console.warn('swpu-ops [W] SWPU_SERVICE_UIDS_DRYRUN=1: the service-account purge will not delete anything.');
    }
    const sanitize = createSanitize(statusColl, serviceUids, { dryRun });
    const manualSweep = createRpSweep({ sanitize, reconcile });
    ctx.addScript('swpuRpSweep', 'SWPU RP 立即全域重算（清服务号残留 + 补齐域 join + 全域重算）', Schema.object({}),
        async () => ({ recalculated: await manualSweep.runOnce('manual'), failures: [...manualSweep.failures] }));
    // The v1.12.0 auto-join only covers /reg/complete. GitHub (and any OAuth)
    // first logins funnel into Hydro core's UserRegisterWithCodeHandler, which
    // sets no join flag, so those members never reach the ranking boards; the
    // same goes for admin-created accounts. Every login path ends in Hydro's
    // serial `auth/login` event, so joining there closes all of them instantly.
    // Hourly reconciliation in the sweep is the backstop for anything else.
    if (process.env.SWPU_AUTO_JOIN !== '0') {
        const autoJoin = createAutoJoin({ coll: domainUserColl, domainModel: DomainModel, uids: serviceUids });
        ctx.on('auth/login', (_handler, udoc) => {
            autoJoin(udoc).catch((e) => console.error('swpu-ops [E] auto-join on login failed:', e));
        });
    }
    // RP normally only recalculates in task.daily (03:00); rerun it shortly
    // after each judged submission so the ranking page stays current, and
    // hourly as a safety net for mutations that bypass the record flow
    // (contest deletion, admin edits, manual database fixes — no events).
    // Both paths purge service-account rows before computing, so the judge
    // account can never resurrect phantom RP (the v1.12.0 incident).
    if (process.env.SWPU_LIVE_RP !== '0' && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')) {
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
            const sweep = createRpSweep({ sanitize, reconcile, lock });
            sweep.start();
            ctx.on('dispose', sweep.stop);
        }
    }
}
