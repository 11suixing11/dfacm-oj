'use strict';

const fs = require('node:fs');
const path = require('node:path');
const bank = require('./source/bank.json');
const output = path.resolve(process.argv[2] || 'qa/pta-oop-2026-11-08/metadata-before');
fs.mkdirSync(output, { recursive: true });
const questions = bank.questions.filter(q => q.judge);
let next = 0;
const report = [];
async function worker() {
  while (next < questions.length) {
    const q = questions[next++];
    const file = path.join(output, q.label + '.json');
    let body;
    try {
      if (fs.existsSync(file)) body = JSON.parse(fs.readFileSync(file, 'utf8'));
      else {
        const response = await fetch('https://dfacm.website/p/' + q.judge.pid, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        body = await response.json();
        if (!body.pdoc) throw new Error('Problem document is missing');
        fs.writeFileSync(file, JSON.stringify(body, null, 2));
      }
      const p = body.pdoc;
      const files = p.data || [];
      const inputs = files.filter(f => /\.in$/.test(f.name));
      const outputs = files.filter(f => /\.out$/.test(f.name));
      report.push({ label: q.label, pid: p.pid, docId: p.docId, mapping: p.pid === q.judge.pid && p.docId === q.judge.docId,
        files: files.map(f => ({ name: f.name, size: f.size })), inputCount: inputs.length, outputCount: outputs.length,
        caseCount: q.judge.caseCount, config: p.config, stats: p.stats,
        unmatched: inputs.filter(f => !outputs.some(o => o.name === f.name.replace(/\.in$/, '.out'))).map(f => f.name) });
    } catch (error) {
      report.push({ label: q.label, error: error.message });
    }
  }
}
Promise.all([worker(), worker()]).then(() => {
  report.sort((a, b) => questions.findIndex(q => q.label === a.label) - questions.findIndex(q => q.label === b.label));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ total: report.length, errors: report.filter(r => r.error), mappingErrors: report.filter(r => !r.error && !r.mapping),
    caseErrors: report.filter(r => !r.error && (r.unmatched.length || r.inputCount !== r.outputCount || r.inputCount !== r.caseCount)),
    failureStats: report.filter(r => r.stats && ['WA', 'TLE', 'MLE', 'RE', 'CE', 'SE', 'IGN'].some(k => r.stats[k])) }, null, 2));
});
