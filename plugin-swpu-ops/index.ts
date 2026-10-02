import { Context, DomainModel, ObjectId, RecordModel, Schema, TaskModel, UserModel } from 'hydrooj';

const { createOperations } = require('./operations.cjs');

// Hydro's script administration requires PRIV_EDIT_SYSTEM and sudo authentication.
// CLI execution is reserved for the server account with access to Hydro's config.
// Deliberately register no HTTP route and no background task.
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
}
