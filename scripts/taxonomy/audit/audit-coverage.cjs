// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Coverage + duplication audit.
//  - solution coverage per training plan and library-wide
//  - near-duplicate statements (shingle Jaccard) — the 46 copies dropped on
//    2026-10-07 were found this way, so re-run it over the current library
//  - training-plan integrity: chapter/difficulty banding, plan overlap
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const shingles = (s, k = 5) => {
  const t = String(s).replace(/<[^>]*>/g, ' ').replace(/[^\w\u3400-\u9fff]+/g, ' ').trim().split(/\s+/);
  const out = new Set();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
  if (!out.size && t.length) out.add(t.join(' '));
  return out;
};
const jac = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');

  const probs = await doc.find({ domainId: 'system', docType: 10 }).project({ docId: 1, title: 1, content: 1, difficulty: 1, tag: 1 }).sort({ docId: 1 }).toArray();
  const plans = await doc.find({ dag: { $exists: true } }).project({ docId: 1, title: 1, dag: 1, pin: 1 }).toArray();
  const solPids = new Set();
  for await (const s of doc.find({ domainId: 'system', docType: 11 }).project({ parentId: 1 })) solPids.add(String(s.parentId));

  console.log('=== 1. solution coverage ===');
  const owner = new Map();
  let grand = 0, gc = 0;
  for (const pl of plans) {
    const pids = [...new Set((pl.dag || []).flatMap((n) => n.pids || []).map(Number))];
    const miss = pids.filter((x) => !solPids.has(String(x)));
    pids.forEach((x) => owner.set(x, (owner.get(x) || 0) + 1));
    grand += pids.length; gc += pids.length - miss.length;
    console.log(`  ${(pl.title || '').padEnd(22)} pids=${String(pids.length).padStart(4)} sol=${String(pids.length - miss.length).padStart(4)} (${((1 - miss.length / pids.length) * 100).toFixed(0)}%)  missing=${miss.length}`);
    if (miss.length) console.log(`      ${miss.join(',')}`);
  }
  console.log(`  TOTAL pids=${grand} sol=${gc} (${((gc / grand) * 100).toFixed(1)}%) missing=${grand - gc}`);
  const overlap = [...owner.entries()].filter(([, n]) => n > 1);
  console.log(`  problems shared by >1 plan: ${overlap.length}${overlap.length ? ' -> ' + overlap.slice(0, 20).map(([p, n]) => `${p}(${n})`).join(',') : ''}`);

  const uniqPlan = new Set([...owner.keys()]);
  const notInPlan = probs.filter((p) => !uniqPlan.has(p.docId));
  const withSol = notInPlan.filter((p) => solPids.has(String(p.docId)));
  console.log(`  library outside plans: ${notInPlan.length}, of which already have a solution: ${withSol.length}`);

  console.log('\n=== 2. training plan integrity ===');
  for (const pl of plans) {
    const ch = pl.dag || [];
    const pids = [...new Set(ch.flatMap((n) => n.pids || []).map(Number))];
    const diffs = pids.map((p) => probs.find((x) => x.docId === p)).filter(Boolean).map((p) => p.difficulty || 0);
    const missing = pids.filter((p) => !probs.find((x) => x.docId === p));
    const unr = pids.filter((p) => !probs.find((x) => x.docId === p)?.difficulty);
    const band = ch.map((n) => `${(n.title || '').slice(0, 14)}(${(n.pids || []).length}${n.requireNids && n.requireNids.length ? '->' + n.requireNids.length : ''})`).join(' ');
    const hist = {};
    diffs.forEach((d) => (hist[d] = (hist[d] || 0) + 1));
    console.log(`  "${(pl.title || '').replace(/\s+/g, ' ')}" chapters=${ch.length} pids=${pids.length}`);
    console.log(`      chapters: ${band}`);
    console.log(`      difficulty hist: ${JSON.stringify(hist)}${unr.length ? '  unrated=' + unr.length : ''}${missing.length ? '  MISSING_PIDS=' + missing.join(',') : ''}`);
  }

  console.log('\n=== 3. near-duplicate statements (shingle Jaccard) ===');
  const sig = probs.map((p) => ({ d: p.docId, t: p.title, s: shingles((p.content || '').slice(0, 6000)) }));
  // bucket by shared rare tokens to keep it O(n^2) only within buckets
  const bucket = new Map();
  sig.forEach((x, i) => {
    for (const sh of x.s) {
      if (!bucket.has(sh)) bucket.set(sh, []);
      bucket.get(sh).push(i);
    }
  });
  const cand = new Set();
  for (const [, ids] of bucket) {
    if (ids.length > 40) continue;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) cand.add(ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`);
  }
  console.log(`  candidate pairs after bucketing: ${cand.size}`);
  const pairs = [];
  for (const key of cand) {
    const [i, j] = key.split('|').map(Number);
    const score = jac(sig[i].s, sig[j].s);
    if (score >= 0.5) pairs.push({ a: sig[i].d, b: sig[j].d, score: +score.toFixed(3), ta: sig[i].t, tb: sig[j].t });
  }
  pairs.sort((x, y) => y.score - x.score);
  console.log(`  pairs >= 0.50: ${pairs.length}`);
  for (const p of pairs.slice(0, 40)) console.log(`   ${p.score}  #${p.a} "${(p.ta || '').slice(0, 34)}"  <->  #${p.b} "${(p.tb || '').slice(0, 34)}"`);
  const exact = pairs.filter((p) => p.score >= 0.95);
  console.log(`  near-identical (>=0.95): ${exact.length}`);

  fs.writeFileSync('/root/audit-coverage.json', JSON.stringify({ coverage: { grand, gc }, dupPairs: pairs }, null, 1));
  await c.close();
})();
