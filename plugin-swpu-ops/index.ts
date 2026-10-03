import { Context, DomainModel, ObjectId, RecordModel, Schema, TaskModel, UserModel } from 'hydrooj';

const { createOperations } = require('./operations.cjs');
const { createLiveRp } = require('./live-rp.cjs');

// Hydro's script administration requires PRIV_EDIT_SYSTEM and sudo authentication.
// CLI execution is reserved for the server account with access to Hydro's config.
// Deliberately register no HTTP route; the only background work is the live-RP
// hook below (a debounced rerun of Hydro's own rp script after judged records).
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
    // RP normally only recalculates in task.daily (03:00); rerun it shortly
    // after each judged submission so the ranking page stays current. Only
    // instance 0 registers; if that instance is down, RP falls back to the
    // nightly run (idempotent compute, no data loss).
    if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0') {
        ctx.on('record/change', createLiveRp().hook);
    }
}
