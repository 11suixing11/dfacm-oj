'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLines, problemDto, submissionDto, compilerText, validateAnswer, MAX_CODE_BYTES, VERIFICATION } = require('../protocol.cjs');
const { request, answer } = require('./fixtures.cjs');

test('source lines preserve blank lines, comments and indentation across CRLF/CR', () => {
    assert.deepEqual(sourceLines('\r\n// 注释\r  int x;\r\n'), [
        { line: 1, text: '' }, { line: 2, text: '// 注释' }, { line: 3, text: '  int x;' }, { line: 4, text: '' },
    ]);
});

test('complete solution contract is accepted with application-owned verification', () => {
    const raw = answer(); raw.verification = '所有隐藏测试均通过';
    const result = validateAnswer(JSON.stringify(raw), request());
    assert.equal(result.verification, VERIFICATION);
    assert.equal(result.code, raw.code);
    for (const field of ['meaning', 'approach', 'code', 'complexity', 'commentary']) {
        const invalid = answer(); invalid[field] = '';
        assert.throws(() => validateAnswer(invalid, request()), { code: 'INVALID_RESPONSE' });
    }
});

test('diagnostic references are checked against original source rather than repaired code', () => {
    const input = request('debug'); input.submission.code = input.submission.code.replace(/\n/g, '\r\n');
    const result = validateAnswer(answer('debug'), input);
    assert.equal(result.issues[0].locations[0].startLine, 6);
    assert.equal(result.issues[0].locations[1].quote, '        sum += x;');
    const wrongLine = answer('debug'); wrongLine.issues[0].locations[0].startLine = 7; wrongLine.issues[0].locations[0].endLine = 7;
    assert.throws(() => validateAnswer(wrongLine, input), { code: 'INVALID_LOCATION' });
    const wrongQuote = answer('debug'); wrongQuote.issues[0].locations[0].quote = 'int sum = 0;';
    assert.throws(() => validateAnswer(wrongQuote, input), { code: 'INVALID_LOCATION' });
    const outside = answer('debug'); outside.issues[0].locations[0].startLine = 100; outside.issues[0].locations[0].endLine = 100;
    assert.throws(() => validateAnswer(outside, input), { code: 'INVALID_RESPONSE' });
});

test('algorithm-wide issue can omit line locations; a correct-looking submission may have no issue', () => {
    const raw = answer('debug'); raw.issues[0].kind = 'algorithm'; raw.issues[0].locations = [];
    assert.deepEqual(validateAnswer(raw, request('debug')).issues[0].locations, []);
    raw.issues = []; raw.code = ''; raw.counterexamples = []; raw.changes = [];
    raw.summary = '当前代码未发现可证错因，请提供失败输入以继续定位。';
    assert.equal(validateAnswer(raw, request('debug')).issues.length, 0);
});

test('missing context and unsupported results cannot smuggle complete code', () => {
    const raw = answer(); raw.status = 'needs_context'; raw.message = '缺少输入输出格式'; raw.missing = ['输入输出格式']; raw.code = '';
    assert.equal(validateAnswer(raw, request()).status, 'needs_context');
    raw.code = 'int main(){}';
    assert.throws(() => validateAnswer(raw, request()), { code: 'INVALID_RESPONSE' });
    raw.code = ''; raw.missing = [];
    assert.throws(() => validateAnswer(raw, request()), { code: 'INVALID_RESPONSE' });
});

test('Hydro language maps and limits become visible problem data without private tests', () => {
    const pdoc = { pid: 'P1', content: JSON.stringify({ zh: '中文题面', en: 'English' }), html: false,
        config: { type: 'default', timeMax: 1000, memoryMax: 256, answers: { hidden: 'secret' } } };
    assert.deepEqual(problemDto(pdoc, 'en'), { id: 'P1', title: '', statement: 'English', statementFormat: 'markdown', type: 'default', limits: { timeMs: 1000, memoryMb: 256 } });
    assert.equal(problemDto({ content: 'abc', config: { timeMax: Infinity, memoryMax: 0 } }).limits.timeMs, null);
    assert.throws(() => problemDto({ content: '' }), { code: 'NO_STATEMENT' });
});

test('C++ variants are accepted and oversized source is rejected without truncation', () => {
    for (const lang of ['cc', 'cc.cc17o2', 'cpp', 'cpp17', 'cpp.gcc', 'cxx', 'g++', 'C++17', 'ybtbas.cpp']) {
        assert.equal(submissionDto({ code: 'int main(){}', language: lang }).language, lang);
    }
    assert.throws(() => submissionDto({ code: 'x', language: 'python' }), { code: 'LANGUAGE_UNSUPPORTED' });
    assert.throws(() => submissionDto({ code: 'x'.repeat(MAX_CODE_BYTES + 1) }), { code: 'INPUT_TOO_LARGE' });
    assert.throws(() => submissionDto({ code: 'x', verdict: 'AC' }), { code: 'INVALID_VERDICT' });
});

test('compiler text keeps actual diagnostics and substitutes Hydro parameters', () => {
    assert.equal(compilerText(['main.cpp:4: error', { message: 'line {0}: {1}', params: [5, 'expected ;'] }]), 'main.cpp:4: error\nline 5: expected ;');
});
