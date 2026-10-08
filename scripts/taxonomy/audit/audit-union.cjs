// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const toSet = (v) => {
  if (!v) return new Set();
  if (v instanceof Set) return new Set(v);
  if (Array.isArray(v)) return new Set(v.map((x) => (typeof x === 'object' ? x.d : x)));
  return new Set(Object.keys(v).map(Number));
};
const merge = (...vs) => {
  const out = new Set();
  for (const v of vs) for (const d of toSet(v)) out.add(d);
  return out;
};

(async () => {
  const s = JSON.parse(fs.readFileSync('/root/audit-served.json', 'utf8'));
  const F = s.flags || {};
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const plans = await doc.find({ dag: { $exists: true } }).project({ dag: 1, title: 1 }).toArray();
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));
  const inPlan = new Set(planOf.keys());
  const N = 4249;

  const mathBad = merge(F.S1_literal_dollar_visible, F.S3_raw_tex_visible, F.S2_katex_error);
  const escBad = toSet(F.S4_escaped_backslash);
  const imgBad = toSet(F.S5_broken_image);
  const extBad = toSet(F.S6_external_image);
  const nosample = toSet(F.S7_no_sample_on_page);
  const anyBad = merge(mathBad, escBad, imgBad, extBad, nosample);
  const scanned = N - Object.keys(s.err || {}).length;

  const row = (name, st) => console.log(`  ${name.padEnd(44)} ${String(st.size).padStart(5)}  ${((st.size / N) * 100).toFixed(1).padStart(5)}%   inPlans=${[...st].filter((d) => inPlan.has(d)).length}`);
  console.log(`=== statement defect unions (library ${N}, pages successfully scanned ${scanned}) ===`);
  row('broken figure reference (404/403 img)', imgBad);
  row('math not rendered (literal $ / raw TeX)', mathBad);
  row('escaped backslash residue (&#92;)', escBad);
  row('no sample block on the page', nosample);
  row('external (third-party) figure host', extBad);
  row('ANY statement defect', anyBad);
  console.log(`  clean statements: ${N - anyBad.size} (${(((N - anyBad.size) / N) * 100).toFixed(1)}%)`);

  const perPlan = (st) => {
    const o = {};
    for (const d of st) { const p = planOf.get(d) || '(outside plans)'; o[p] = (o[p] || 0) + 1; }
    return Object.entries(o).sort((a, b) => b[1] - a[1]);
  };
  console.log('\n--- broken figures per training plan ---');
  for (const [p, n] of perPlan(imgBad)) console.log(`  ${String(n).padStart(4)}  ${p}`);
  console.log('\n--- math defects per training plan ---');
  for (const [p, n] of perPlan(mathBad)) console.log(`  ${String(n).padStart(4)}  ${p}`);
  console.log('\n--- escaped backslash per training plan ---');
  for (const [p, n] of perPlan(escBad)) console.log(`  ${String(n).padStart(4)}  ${p}`);

  console.log('\n--- pages still unverified (intermittent 403) ---');
  console.log('  ' + Object.keys(s.err || {}).join(','));

  fs.writeFileSync('/root/audit-unions.json', JSON.stringify({ mathBad: [...mathBad], escBad: [...escBad], imgBad: [...imgBad], nosample: [...nosample], anyBad: [...anyBad] }));
  await c.close();
})();
