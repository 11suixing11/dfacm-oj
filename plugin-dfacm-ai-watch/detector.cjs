'use strict';

const { createHash } = require('node:crypto');

const { submissionTime, sourceTiming, sourceWindow } = require('./time.cjs');
const VERSION = '0.2.0';
const MIN_TOKENS = 80;
const MAX_BYTES = 65536;
const KEYWORDS = new Set(('alignas alignof and asm auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast return short signed sizeof static static_cast struct switch template this throw true try typedef typename union unsigned using virtual void volatile wchar_t while xor abstract assert boolean byte extends final finally implements import instanceof interface native package strictfp super synchronized throws transient var def elif except from global in is lambda None nonlocal pass raise with yield async await del True False as fn let mut impl pub crate use mod trait match loop move self Self where type dyn str function null undefined console print input range len list dict set tuple std cin cout endl vector string include define').split(' '));

function languageFamily(language) {
    const value = String(language || '').toLowerCase();
    if (/(?:^|[._-])(?:cc|cpp|cxx|g\+\+|c\+\+)(?:[._\d-]|$)/.test(value)) return 'cpp';
    if (/^(?:python|py|pypy)/.test(value)) return 'python';
    if (/^(?:javascript|js|node)/.test(value)) return 'javascript';
    if (/^(?:typescript|ts)/.test(value)) return 'typescript';
    if (/^java(?:[._\d-]|$)/.test(value)) return 'java';
    if (/^(?:go|golang)(?:[._\d-]|$)/.test(value)) return 'go';
    if (/^rust(?:[._\d-]|$)/.test(value)) return 'rust';
    if (/^c(?:[._\d-]|$)/.test(value)) return 'c';
    return null;
}

const digest = text => createHash('sha256').update(text).digest('hex');

// A lexical fingerprint, not an AST or a trained authorship classifier. Keep
// operators, numeric values and string contents; erase comments/whitespace.
function lex(code, family) {
    const pattern = family === 'python'
        ? /\s+|#[^\n]*|(?:[rubf]{0,2})?"""[\s\S]*?"""|(?:[rubf]{0,2})?'''[\s\S]*?'''|(?:[rubf]{0,2})?"(?:\\[\s\S]|[^"\\])*"|(?:[rubf]{0,2})?'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_$][\w$]*|(?:0[xX][\da-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)[\w]*|>>=|<<=|\*\*=|\/\/=|==|!=|<=|>=|\*\*|\/\/|:=|->|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[^\s]/g
        : /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?:u8|u|U|L)?R"([^\s()\\]{0,16})\([\s\S]*?\)\1"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|(?:0[xX][\da-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)[\w]*|>>=|<<=|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|->|::|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=>|[^\s]/g;
    const tokens = []; const comments = []; const identifiers = [];
    for (const match of code.matchAll(pattern)) {
        const token = match[0];
        if (/^\s/.test(token)) continue;
        if ((family === 'python' && token[0] === '#') || (family !== 'python' && /^(?:\/\/|\/\*)/.test(token))) { comments.push(token); continue; }
        tokens.push(token);
        if (/^[A-Za-z_$][\w$]*$/.test(token) && !KEYWORDS.has(token)) identifiers.push(token);
    }
    return { tokens, comments, identifiers: [...new Set(identifiers)] };
}

function shapeTokens(tokens) {
    const names = new Map();
    return tokens.map(token => {
        if (!/^[A-Za-z_$][\w$]*$/.test(token) || KEYWORDS.has(token)) return token;
        if (!names.has(token)) names.set(token, `id${names.size}`);
        return names.get(token);
    });
}

function hash32(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
    return value >>> 0;
}

function sketches(tokens) {
    const hashes = [];
    for (let i = 0; i + 7 <= tokens.length; i++) hashes.push(hash32(tokens.slice(i, i + 7).join('\x1f')));
    const selected = new Set();
    for (let i = 0; i < hashes.length; i++) selected.add(Math.min(...hashes.slice(i, i + 5)));
    // Bottom-k keeps storage and pairwise comparisons bounded.
    return [...selected].sort((a, b) => a - b).slice(0, 256);
}

function style(code, parsed) {
    const lines = code.split('\n'); const indented = lines.filter(line => /^\s+\S/.test(line));
    const identifiers = parsed.identifiers;
    return {
        commentRatio: parsed.comments.join('').length / Math.max(1, code.length),
        identifierLength: identifiers.reduce((sum, v) => sum + v.length, 0) / Math.max(1, identifiers.length),
        underscoreRatio: identifiers.filter(v => v.includes('_')).length / Math.max(1, identifiers.length),
        camelRatio: identifiers.filter(v => /[a-z][A-Z]/.test(v)).length / Math.max(1, identifiers.length),
        tabRatio: indented.filter(v => /^\t/.test(v)).length / Math.max(1, indented.length),
    };
}

