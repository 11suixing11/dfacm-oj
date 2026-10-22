'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateAnswer } = require('../protocol.cjs');

function preserve(file, text) {
    if (fs.existsSync(file)) {
        if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Preserve existing evidence: ' + file);
    } else fs.writeFileSync(file, text, { flag: 'wx' });
}

function samplesFor(key) {
    if (key === 'O4') return [
        ['duplicate counterexample', '3\n1 1 1\n', '1'],
        ['statement sample', '5\n1 3 2 4 3\n', '3'],
        ['descending', '5\n5 4 3 2 1\n', '1'],
    ];
    if (key === 'G1') return [
        ['greedy counterexample', '3 6\n1 3 4\n', '2'],
        ['statement sample', '3 5\n1 3 4\n', '2'],
        ['single denomination', '1 10000\n1\n', '10000'],
        ['mixed denominations', '4 11\n1 3 4 5\n', '3'],
    ];
    return [
        ['large positive sample', '3\n1000000000 1000000000 1000000000\n', '3000000000'],
        ['negative boundary', '1\n-1000000000\n', '-1000000000'],
        ['negative total', '100000\n' + '-1000000000 '.repeat(100000) + '\n', '-100000000000000'],
    ];
}

function review(root, outputName = 'oj-contract-review.json') {
    const result = { source: 'CodeArts CLI behavioral check; not AgentRouter end-to-end', cases: [] };
    for (const key of ['O1', 'O2', 'O3', 'O4', 'O5', 'G1', 'G2']) {
        const folder = path.join(root, key);
        const file = path.join(folder, 'output.md');
        if (!fs.existsSync(file)) {
            const generation = path.join(folder, 'result.json');
            if (fs.existsSync(generation)) result.cases.push({ key, generationStatus: JSON.parse(fs.readFileSync(generation, 'utf8')).generation_status, noAnswer: true, humanAcceptance: false });
            continue;
        }
        const text = fs.readFileSync(file, 'utf8');
        const input = JSON.parse(fs.readFileSync(path.join(folder, 'prompt.md'), 'utf8'));
        const strict = { ok: false, reason: '' };
        let normalized;
        try { normalized = validateAnswer(text, input); strict.ok = true; }
        catch (error) { strict.reason = error.code || error.message; }
        // Record tolerant extraction separately: it does not retroactively make
        // a raw API contract failure pass. Markdown fences may occur in fields.
        const fenceStart = text.indexOf('```json');
        const fenceEnd = text.lastIndexOf('```');
        if (!normalized && fenceStart >= 0 && fenceEnd > fenceStart) {
            try { normalized = validateAnswer(text.slice(fenceStart + 7, fenceEnd).trim(), input); }
            catch { /* Raw evidence stays unchanged. */ }
        }
        const events = fs.readFileSync(path.join(folder, 'stdout.jsonl'), 'utf8').split(/\r?\n/).flatMap((line) => {
            try { const event = JSON.parse(line); return event.type === 'tool_use' ? [event.part] : []; }
            catch { return []; }
        });
        const shellCommands = events.filter((part) => part.tool === 'bash').map((part) => part.state?.input?.command || '');
        const mutations = events.filter((part) => ['write', 'edit', 'apply_patch'].includes(part.tool)).map((part) => part.tool);
        const record = { key, rawContract: strict, normalizedContract: !!normalized,
            generationStatus: JSON.parse(fs.readFileSync(path.join(folder, 'result.json'), 'utf8')).generation_status,
            issueCount: normalized?.issues.length ?? null,
            correctedOutputLines: normalized?.code.split('\n').filter((line) => /cout|printf/.test(line)) || [],
            lineReferencesValidated: normalized?.mode === 'debug' ? normalized.issues.flatMap((issue) => issue.locations.map((l) => [l.startLine, l.endLine])) : [],
            shellCommands, mutations, compiled: false, samples: [], humanAcceptance: false };
        if (normalized) {
            preserve(path.join(folder, 'normalized-answer.json'), JSON.stringify(normalized, null, 2) + '\n');
            if (normalized.code) {
                const validation = path.join(folder, 'code-validation');
                fs.mkdirSync(validation, { recursive: true });
                const cpp = path.join(validation, 'solution.cpp');
                const exe = path.join(validation, process.platform === 'win32' ? 'solution.exe' : 'solution');
                preserve(cpp, normalized.code);
                const compiled = spawnSync('g++', ['-std=c++17', '-O2', cpp, '-o', exe], { encoding: 'utf8', timeout: 30000 });
                record.compiled = compiled.status === 0;
                preserve(path.join(validation, 'compiler.log'), compiled.stderr || '');
                if (record.compiled) {
                    for (const [label, input, expected] of samplesFor(key)) {
                        const run = spawnSync(exe, { input, encoding: 'utf8', timeout: 5000 });
                        record.samples.push({ label, passed: run.status === 0 && run.stdout.trim() === expected, output: run.stdout.trim(), expected });
                    }
                }
            }
        }
        result.cases.push(record);
    }
    preserve(path.join(root, outputName), JSON.stringify(result, null, 2) + '\n');
    return result;
}

if (require.main === module) console.log(JSON.stringify(review(path.resolve(process.argv[2]), process.argv[3]), null, 2));
module.exports = { review };
