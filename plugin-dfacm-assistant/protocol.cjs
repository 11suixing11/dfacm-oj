'use strict';

const MAX_STATEMENT_BYTES = 80000;
const MAX_CODE_BYTES = 50000;
const MAX_COMPILER_BYTES = 16000;
const NOTICE = '代码为参考实现，提交前请自行验证样例与边界。';
const VERIFICATION = '本次为静态分析与手工推演，未在 OJ 运行或提交。';
const VERDICTS = Object.freeze({ 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE', 7: 'CE' });
const LEVELS = Object.freeze(['hint', 'approach', 'solution']);

class AssistantError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'AssistantError';
        this.code = code;
        this.status = status;
    }
}

function assistanceLevel(value) {
    if (value === undefined || value === null || value === '') return 'solution';
    if (!LEVELS.includes(value)) throw new AssistantError('INVALID_LEVEL', '请选择提示、思路或完整题解。');
    return value;
}
function normalizeLines(code) { return code.replace(/\r\n?/g, '\n'); }

function sourceLines(code) {
    return normalizeLines(code).split('\n').map((text, index) => ({ line: index + 1, text }));
}

function boundedText(value, maxBytes, name) {
    if (typeof value !== 'string') throw new AssistantError('INVALID_INPUT', `${name}需要是文本。`);
    if (Buffer.byteLength(value, 'utf8') > maxBytes) {
        throw new AssistantError('INPUT_TOO_LARGE', `${name}过长，请精简后重试。`, 413);
    }
    return value;
}

function statementText(content, language = 'zh') {
    if (typeof content !== 'string') return '';
    // Hydro supports a JSON map of language -> statement as well as plain text.
    try {
        const map = JSON.parse(content);
        if (map && !Array.isArray(map) && typeof map === 'object') {
            const keys = Object.keys(map);
            if (keys.length && keys.every((key) => /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(key)
                && typeof map[key] === 'string')) {
                return map[language] || map.zh || map.zh_CN || map['zh-CN'] || map.en || map[keys[0]];
            }
        }
    } catch { /* Plain Markdown or HTML is the usual case. */ }
    return content;
}

function positiveLimit(value) { return Number.isFinite(value) && value > 0 ? value : null; }

function problemDto(pdoc, language = 'zh') {
    const statement = boundedText(statementText(pdoc.content, language), MAX_STATEMENT_BYTES, '题面');
    if (!statement.trim()) throw new AssistantError('NO_STATEMENT', '这道题暂时没有可读取的文字题面。');
    const config = pdoc.config && typeof pdoc.config === 'object' ? pdoc.config : {};
    return {
        id: String(pdoc.pid || pdoc.docId),
        title: String(pdoc.title || ''),
        statement,
        statementFormat: pdoc.html ? 'html' : 'markdown',
        type: String(config.type || 'default'),
        limits: { timeMs: positiveLimit(config.timeMax), memoryMb: positiveLimit(config.memoryMax) },
    };
}

function cppLanguage(language) {
    return typeof language === 'string' && /(?:^|[._-])(?:cc|cpp|cxx|g\+\+|c\+\+)(?:[._\d-]|$)/i.test(language);
}

function compilerText(texts) {
    if (!texts) return '';
    const list = Array.isArray(texts) ? texts : [texts];
    const text = list.map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        if (typeof item.message !== 'string') return '';
        return item.message.replace(/\{(\d+)\}/g, (match, i) => String(item.params?.[i] ?? match));
    }).join('\n');
    if (Buffer.byteLength(text, 'utf8') <= MAX_COMPILER_BYTES) return text;
    // Keep a UTF-8 boundary; only compiler logs, never the source, are shortened.
    let clipped = text.slice(0, MAX_COMPILER_BYTES);
    while (Buffer.byteLength(clipped, 'utf8') > MAX_COMPILER_BYTES) clipped = clipped.slice(0, -1);
    return clipped + '\n（编译信息过长，仅保留开头部分。）';
}

function submissionDto({ code, language = 'cpp', verdict = 'UNKNOWN', compilerOutput = '', origin = 'manual' }) {
    boundedText(code, MAX_CODE_BYTES, '代码');
    if (!code.trim()) throw new AssistantError('NO_CODE', '没有找到未通过的提交，请粘贴你的代码。');
    if (!cppLanguage(language)) throw new AssistantError('LANGUAGE_UNSUPPORTED', '目前支持 C++ 代码诊断。');
    if (!['WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'UNKNOWN'].includes(verdict)) {
        throw new AssistantError('INVALID_VERDICT', '请选择实际的评测结果。');
    }
    return { code, language, verdict, compilerOutput: compilerText(compilerOutput), sourceLines: sourceLines(code),
        origin: origin === 'record' ? 'record' : 'manual' };
}

function parseJson(text) {
    if (typeof text !== 'string') throw new AssistantError('INVALID_RESPONSE', '模型没有返回完整答案，请重试。', 502);
    let raw = text.trim();
    const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(raw);
    if (fence) raw = fence[1];
    try { return JSON.parse(raw); }
    catch { throw new AssistantError('INVALID_RESPONSE', '模型返回的答案格式不完整，请重试。', 502); }
}

function badResponse() { throw new AssistantError('INVALID_RESPONSE', '模型返回的答案结构不完整，请重试。', 502); }

function responseText(value, max = 50000) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > max) badResponse();
    return value;
}