function fingerprint(code, language) {
    const family = languageFamily(language);
    if (!family) return { unavailable: 'unsupported_language', family: null, tokenCount: 0 };
    if (typeof code !== 'string' || !code.trim()) return { unavailable: 'missing_code', family, tokenCount: 0 };
    if (Buffer.byteLength(code, 'utf8') > MAX_BYTES) return { unavailable: 'oversized_code', family, tokenCount: 0 };
    const normalized = code.replace(/\r\n?/g, '\n'); const parsed = lex(normalized, family);
    const shaped = shapeTokens(parsed.tokens);
    return {
        family, tokenCount: parsed.tokens.length,
        exactHash: digest(JSON.stringify(parsed.tokens)), shapeHash: digest(JSON.stringify(shaped)),
        sketches: sketches(shaped), style: style(normalized, parsed),
        markers: parsed.comments.filter(v => /(?:generated\s+(?:by|with)\s+(?:chatgpt|claude|copilot|gemini|ai)|as an ai language model|由\s*(?:chatgpt|claude|copilot|gemini|ai|人工智能)\s*(?:生成|编写)|作为(?:一个|一名)?\s*(?:ai|人工智能)(?:语言模型)?)/i.test(v)).map(v => v.slice(0, 300)).slice(0, 3),
    };
}

function similarity(left, right) {
    if (!left || !right || left.unavailable || right.unavailable || left.family !== right.family) return 0;
    if (left.exactHash === right.exactHash || left.shapeHash === right.shapeHash) return 1;
    if (!left.sketches?.length || !right.sketches?.length) return 0;
    const a = new Set(left.sketches); const b = new Set(right.sketches);
    let intersection = 0; for (const value of a) if (b.has(value)) intersection++;
    return intersection / Math.max(1, a.size + b.size - intersection);
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
    return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0;
}

function styleChanges(current, history) {
    const usable = history.filter(item => !item.unavailable && item.family === current.family && item.tokenCount >= MIN_TOKENS);
    if (usable.length < 5 || !current.style) return [];
    const floors = { commentRatio: 0.10, identifierLength: 2.5, underscoreRatio: 0.25, camelRatio: 0.25, tabRatio: 0.5 };
    const labels = { commentRatio: '注释比例', identifierLength: '变量命名长度', underscoreRatio: '下划线命名比例', camelRatio: '驼峰命名比例', tabRatio: '制表符缩进比例' };
    return Object.keys(floors).flatMap(key => {
        const baseline = median(usable.map(v => v.style?.[key] || 0));
        const mad = median(usable.map(v => Math.abs((v.style?.[key] || 0) - baseline)));
        return Math.abs(current.style[key] - baseline) >= Math.max(floors[key], 4 * mad)
            ? [{ feature: key, label: labels[key], baseline: Number(baseline.toFixed(3)), current: Number(current.style[key].toFixed(3)) }] : [];
    });
}

function assistantSignal(reference, metrics, timing) {
    const uncertain = timing !== 'earlier';
    return { kind: 'assistant_match', title: uncertain ? '匹配本人同秒获取的站内 AI 代码（先后未知）' : '匹配本人先前获取的站内 AI 代码',
        strength: uncertain ? 'context' : 'traceable', weight: uncertain ? 0 : metrics.exact ? 90 : 80,
        detail: uncertain ? '代码与本站题目助手返回的完整题解高度相似；生成时间落在提交时间区间内，无法确定两者先后。'
            : metrics.exact ? '去除注释和空白后，代码与本站题目助手先前返回的完整题解完全一致。' : '代码与本站题目助手先前返回的完整题解高度相似。',
        reference: { ...reference, timing }, metrics,
        caveat: uncertain ? '同秒来源只作为相似度上下文，不计分，也不能证明提交前使用了 AI；需结合比赛规则与选手解释人工核实。'
            : '这能关联到站内 AI 输出，不能单独证明违反比赛规则；短模板、参考解法和允许的辅助需核实。' };
}

