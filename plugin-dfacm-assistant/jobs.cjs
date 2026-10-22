'use strict';

const { randomBytes, createHash } = require('node:crypto');
const { AssistantError, sourceLines, assistanceLevel } = require('./protocol.cjs');
const { publicProgress, publicUsage } = require('./progress.cjs');

function createJobStore({ generate, now = Date.now, ttlMs = 10 * 60 * 1000, maxJobs = 100, maxConcurrent = 2 }) {
    const jobs = new Map();
    let running = 0;
    function cleanup() {
        for (const [id, job] of jobs) if (job.status !== 'pending' && now() - job.updatedAt > ttlMs) jobs.delete(id);
    }
    function publicJob(job, cacheHit = false) {
        return {
            id: job.id, status: job.status,
            answer: job.status === 'ready' ? job.answer : null,
            error: job.status === 'failed' ? job.error : null,
            source: job.source,
            verdict: job.verdict,
            level: job.level, diagnostic: job.diagnostic,
            progress: publicProgress(job.progress, job.source.length ? 'debug' : 'solve'),
            usage: publicUsage(job.usage), cacheHit,
            elapsedMs: Math.max(0, (job.completedAt ?? now()) - job.createdAt),
        };
    }
    function start(request, scope, target, config, version) {
        cleanup();
        const identity = createHash('sha256').update(JSON.stringify({ request, version, model: config.model,
            endpoint: config.endpoint, transport: config.transport || 'chat-completions', personal: config.personal === true, credential: config.apiKey })).digest('hex');
        for (const job of jobs.values()) {
            if (job.scope !== scope) continue;
            if (job.target === target && job.identity === identity && job.status !== 'failed') return publicJob(job, job.status === 'ready');
            if (job.status === 'pending') throw new AssistantError('ALREADY_RUNNING', '你有一个结果正在生成，请等待完成。', 429);
        }
        if (running >= maxConcurrent || jobs.size >= maxJobs) throw new AssistantError('BUSY', '题目助手正在处理其他请求，请稍后重试。', 503);
        const job = {
            id: randomBytes(16).toString('hex'), scope, target, identity, status: 'pending',
            updatedAt: now(), source: request.submission ? sourceLines(request.submission.code) : [],
            verdict: request.submission?.verdict || '', controller: new AbortController(),
            createdAt: now(), progress: { stage: 'connecting', preview: {} }, usage: null,
            level: request.mode === 'solve' ? assistanceLevel(request.level) : null,
            diagnostic: request.submission ? { origin: request.submission.origin || 'manual', hasCompilerOutput: !!request.submission.compilerOutput } : null,
        };
        jobs.set(job.id, job);
        running++;
        job.done = Promise.resolve().then(() => generate(request, config, job.controller.signal, value => {
            job.progress = publicProgress(value, request.mode);
            if (Object.prototype.hasOwnProperty.call(value || {}, 'usage')) job.usage = publicUsage(value.usage);
        }))
            .then((answer) => { job.answer = answer; job.status = 'ready';
                if (Object.prototype.hasOwnProperty.call(answer, 'usage')) job.usage = publicUsage(answer.usage);
                job.progress = { stage: 'complete', preview: {} }; })
            .catch((error) => {
                job.status = 'failed';
                job.progress = { stage: 'complete', preview: {} };
                job.error = error instanceof AssistantError
                    ? { code: error.code, message: error.message }
                    : { code: 'GENERATION_FAILED', message: '生成失败，请稍后重试。' };
            }).finally(() => { job.completedAt = job.updatedAt = now(); running--; });
        return publicJob(job);
    }
    function get(id, scope, target) {
        cleanup();
        const job = typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? jobs.get(id) : null;
        if (!job || job.scope !== scope || job.target !== target) throw new AssistantError('JOB_NOT_FOUND', '结果已过期，请重新生成。', 404);
        return publicJob(job);
    }
    function dispose() { for (const job of jobs.values()) job.controller.abort(); jobs.clear(); }
    return { start, get, dispose };
}

module.exports = { createJobStore };