function textArray(value, count = 30) {
    if (!Array.isArray(value) || value.length > count) badResponse();
    return value.map((item) => responseText(item, 10000));
}

function validateAnswer(raw, request) {
    const value = typeof raw === 'string' ? parseJson(raw) : raw;
    if (!value || Array.isArray(value) || value.version !== 1 || value.mode !== request.mode
        || !['ok', 'needs_context', 'unsupported'].includes(value.status)) badResponse();
    const answer = { version: 1, status: value.status, mode: value.mode };
    if (answer.mode === 'solve') answer.level = assistanceLevel(request.level);
    for (const key of ['message', 'meaning', 'approach', 'code', 'complexity', 'commentary', 'summary']) {
        answer[key] = responseText(value[key]);
    }
    answer.missing = textArray(value.missing);
    answer.changes = textArray(value.changes);
    if (!Array.isArray(value.issues) || value.issues.length > 30) badResponse();
    const lines = request.submission ? sourceLines(request.submission.code) : [];
    answer.issues = value.issues.map((issue) => {
        if (!issue || !['syntax', 'implementation', 'algorithm', 'complexity'].includes(issue.kind)
            || !['confirmed', 'possible'].includes(issue.confidence)
            || !Array.isArray(issue.locations) || issue.locations.length > 10) badResponse();
        return {
            kind: issue.kind,
            confidence: issue.confidence,
            title: responseText(issue.title, 1000),
            explanation: responseText(issue.explanation, 10000),
            fix: responseText(issue.fix, 10000),
            evidence: responseText(issue.evidence, 10000),
            locations: issue.locations.map((location) => {
                if (!location || !Number.isSafeInteger(location.startLine) || !Number.isSafeInteger(location.endLine)
                    || location.startLine < 1 || location.endLine < location.startLine
                    || location.endLine > lines.length || typeof location.quote !== 'string') badResponse();
                const quote = lines.slice(location.startLine - 1, location.endLine).map((line) => line.text).join('\n');
                if (normalizeLines(location.quote) !== quote) {
                    throw new AssistantError('INVALID_LOCATION', '诊断中的行号与原代码不一致，请重试。', 502);
                }
                return { startLine: location.startLine, endLine: location.endLine, quote };
            }),
        };
    });
    if (!Array.isArray(value.counterexamples) || value.counterexamples.length > 6) badResponse();
    answer.counterexamples = value.counterexamples.map((example) => {
        if (!example || (example.actual !== null && typeof example.actual !== 'string')) badResponse();
        return {
            input: responseText(example.input, 16000),
            expected: responseText(example.expected, 16000),
            actual: example.actual === null ? null : responseText(example.actual, 16000),
            explanation: responseText(example.explanation, 10000),
        };
    });
    if (answer.status === 'ok') {
        if (answer.code && (answer.code.includes('```') || !answer.code.includes('\n'))) badResponse();
        if (answer.mode === 'solve') {
            const required = answer.level === 'solution' ? ['meaning', 'approach', 'code', 'complexity', 'commentary'] : ['meaning', 'approach'];
            if (required.some(key => !answer[key].trim())) badResponse();
            if (answer.level !== 'solution' && answer.code.trim()) badResponse();
            if (answer.level !== 'solution' && [answer.meaning, answer.approach, answer.complexity, answer.commentary]
                .some(text => /```|#include\s*[<"]|\bint\s+main\s*\(/.test(text))) badResponse();
            if (answer.level === 'hint' && answer.approach.length > 6000) badResponse();
            if (answer.level === 'hint' && (answer.complexity.trim() || answer.commentary.trim())) badResponse();
        }
        if (answer.mode === 'solve' && (answer.issues.length || answer.counterexamples.length)) badResponse();
        if (answer.mode === 'debug' && !answer.summary.trim()) badResponse();
        if (answer.mode === 'debug' && answer.issues.length && !answer.code.trim()) badResponse();
        if (answer.mode === 'debug' && request.submission?.verdict === 'CE' && answer.counterexamples.length) badResponse();
    } else {
        if (!answer.message.trim() || answer.code.trim() || answer.issues.length) badResponse();
        if (answer.status === 'needs_context' && !answer.missing.length) badResponse();
    }
    // This API exposes template reading, not a compiler or judge. Verification
    // status is supplied by the application instead of trusting model claims.
    answer.verification = VERIFICATION;
    answer.notice = answer.code ? NOTICE : '';
    return answer;
}

module.exports = {
    AssistantError, MAX_STATEMENT_BYTES, MAX_CODE_BYTES, MAX_COMPILER_BYTES, VERDICTS, LEVELS, NOTICE, VERIFICATION, assistanceLevel,
    normalizeLines, sourceLines, problemDto, cppLanguage, compilerText, submissionDto, parseJson, validateAnswer,
};
