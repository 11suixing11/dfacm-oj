'use strict';

const { assistanceLevel } = require('./protocol.cjs');

const STAGES = Object.freeze(['connecting', 'generating', 'template', 'validating', 'complete']);
const PREVIEW_KEYS = Object.freeze(['meaning', 'approach', 'summary']);

function tokenCount(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : null; }
function usageDto(value, format = 'chat') {
    if (!value || typeof value !== 'object') return null;
    const input = tokenCount(format === 'chat' ? value.prompt_tokens : value.input_tokens);
    const output = tokenCount(format === 'chat' ? value.completion_tokens : value.output_tokens);
    if (input === null || output === null) return null;
    const cached = tokenCount(format === 'codex' ? value.cached_input_tokens
        : (format === 'chat' ? value.prompt_tokens_details : value.input_tokens_details)?.cached_tokens);
    return { inputTokens: input, outputTokens: output, totalTokens: input + output,
        cachedInputTokens: cached === null || cached > input ? null : cached };
}
function publicUsage(value) {
    if (!value) return null;
    const input = tokenCount(value.inputTokens), output = tokenCount(value.outputTokens);
    if (input === null || output === null) return null;
    const cached = tokenCount(value.cachedInputTokens);
    return { inputTokens: input, outputTokens: output, totalTokens: input + output,
        cachedInputTokens: cached === null || cached > input ? null : cached };
}
function addUsage(left, right) {
    if (!right) return left;
    if (!left) return right;
    return publicUsage({ inputTokens: left.inputTokens + right.inputTokens,
        outputTokens: left.outputTokens + right.outputTokens,
        cachedInputTokens: left.cachedInputTokens === null || right.cachedInputTokens === null
            ? null : left.cachedInputTokens + right.cachedInputTokens });
}

// Only completed, top-level JSON strings are eligible for an early preview.
// Raw deltas, unfinished escapes, code, line locations and reasoning stay private.
function completedStrings(raw) {
    if (typeof raw !== 'string' || raw.length > 1000000) return {};
    let position = 0;
    const skip = () => { while (/\s/.test(raw[position] || '') && position < raw.length) position++; };
    function string() {
        if (raw[position] !== '"') return null;
        const start = position++;
        while (position < raw.length) {
            const char = raw[position++];
            if (char === '\\') { if (position >= raw.length) return null; position++; }
            else if (char === '"') {
                try { return JSON.parse(raw.slice(start, position)); } catch { return null; }
            }
        }
        return null;
    }
    skip(); if (raw[position++] !== '{') return {};
    const values = {};
    for (;;) {
        skip(); if (raw[position] === '}') break;
        const key = string(); if (key === null) break;
        skip(); if (raw[position++] !== ':') break;
        skip();
        if (raw[position] === '"') {
            const value = string(); if (value === null) break;
            values[key] = value;
        } else {
            let depth = 0, quoted = false, escaped = false;
            while (position < raw.length) {
                const char = raw[position];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') quoted = false;
                } else {
                    if (char === '"') quoted = true;
                    else if (char === '[' || char === '{') depth++;
                    else if (char === ']' || char === '}') { if (!depth) break; depth--; }
                    else if (char === ',' && !depth) break;
                }
                position++;
            }
        }
        skip(); if (raw[position] !== ',') break; position++;
    }
    return values;
}
function safePreview(value, mode = 'solve') {
    const preview = {};
    if (!value || typeof value !== 'object') return preview;
    for (const key of mode === 'debug' ? ['summary'] : ['meaning', 'approach']) {
        if (typeof value[key] === 'string' && value[key].length <= 16000) preview[key] = value[key];
    }
    return preview;
}
function publicProgress(value, mode = 'solve') {
    return { stage: STAGES.includes(value?.stage) ? value.stage : 'connecting',
        preview: safePreview(value?.preview, mode) };
}
function createProgressReporter({ request, apiKey, onProgress }) {
    let stage = 'connecting', preview = {}, usage = null, incompleteUsage = false;
    const level = request.mode === 'solve' ? assistanceLevel(request.level) : null;
    function emit() {
        try { onProgress?.({ stage, preview: { ...preview }, usage }); } catch { /* Progress must not fail a generation. */ }
    }
    return {
        stage(value) { if (STAGES.includes(value)) { stage = value; emit(); } },
        text(raw) {
            const values = completedStrings(raw);
            if (values.status !== 'ok' || values.mode !== request.mode) return;
            const next = safePreview(values, request.mode);
            // Never persist a credential accidentally echoed by an upstream.
            for (const key of Object.keys(next)) if (apiKey && next[key].includes(apiKey)) delete next[key];
            if (level && level !== 'solution') {
                for (const key of Object.keys(next)) if (/```|#include\s*[<"]|\bint\s+main\s*\(/.test(next[key])) delete next[key];
            }
            if (level === 'hint' && next.approach?.length > 6000) delete next.approach;
            if (JSON.stringify(next) !== JSON.stringify(preview)) { preview = next; emit(); }
        },
        usage(value, format) {
            const next = usageDto(value, format);
            if (!next) incompleteUsage = true;
            usage = incompleteUsage ? null : addUsage(usage, next);
            emit();
        },
        get usageValue() { return usage; },
    };
}

module.exports = { STAGES, PREVIEW_KEYS, usageDto, publicUsage, addUsage, completedStrings, safePreview, publicProgress, createProgressReporter };
