// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

// Measure the translation workload: only the prose of each English statement,
// with sample blocks and figures excluded (those are language-neutral).
const stripForTranslate = (html) => {
  let s = String(html);
  s = s.replace(/<pre[\s\S]*?<\/pre>/g, '\n\n<<<SAMPLE>>>\n\n');
  s = s.replace(/<img[^>]*>/g, ' <<<FIGURE>>> ');
  s = s.replace(/<script[\s\S]*?<\/script>/g, '');
  s = s.replace(/<[^>]*>/g, '\n');
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s;
};

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const probs = await db.collection('document').find({ domainId: 'system', docType: 10, docId: { $gte: 843, $lte: 3675 } })
    .project({ docId: 1, title: 1, content: 1, html: 1, tag: 1, difficulty: 1, nSubmit: 1, nAccept: 1 }).sort({ docId: 1 }).toArray();

  const en = [], zh = [], short = [], sampleOnly = [];
  let chars = 0;
  for (const p of probs) {
    const raw = String(p.content || '');
    const txt = raw.replace(/<[^>]*>/g, ' ');
    const han = (txt.match(/[\u3400-\u9fff]/g) || []).length;
    if (han >= 5) { zh.push(p.docId); continue; }
    const t = stripForTranslate(raw);
    if (t.replace(/\s/g, '').length < 200) { short.push(p.docId); continue; }
    if (/^<<<SAMPLE>>>$/m.test(t) && t.replace(/<<<SAMPLE>>>/g, '').trim().length < 200) { sampleOnly.push(p.docId); continue; }
    en.push(p.docId);
    chars += t.length;
  }
  console.log('CF batch total      :', probs.length);
  console.log('already Chinese     :', zh.length);
  console.log('needs translation   :', en.length);
  console.log('  too short / junk  :', short.length, short.slice(0, 20).join(','));
  console.log('  sample-only (tiny):', sampleOnly.length);
  console.log('total prose chars   :', chars, `(avg ${Math.round(chars / Math.max(en.length,1))} chars/problem)`);
  console.log('rough token estimate:', Math.round(chars / 3.6), 'input; similar output');

  // difficulty / usage profile of the untranslated set, to plan the order
  const byDiff = {}, byUsage = { untouched: 0, attempted: 0 };
  for (const d of en) {
    const p = probs.find((x) => x.docId === d);
    byDiff[p.difficulty || 0] = (byDiff[p.difficulty || 0] || 0) + 1;
    if ((p.nSubmit || 0) > 0) byUsage.attempted++; else byUsage.untouched++;
  }
  console.log('\nuntranslated by difficulty:', JSON.stringify(byDiff));
  console.log('untranslated by usage    :', JSON.stringify(byUsage));

  // sample of the shortest and longest to sanity-check the extractor
  const lens = en.map((d) => ({ d, n: stripForTranslate(probs.find((p) => p.docId === d).content).length })).sort((a, b) => a.n - b.n);
  console.log('\nshortest 3:', JSON.stringify(lens.slice(0, 3)));
  console.log('longest 3 :', JSON.stringify(lens.slice(-3)));
  const sample = probs.find((p) => p.docId === en[Math.floor(en.length / 2)]);
  console.log('\n--- extractor sample for #' + sample.docId + ' ' + (sample.title || '').slice(0, 50) + ' ---');
  console.log(stripForTranslate(sample.content).slice(0, 700));

  fs.writeFileSync('/root/cf-translate-list.json', JSON.stringify({ en, zh, short, sampleOnly }, null, 1));
  console.log('\nwrote /root/cf-translate-list.json');
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
