import { randomUUID } from 'crypto';
import { awardSolve, isOfficialAcceptedRecord, ShopCollections, ShopModels } from './points';

export const BACKFILL_PAGE_SIZE = 500;
export const BACKFILL_SCAN_LIMIT = 20000;
export const BACKFILL_QUERY_MS = 10000;

interface BackfillState {
    _id: string;
    round: string;
    upper: any;
    after: any;
    scanned: number;
    awarded: number;
    completed: boolean;
    startedAt: Date;
    updatedAt: Date;
}
interface BackfillDependencies {
    records: { find(filter: any): any };
    state: {
        findOne(filter: any, options?: any): Promise<BackfillState | null>;
        insertOne(doc: BackfillState, options?: any): Promise<any>;
        updateOne(filter: any, update: any, options?: any): Promise<{ matchedCount: number }>;
    };
    models: ShopModels;
    collections: ShopCollections;
    now: () => Date;
}

async function readPage(records: BackfillDependencies['records'], filter: any, direction: number, size: number) {
    const cursor = records.find(filter).sort({ _id: direction })
        .project({ _id: 1, domainId: 1, uid: 1, pid: 1, status: 1, contest: 1 })
        .limit(size).maxTimeMS(BACKFILL_QUERY_MS);
    try { return await cursor.toArray(); } finally { await cursor.close(); }
}

async function currentRound(deps: BackfillDependencies, domainId: string): Promise<BackfillState> {
    const options = { maxTimeMS: BACKFILL_QUERY_MS };
    const previous = await deps.state.findOne({ _id: domainId }, options);
    if (previous && !previous.completed) return previous;
    const newest = await readPage(deps.records, { domainId }, -1, 1);
    // Preserve BSON IDs as BSON in Mongo. No string conversion or new driver
    // dependency is needed for keyset pagination after process restarts.
    const fresh: BackfillState = {
        _id: domainId, round: randomUUID(), upper: newest[0]?._id ?? null,
        after: null, scanned: 0, awarded: 0, completed: !newest.length,
        startedAt: deps.now(), updatedAt: deps.now(),
    };
    if (previous) {
        const result = await deps.state.updateOne(
            { _id: domainId, round: previous.round, after: previous.after, completed: true }, { $set: fresh }, options,
        );
        if (result.matchedCount) return fresh;
    } else {
        try { await deps.state.insertOne(fresh, options); return fresh; } catch (error) {
            if ((error as any)?.code !== 11000) throw error;
        }
    }
    // Another invocation won round creation. Reuse its round and upper bound.
    const concurrent = await deps.state.findOne({ _id: domainId }, options);
    if (!concurrent) throw new Error(`Backfill state disappeared: ${domainId}`);
    return concurrent;
}

export async function runHistoricalBackfill(
    deps: BackfillDependencies, domainIds: string[], report: (progress: any) => void,
) {
    const unfinished: string[] = [];
    let totalScannedThisRun = 0;
    let totalAwardedThisRun = 0;
    for (const domainId of domainIds) {
        let state = await currentRound(deps, domainId);
        let scannedThisRun = 0;
        let awardedThisRun = 0;
        while (!state.completed && scannedThisRun < BACKFILL_SCAN_LIMIT) {
            const filter = { domainId, _id: {
                $lte: state.upper, ...(state.after === null ? {} : { $gt: state.after }),
            } };
            const page = await readPage(deps.records, filter, 1,
                Math.min(BACKFILL_PAGE_SIZE, BACKFILL_SCAN_LIMIT - scannedThisRun));
            const after = page.length ? page[page.length - 1]._id : state.after;
            const seen = new Set<string>();
            for (const record of page) {
                if (!isOfficialAcceptedRecord(record)) continue;
                const key = `${record.uid}:${record.pid}`;
                if (seen.has(key)) continue;
                seen.add(key);
                // A failed/ambiguous award aborts the page. Retrying uses the
                // original solve ref, so already-inserted awards stay unique.
                const result = await awardSolve(deps.models, deps.collections, deps.now, {
                    uid: record.uid, domainId, docId: record.pid, kind: 'backfill',
                    backfillRound: state.round, backfillRecord: record._id,
                });
                if (result.awarded) awardedThisRun++;
            }
            // The indexed round/page count recovers awards inserted before a
            // page interruption, even though their retry returns awarded:false.
            const pageAwarded = await deps.collections.ledger.countDocuments({
                backfillRound: state.round, backfillRecord: {
                    $lte: after, ...(state.after === null ? {} : { $gt: state.after }),
                },
            }, { maxTimeMS: BACKFILL_QUERY_MS });
            const next: BackfillState = {
                ...state, after, scanned: state.scanned + page.length, awarded: state.awarded + pageAwarded,
                completed: page.length < BACKFILL_PAGE_SIZE || String(after) === String(state.upper),
                updatedAt: deps.now(),
            };
            const saved = await deps.state.updateOne(
                { _id: domainId, round: state.round, after: state.after, completed: false },
                { $set: next }, { maxTimeMS: BACKFILL_QUERY_MS },
            );
            if (!saved.matchedCount) throw new Error(`Backfill checkpoint changed concurrently: ${domainId}`);
            scannedThisRun += page.length;
            state = next;
            report({ domainId, round: state.round, scanned: state.scanned, awarded: state.awarded,
                completed: state.completed, scannedThisRun, awardedThisRun, progress: state.scanned,
                message: `${domainId}: 本轮已扫描 ${state.scanned} 条，新入账 ${state.awarded} 条` });
        }
        totalScannedThisRun += scannedThisRun;
        totalAwardedThisRun += awardedThisRun;
        if (!state.completed) unfinished.push(domainId);
        report({ domainId, round: state.round, scanned: state.scanned, awarded: state.awarded,
            completed: state.completed, scannedThisRun, awardedThisRun, message: `${domainId}: ${state.completed ? '扫描完成' : '已保存断点，请再次运行续扫'}（本轮 ${state.scanned} 条，新入账 ${state.awarded} 条）` });
    }
    report({ scannedThisRun: totalScannedThisRun, awardedThisRun: totalAwardedThisRun, message: unfinished.length
        ? `本次回填结束：以下域已保存断点，再次运行将继续本轮：${unfinished.join('、')}`
        : '回填完成：各域本轮扫描完成（幂等，可重复运行以覆盖旧记录重判）' });
    return true;
}
