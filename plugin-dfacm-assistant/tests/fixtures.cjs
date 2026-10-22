'use strict';

const STATEMENT = '给定 n 个整数，求总和。1≤n≤100000，-1000000000≤a_i≤1000000000，单组数据。\n输入：第一行 n，第二行 n 个整数。输出：总和。\n样例输入：\n3\n1000000000 1000000000 1000000000\n样例输出：\n3000000000';
const SOURCE = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main() {',
    '    int n;',
    '    int sum = 0;',
    '    cin >> n;',
    '    for (int i = 0; i < n; i++) {',
    '        int x; cin >> x;',
    '        sum += x;',
    '    }',
    '    cout << sum << "\\n";',
    '    return 0;',
    '}',
].join('\n');
const CODE = '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    cin >> n;\n    long long sum = 0;\n    for (int i = 0; i < n; i++) {\n        int x;\n        cin >> x;\n        sum += x;\n    }\n    cout << sum << "\\n";\n    return 0;\n}\n';

function request(mode = 'solve', level) {
    return {
        source: 'oj', mode, ...(mode === 'solve' && level ? { level } : {}),
        problem: { id: 'P1001', title: '整数求和', statement: STATEMENT, statementFormat: 'markdown', type: 'default', limits: { timeMs: 1000, memoryMb: 256 } },
        submission: mode === 'solve' ? null : { code: SOURCE, language: 'cpp', verdict: 'WA', compilerOutput: '' },
    };
}

function answer(mode = 'solve', level = 'solution') {
    const value = {
        version: 1, status: 'ok', mode, message: '', missing: [],
        summary: mode === 'debug' ? '这是 WA。可确定的实现问题是 int 累加器无法容纳数据范围内的总和，属于类型溢出风险。' : '',
        meaning: '给定 n 个整数，输出它们的总和。n≤100000，元素绝对值≤10⁹，单组数据。',
        approach: '边读边累加即可。\n\n1. 用 long long 保存累计和。\n2. 读取每个整数并加到累计和。\n3. 输出累计和。\n\n循环读取前 i 个数后，sum 恰好等于这 i 个数的和，因此全部读完后得到答案。',
        code: CODE,
        complexity: '时间 O(n)：最多 10⁵ 次读入与加法。辅助空间 O(1)，无需保存数组。',
        commentary: '本题考查基础遍历与整数范围判断。总和绝对值最多 10¹⁴，须用 long long。注意负数极值，单个输入数可用 int。',
        issues: mode === 'debug' ? [{
            kind: 'implementation', confidence: 'confirmed', title: '累计和超过 int 的表示范围',
            locations: [{ startLine: 6, endLine: 6, quote: '    int sum = 0;' }, { startLine: 10, endLine: 10, quote: '        sum += x;' }],
            explanation: 'n×max|a_i| 可达到 10¹⁴，而 32 位 int 最大约 2.1×10⁹。第 6 行声明的 sum 在第 10 行累加时可能发生有符号溢出。',
            fix: '将 sum 改为 long long；单个 a_i 在 int 范围内，可继续用 int 读取。',
            evidence: '依据题面数据范围可以确定类型缺陷。尚未提供这次提交的官方失败输入。',
        }] : [],
        counterexamples: mode === 'debug' ? [{
            input: '3\n1000000000 1000000000 1000000000\n', expected: '3000000000\n', actual: null,
            explanation: '构造反例：数学和为 3×10⁹，已超过 int 范围。未运行原代码；有符号溢出是未定义行为，不能断言具体错误输出。',
        }] : [],
        changes: mode === 'debug' ? ['将累加器从 int 改为 long long，保留边读边累加的算法。'] : [],
        verification: '静态分析，未运行。', notice: '代码为参考实现，提交前请自行验证样例与边界。',
    };
    if (mode === 'solve' && level !== 'solution') value.code = '';
    if (mode === 'solve' && level === 'hint') {
        value.approach = '先估算所有整数之和的最大绝对值，再检查你准备使用的类型能否容纳它。\n需要把所有数存下来吗，还是可以在读入时维护一个量？';
        value.complexity = value.commentary = '';
    }
    return value;
}

const CE_SOURCE = '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long sum = 0\n    cout << sum << "\\n";\n}\n';
const CE_LOG = "main.cpp:6:5: error: expected ',' or ';' before 'cout'";
function ceRequest(origin = 'manual') {
    const value = request('debug');
    value.submission = { code: CE_SOURCE, language: 'cpp', verdict: 'CE', compilerOutput: CE_LOG, origin };
    return value;
}
function ceAnswer() {
    const value = answer('debug');
    value.summary = '这是 CE。第 5 行变量声明缺少分号，编译器在下一行 cout 处报告错误。';
    value.issues = [{ kind: 'syntax', confidence: 'confirmed', title: '变量声明末尾缺少分号',
        locations: [{ startLine: 5, endLine: 5, quote: '    long long sum = 0' }],
        explanation: '变量声明缺少分号会使下一行无法正常解析。', fix: '在第 5 行末尾补上分号。',
        evidence: CE_LOG + '。日志报告在第 6 行，根因在上一行声明。' }];
    value.counterexamples = []; value.changes = ['在声明末尾补上分号。'];
    value.code = CE_SOURCE.replace('sum = 0\n', 'sum = 0;\n');
    value.complexity = value.commentary = '';
    return value;
}

module.exports = { STATEMENT, SOURCE, CODE, CE_SOURCE, CE_LOG, request, answer, ceRequest, ceAnswer };
