// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Recount the authoritative (Mongo-side) defect classes over the whole library.
// The HTTP scan never reached 44 pages, so its S1-S7 numbers were lower bounds.
// The figure and math-flag checks are fully decidable from Mongo: an <img>
// filename is live iff it is in data[]/additional_file[], and html:"true" is
// exactly the flag that bypasses the KaTeX pipeline.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const probs = await db.collection('document').find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, content: 1, html: 1, data: 1, additional_file: 1, tag: 1, difficulty: 1 })
    .sort({ docId: 1 }).toArray();
  const plans = await db.collection('document').find({ dag: { $exists: true } }).project({ dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  const dead = new Set(), ext = new Set(), htmlTrue = new Set(), noSample = new Set(), en = new Set();
  let deadRefs = 0, extRefs = 0;
  for (const p of probs) {
    const raw = String(p.content || '');
    const own = new Set([...(p.data || []).map((f) => f.name), ...(p.additional_file || []).map((f) => f.name)]);
    for (const m of raw.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = m[1];
      if (/^(https?:)?\/\//i.test(src)) { ext.add(p.docId); extRefs++; continue; }
      const name = src.split('/').pop().split('?')[0];
      if (/^file:/i.test(src) || !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(name) || !own.has(name)) { dead.add(p.docId); deadRefs++; }
    }
    if (p.html === 'true' || p.html === true) htmlTrue.add(p.docId);
    if (!/```input1|<code class="language-input1"|language-output1/.test(raw)) noSample.add(p.docId);
    const t = raw.replace(/<[^>]*>/g, ' ');
    if ((t.match(/[\u3400-\u9fff]/g) || []).length < 5 && t.replace(/\s+/g, '').length > 100) en.add(p.docId);
  }

  // union of "the statement has at least one defect", Mongo-side only
  const any = new Set([...dead, ...ext, ...noSample]);
  const N = probs.length;
  const row = (k, s, extra) => console.log(`  ${k.padEnd(34)} ${String(s.size).padStart(5)}  inPlan=${String([...s].filter((d) => inPlan.has(d)).length).padStart(4)}  ${extra || ''}`);
  console.log(`=== authoritative recount, library ${N} (no HTTP involved) ===`);
  row('dead figure reference', dead, `refs=${deadRefs}`);
  row('external figure host', ext, `refs=${extRefs}`);
  row('html:"true" math bypass', htmlTrue);
  row('no sample block', noSample, JSON.stringify([...noSample].sort((a, b) => a - b)));
  row('English statement', en);
  row('statement defect (union)', any, `${(any.size / N * 100).toFixed(1)}%`);
  console.log(`  clean statements                   ${String(N - any.size).padStart(5)}  ${((N - any.size) / N * 100).toFixed(1)}%`);
  fs.writeFileSync('/root/audit-authoritative.json', JSON.stringify({ deadRefs, extRefs, dead: [...dead], ext: [...ext], htmlTrue: [...htmlTrue], noSample: [...noSample], en: [...en] }));
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
