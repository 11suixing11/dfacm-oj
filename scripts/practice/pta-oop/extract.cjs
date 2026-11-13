'use strict';

const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('Usage: node extract.cjs <page.html> <directory>');
const html = fs.readFileSync(input, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const bankScript = scripts.find(match => /id="question-bank"/.test(match[1]));
if (!bankScript) throw new Error('Question bank is missing');
const bank = JSON.parse(bankScript[2]);
const coreScript = scripts.find(match => match[2].includes('root.PtaPracticeCore'));
const appScript = scripts.find(match => match[2].includes('const bank = JSON.parse'));
if (!coreScript || !appScript) throw new Error('Practice scripts are missing');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'bank.json'), JSON.stringify(bank, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'core.cjs'), coreScript[2].trim() + '\n');
fs.writeFileSync(path.join(output, 'app.js'), appScript[2].trim() + '\n');
let template = html.replace(bankScript[0], '<script type="application/json" id="question-bank">{{QUESTION_BANK}}</script>')
  .replace(coreScript[0], '<script>{{PRACTICE_CORE}}</script>')
  .replace(appScript[0], '<script>{{PRACTICE_APP}}</script>');
fs.writeFileSync(path.join(output, 'template.html'), template);
console.log(JSON.stringify({ version: bank.version, bankKeys: Object.keys(bank), questionCount: bank.questions.length,
  typeCounts: bank.typeCounts, questionKeys: Object.keys(bank.questions[0]),
  scripts: scripts.map(match => ({ attributes: match[1], length: match[2].length })) }, null, 2));
for (const type of Object.keys(bank.typeCounts)) {
  const q = bank.questions.find(item => item.type === type);
  console.log(JSON.stringify({ id: q.id, label: q.label, type: q.type, title: q.title, stem: q.stemText?.slice(0, 600),
    options: q.options, reference: q.reference, judge: q.judge }, null, 2));
}
