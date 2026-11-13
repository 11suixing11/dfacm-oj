const fs = require('node:fs');
const { verifySolutions, assertCapability, problemIdentity } = require('./verify-solutions.cjs');
const { createStateStore } = require('./verification-state.cjs');
const MARK = '【本题解由站长编写】';
function compose(entry, batchId) {
    return `${MARK}\n\n<!-- dfacm-editorial:${batchId}:${entry.id} -->\n\n${entry.t}\n\n**代码（C++17）**\n\n\`\`\`cpp\n${entry.c}\n\`\`\``;
}
async function runBatch(api, batch, stateStore, options = {}) {
    await assertCapability(api, batch);
    if (options.dry) return { batchId: batch.id, dry: true, published: [], pending: [], rejected: [] };
    const release = await stateStore.lock();
    try {
        const result = await verifySolutions(api, batch, stateStore, { ...options, locked: true });
        result.published = [];
        const state = await stateStore.load();
        for (const entry of result.ready) {
            if (await problemIdentity(api, batch.domainId, entry.docId) !== entry.identity) {
                result.rejected.push({ id: entry.id, reason: 'Original problem or testdata changed before publication' }); continue;
            }
            const content = compose(entry, batch.id);
            const existing = await api.SolutionModel.getMulti(batch.domainId, entry.docId).toArray();
            const ours = existing.find((solution) => solution.content === content);
            if (ours) result.published.push({ id: entry.id, rid: entry.rid, existing: true });
            else if (existing.some((solution) => solution.content?.startsWith(MARK))) {
                result.rejected.push({ id: entry.id, reason: 'Problem already has an editorial' }); continue;
            } else {
                // Intent is durable first. If add succeeded but its receipt was lost,
                // resume recognizes exact content through the native SolutionModel.
                state.entries[entry.id].publication = 'inserting'; await stateStore.save(state);
                const solutionId = await api.SolutionModel.add(batch.domainId, entry.docId, 1, content);
                result.published.push({ id: entry.id, rid: entry.rid, solutionId: String(solutionId) });
            }
            state.entries[entry.id].publication = 'published'; await stateStore.save(state);
        }
        state.lastResult = result; await stateStore.save(state);
        return result;
    } finally { await release(); }
}
async function cliMain(api, env = process.env) {
    const receipt = createStateStore(env.DFACM_SOL_RECEIPT);
    try {
        const batch = JSON.parse(fs.readFileSync(env.DFACM_SOL_BATCH, 'utf8'));
        const result = await runBatch(api, batch, createStateStore(env.DFACM_SOL_STATE), { dry: env.DFACM_SOL_DRY === '1' });
        const ok = !result.pending.length && !result.rejected.length;
        await receipt.save({ runId: env.DFACM_SOL_RUN_ID, ok, result });
        if (!ok) process.exitCode = 1;
        console.log(JSON.stringify(result));
        return result;
    } catch (error) {
        await receipt.save({ runId: env.DFACM_SOL_RUN_ID, ok: false, error: error.message });
        process.exitCode = 1;
        throw error;
    }
}
module.exports = { compose, runBatch, cliMain };
if (require.main === module) {
    console.error('Use run-solutions.sh inside the configured Hydro administrator environment.');
    process.exitCode = 1;
}