function analyze({ current, sources = [], peers = [], history = [] }) {
    const fp = current.fingerprint || fingerprint(current.code, current.lang);
    const signals = []; const limitations = [];
    const at = new Date(current.submittedAt).getTime();
    const time = submissionTime(current); const window = sourceWindow(time);
    const validSource = sources.filter(source => source.domainId === current.domainId && source.uid === current.uid && source.pid === current.pid
        && ['earlier', 'uncertain'].includes(sourceTiming(source.completedAt, time))
        && new Date(source.completedAt).getTime() >= window.$gte.getTime() && source.mode === 'solve');
    const validPeers = peers.filter(peer => peer.domainId === current.domainId && peer.uid !== current.uid && peer.pid === current.pid
        && (peer.contest || null) === (current.contest || null) && new Date(peer.submittedAt).getTime() <= at && peer.rid !== current.rid);
    const validHistory = history.filter(item => item.domainId === current.domainId && item.uid === current.uid && item.pid !== current.pid
        && new Date(item.submittedAt).getTime() < at && item.fingerprint?.family === fp.family);
    const coverage = { tokenCount: fp.tokenCount || 0, historyCount: validHistory.length, peerCount: validPeers.length, sourceCount: validSource.length };
    if (fp.unavailable || fp.tokenCount < MIN_TOKENS) {
        const reasons = { missing_code: '没有可读取的源码，可能是文件或答案提交。', unsupported_language: '该语言暂未支持词法分析。', oversized_code: '源码超过 64 KiB 的分析上限。' };
        return { version: VERSION, conclusion: 'undetermined', priority: 'insufficient', score: 0, signals, coverage,
            limitations: [reasons[fp.unavailable] || '程序较短，常见模板容易相同，暂不进行来源或相似度判断。', '缺少线索不能证明由选手独立完成。'] };
    }
    const rankedSources = validSource.map(source => ({ source, value: similarity(fp, source.fingerprint) })).sort((a, b) => b.value - a.value);
    // A temporally certain qualifying source keeps the existing priority gate,
    // even if a same-second source has a slightly higher similarity.
    const match = rankedSources.find(item => item.value >= 0.92 && sourceTiming(item.source.completedAt, time) === 'earlier') || rankedSources[0];
    if (match?.value >= 0.92 && Math.min(fp.tokenCount, match.source.fingerprint.tokenCount) >= MIN_TOKENS) {
        const exact = fp.exactHash === match.source.fingerprint.exactHash;
        signals.push(assistantSignal({ sourceId: match.source._id, jobId: match.source.jobId, completedAt: match.source.completedAt },
            { similarity: Number(match.value.toFixed(4)), exact }, sourceTiming(match.source.completedAt, time)));
    }
    const rankedPeers = validPeers.filter(peer => (peer.fingerprint?.tokenCount || 0) >= 140 && fp.tokenCount >= 140)
        .map(peer => ({ peer, value: similarity(fp, peer.fingerprint) })).sort((a, b) => b.value - a.value);
    const peerMatch = rankedPeers[0];
    if (peerMatch?.value >= 0.90) {
        signals.push({ kind: 'peer_similarity', title: '与同场其他选手的代码高度相似', strength: 'context', weight: 45,
            detail: '同域、同题、同一比赛内，代码结构与另一选手的先前提交高度相似。',
            reference: { rid: peerMatch.peer.rid, uid: peerMatch.peer.uid }, metrics: { similarity: Number(peerMatch.value.toFixed(4)) },
            caveat: '相似代码可能来自公共模板、共同解法或相互复制；这一线索无法区分 AI 作答。' });
    }
    if (fp.markers?.length) signals.push({ kind: 'ai_marker', title: '注释中出现 AI 生成声明', strength: 'weak', weight: 20,
        detail: fp.markers.join('\n'), caveat: '声明可以被复制、伪造或作为玩笑，不能确认代码作者。' });
    const changes = styleChanges(fp, validHistory.map(item => item.fingerprint));
    if (changes.length >= 3) signals.push({ kind: 'style_change', title: '与本人历史代码风格有多项差异', strength: 'weak', weight: 15,
        detail: `与 ${validHistory.length} 份同语言、不同题目的先前提交相比，${changes.map(v => v.label).join('、')}变化明显。`,
        metrics: { changes }, caveat: '换模板、练习新语言习惯或题型变化都可能产生差异，不能由此判定 AI 作答。' });
    if (validHistory.length < 5) limitations.push('本人同语言、不同题目的历史样本少于 5 份，未进行风格异常判断。');
    if (validSource.some(source => sourceTiming(source.completedAt, time) === 'uncertain')) limitations.push('提交创建时间仅精确到秒；同秒来源只保留相似度上下文，不计分，也不证明提交前使用了 AI。');
    if (!validSource.length) limitations.push('未找到本人同题、提交之前的站内完整 AI 题解记录；站外 AI 使用无法追溯。');
    limitations.push('词法相似度会受公共模板和标准解法影响；分数是复核排序规则，不是 AI 作答概率。', '所有结论需结合比赛规则和选手解释，由人工复核。');
    const hasTrace = signals.some(v => v.kind === 'assistant_match' && v.reference.timing === 'earlier');
    const score = Math.min(hasTrace ? 100 : 65, signals.reduce((sum, signal) => sum + signal.weight, 0));
    return { version: VERSION, conclusion: 'undetermined', priority: score >= 75 ? 'high' : score >= 35 ? 'medium' : 'low', score, signals, limitations, coverage };
}

module.exports = { VERSION, MIN_TOKENS, MAX_BYTES, languageFamily, lex, fingerprint, similarity, styleChanges, assistantSignal, analyze };
