'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.join(__dirname, 'source');
const output = path.resolve(process.argv[2] || path.join(__dirname, 'dist', 'index.html'));
const bank = JSON.parse(fs.readFileSync(path.join(source, 'bank.json'), 'utf8'));
const inlineJson = JSON.stringify(bank).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const values = { QUESTION_BANK: inlineJson, PRACTICE_CORE: fs.readFileSync(path.join(source, 'core.cjs'), 'utf8'),
  PRACTICE_APP: fs.readFileSync(path.join(source, 'app.js'), 'utf8') };
const template = fs.readFileSync(path.join(source, 'template.html'), 'utf8');
const html = template.replace(/\{\{(QUESTION_BANK|PRACTICE_CORE|PRACTICE_APP)\}\}/g, (_, name) => values[name]);
if (/\{\{(?:QUESTION_BANK|PRACTICE_CORE|PRACTICE_APP)\}\}/.test(html)) throw new Error('Build placeholders remain');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
fs.writeFileSync(path.join(path.dirname(output), 'release-manifest.json'), JSON.stringify({
  url: 'https://dfacm.website/practice/pta-oop/',
  builtAt: new Date().toISOString(),
  referenceVersion: bank.referenceVersion,
  judgeVersion: bank.judgeVersion,
  questionCount: bank.questions.length,
  typeCounts: bank.typeCounts,
  sha256: crypto.createHash('sha256').update(html).digest('hex'),
}, null, 2) + '\n');
console.log(output);
