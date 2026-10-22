'use strict';

const { randomBytes, createHash } = require('node:crypto');
const { AssistantError, sourceLines, assistanceLevel } = require('./protocol.cjs');
const { publicProgress, publicUsage } = require('./progress.cjs');

// Shared short-lived tasks: polling may reach any Hydro/pm2 worker. Inputs and
// credentials stay in the generating worker; only results/source lines live in
// this TTL collection. Atomic leases cap concurrent billable calls site-wide.
function createMongoJobStore({ collection, generate, now = Date.now, ttlMs = 600000, maxConcurrent = 2 }) {
    const controllers = new Map();
    async function lease(key, owner, until) {
        try {
            const result = await collection.updateOne({ _id: key, expireAt: { $lte: new Date(now()) } },
                { $set: { owner, expireAt: new Date(until), type: 'lease' } }, { upsert: true });
            return !!(result.modifiedCount || result.upsertedCount);
        } catch (error) { if (error?.code === 11000) return false; throw error; }
    }
    async function release(key, owner) { await collection.deleteOne({ _id: key, owner }); }
    function publicJob(job, cacheHit = false) {
        const created = job.createdAt instanceof Date ? job.createdAt.getTime() : now();
        return {
            id: job._id, status: job.status, source: job.source, verdict: job.verdict,
            answer: job.status === 'ready' ? job.answer : null,
            error: job.status === 'failed' ? job.error : null,
            level: job.level || null, diagnostic: job.diagnostic || null,
            progress: publicProgress(job.progress, job.source?.length ? 'debug' : 'solve'),
            usage: publicUsage(job.usage), cacheHit,
            elapsedMs: Math.max(0, (job.completedAt instanceof Date ? job.completedAt.getTime() : now()) - created),
        };
    }
    async function existing(scope, target, identity) {
        return collection.findOne({
            type: 'job', scope, target, identity,
            status: { $in: ['pending', 'ready'] }, expireAt: { $gt: new Date(now()) },
        });
    }
    async function start(request, scope, target, config, version) {
        const identity = createHash('sha256').update(JSON.stringify({ request, version, model: config.model,
            endpoint: config.endpoint, transport: config.transport || 'chat-completions', personal: config.personal === true, credential: config.apiKey })).digest('hex');
        const prior = await existing(scope, target, identity);
        if (prior) return publicJob(prior, prior.status === 'ready');
        const id = randomBytes(16).toString('hex');
        const userLease = 'user:' + scope;
        const runDeadline = now() + config.timeoutMs + 30000;
        if (!await lease(userLease, id, runDeadline)) {
            const raced = await existing(scope, target, identity);
            if (raced) return publicJob(raced, raced.status === 'ready');
            throw new AssistantError('ALREADY_RUNNING', '你有一个结果正在生成，请等待完成。', 429);
        }
        let slot = null;
        let transferred = false;
        try {
            for (let i = 0; i < maxConcurrent; i++) {
                if (await lease('slot:' + i, id, runDeadline)) { slot = 'slot:' + i; break; }
            }
            if (!slot) throw new AssistantError('BUSY', '题目助手正在处理其他请求，请稍后重试。', 503);
            const job = {
                _id: id, type: 'job', scope, target, identity, status: 'pending',
                expireAt: new Date(now() + ttlMs), runDeadline: new Date(runDeadline),
                source: request.submission ? sourceLines(request.submission.code) : [],
                verdict: request.submission?.verdict || '',
                createdAt: new Date(now()), progress: { stage: 'connecting', preview: {} }, usage: null,
                level: request.mode === 'solve' ? assistanceLevel(request.level) : null,
                diagnostic: request.submission ? { origin: request.submission.origin || 'manual', hasCompilerOutput: !!request.submission.compilerOutput } : null,
            };
            await collection.insertOne(job);
            const controller = new AbortController();
            controllers.set(id, controller);
            const leaseSlot = slot;
            let writes = Promise.resolve(), lastPayload = '', latestUsage = null;
            const report = (value) => {
                const progress = publicProgress(value, request.mode);
                if (Object.prototype.hasOwnProperty.call(value || {}, 'usage')) latestUsage = publicUsage(value.usage);
                const usage = latestUsage;
                const payload = JSON.stringify({ progress, usage });
                if (payload === lastPayload) return;
                lastPayload = payload;
                writes = writes.then(() => collection.updateOne({ _id: id, status: 'pending' }, { $set: { progress, usage } })).catch(() => {});
            };
            Promise.resolve().then(() => generate(request, config, controller.signal, report))
                .then(async (answer) => {
                    await writes;
                    return collection.updateOne({ _id: id, status: 'pending' }, { $set: {
                        status: 'ready', answer, usage: Object.prototype.hasOwnProperty.call(answer, 'usage') ? publicUsage(answer.usage) : latestUsage,
                        completedAt: new Date(now()), progress: { stage: 'complete', preview: {} }, expireAt: new Date(now() + ttlMs),
                    } });
                })
                .catch(async (error) => { await writes; return collection.updateOne({ _id: id, status: 'pending' }, { $set: {
                    status: 'failed', expireAt: new Date(now() + ttlMs),
                    completedAt: new Date(now()), usage: latestUsage, progress: { stage: 'complete', preview: {} },
                    error: error instanceof AssistantError ? { code: error.code, message: error.message }
                        : { code: 'GENERATION_FAILED', message: '生成失败，请稍后重试。' },
                } }).catch(() => {}); })
                .finally(async () => {
                    controllers.delete(id);
                    await Promise.allSettled([release(userLease, id), release(leaseSlot, id)]);
                }).catch(() => {});
            transferred = true;
            return publicJob(job);
        } finally {
            if (!transferred) await Promise.allSettled([release(userLease, id), slot ? release(slot, id) : Promise.resolve()]);
        }
    }
    async function get(id, scope, target) {
        const job = typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? await collection.findOne({
            _id: id, type: 'job', scope, target, expireAt: { $gt: new Date(now()) },
        }) : null;
        if (!job) throw new AssistantError('JOB_NOT_FOUND', '结果已过期，请重新生成。', 404);
        if (job.status === 'pending' && job.runDeadline.getTime() < now()) {
            const error = { code: 'TIMEOUT', message: '生成任务已中断，请重试。' };
            await collection.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'failed', error,
                completedAt: new Date(now()), progress: { stage: 'complete', preview: {} } } });
            job.status = 'failed'; job.error = error; job.completedAt = new Date(now()); job.progress = { stage: 'complete', preview: {} };
        }
        return publicJob(job);
    }
    function dispose() { for (const controller of controllers.values()) controller.abort(); controllers.clear(); }
    return { start, get, dispose };
}

module.exports = { createMongoJobStore };
