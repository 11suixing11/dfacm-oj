// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// The 44 pages the HTTP scan never got are all inside the CF batch. Their
// statement defects can still be judged from Mongo alone (content + html flag +
// figure filenames vs the file store), which is what the authoritative checks
// use anyway. This closes the coverage gap in the report without refetching.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const MISSED = [
  1384, 1385, 1386, 1387, 1616, 1617, 1618, 1619, 1961, 1962, 1963, 1964,
  2298, 2299, 2300, 2301, 2893, 2895, 2896, 2897, 3391, 3392, 3393, 3394,
  3794, 3795, 3796, 3797, 4002, 4003, 4004, 4005, 4254, 4255, 4256, 4257,
  4616, 4617, 4618, 4619, 4873, 4874, 4875, 4876,
];

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const col = db.collection('document');
  const probs = await col.find({ domainId: 'system', docType: 10, docId: { $in: MISSED } })
    .project({ docId: 1, title: 1, content: 1, html: 1, data: 1, additional_file: 1 }).sort({ docId: 1 }).toArray();

  const served = JSON.parse(fs.readFileSync('/root/audit-served.json', 'utf8'));
  const figs = JSON.parse(fs.readFileSync('/root/audit-figures.json', 'utf8'));
  const stillMissed = Object.keys(served.err || {}).map(Number).filter((d) => MISSED.includes(d));

  let deadFig = 0, extFig = 0, htmlTrue = 0, hasSample = 0, en = 0, wouldAdd = 0;
  for (const p of probs) {
    const raw = String(p.content || '');
    const own = new Set([...(p.data || []).map((f) => f.name), ...(p.additional_file || []).map((f) => f.name)]);
    const imgs = [...raw.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    let dead = false, ext = false;
    for (const src of imgs) {
      if (/^(https?:)?\/\//i.test(src)) { ext = true; continue; }
      const name = src.split('/').pop().split('?')[0];
      if (/^file:/i.test(src) || !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(name) || !own.has(name)) dead = true;
    }
    if (dead) deadFig++;
    if (ext) extFig++;
    if (p.html === 'true' || p.html === true) htmlTrue++;
    if (/```input1|<code class="language-input1"|language-output1/.test(raw)) hasSample++;
    const t = raw.replace(/<[^>]*>/g, ' ');
    if ((t.match(/[\u3400-\u9fff]/g) || []).length < 5 && t.replace(/\s+/g, '').length > 100) en++;
    if (dead || ext || p.html === 'true') wouldAdd++;
  }
  console.log(`pages the HTTP scan missed      : ${probs.length} (all in the CF batch)`);
  console.log(`  confirmed still failing to fetch: ${stillMissed.length}`);
  console.log('--- defects judged from Mongo alone (these were never counted in the report) ---');
  console.log(`  dead figure reference          : ${deadFig}`);
  console.log(`  external figure host           : ${extFig}`);
  console.log(`  html:"true" (math bypassed)    : ${htmlTrue}`);
  console.log(`  has a sample block             : ${hasSample}`);
  console.log(`  English statement              : ${en}`);
  console.log(`  would be newly flagged         : ${wouldAdd}`);
  console.log('\nper problem:');
  for (const p of probs) {
    const raw = String(p.content || '');
    const own = new Set([...(p.data || []).map((f) => f.name), ...(p.additional_file || []).map((f) => f.name)]);
    const imgs = [...raw.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const bad = imgs.filter((src) => !/^(https?:)?\/\//i.test(src) && (/^file:/i.test(src) || !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(src.split('?')[0]) || !own.has(src.split('/').pop().split('?')[0])));
    const marks = [bad.length ? `deadFig=${bad.length}` : '', p.html === 'true' || p.html === true ? 'html=true' : ''].filter(Boolean).join(' ');
    console.log(`  #${p.docId} ${(p.title || '').slice(0, 40).padEnd(42)} ${marks || 'clean'}`);
  }
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
