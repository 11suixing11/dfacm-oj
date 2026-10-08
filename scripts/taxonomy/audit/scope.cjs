// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Scope the five "high quality" dimensions per problem, so the plan is priced in
// work items rather than vibes. Everything here is a count derived from data.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const toSet = (v) => {
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map((x) => (typeof x === 'object' ? x.d : x)));
  return new Set(Object.keys(v).map(Number));
};

(async () => {
  const served = JSON.parse(fs.readFileSync('/root/audit-served.json', 'utf8'));
  const figs = JSON.parse(fs.readFileSync('/root/audit-figures.json', 'utf8'));
  const td = JSON.parse(fs.readFileSync('/root/audit-testdata.json', 'utf8'));
  const cov = JSON.parse(fs.readFileSync('/root/audit-coverage.json', 'utf8'));

  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc.find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, content: 1, html: 1, title: 1, difficulty: 1, tag: 1, nSubmit: 1, nAccept: 1, config: 1, data: 1 }).sort({ docId: 1 }).toArray();
  const solPids = new Set();
  for await (const s of doc.find({ domainId: 'system', docType: 11 }).project({ parentId: 1 })) solPids.add(String(s.parentId));
  const plans = await doc.find({ dag: { $exists: true } }).project({ docId: 1, title: 1, dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  const BATCH = [
    ['一本通 396', (d) => d >= 3676 && d <= 4071],
    ['蓝桥杯 253', (d) => d >= 4072 && d <= 4325],
    ['XCPC 108', (d) => (d >= 4928 && d <= 4931) || (d >= 2 && d <= 6) || (d >= 616 && d <= 623) || (d >= 624 && d <= 842) || (d >= 2785 && d <= 3675)],
    ['8 专题 256', (d) => [964,992,1057,1061,1071,1135,1218,918,922,1050,1133,1173,1216,1287,851,923,940,988,998,1004,1010,913,926,937,962,1005,1139,906,917,947,982,1068,1251,1632,2119,2698,2718,2904,1073,1078,1262,1473,1552,1785,1819,1975,927,1072,1110,1143,1179,1196,1208,844,860,946,1014,1081,1189,886,921,966,1049,1075].includes(d)],
    ['CF 2833', (d) => d >= 843 && d <= 3675],
    ['LOJ 213', (d) => (d >= 2 && d <= 6) || (d >= 616 && d <= 623) || (d >= 624 && d <= 842)],
    ['远程 ybtbas 480', (d) => d >= 4326 && d <= 4805],
    ['远程 深基 114', (d) => d >= 4806 && d <= 4927],
  ];
  const deadFig = toSet(figs.X0_figure_missing_from_store);
  const extFig = toSet(figs.X1_external_host);
  const mathBad = new Set([...(served.flags.S1_literal_dollar_visible || []), ...(served.flags.S3_raw_tex_visible || []), ...(served.flags.S2_katex_error || [])].map((x) => x.d));
  const escBad = toSet(served.flags.S4_escaped_backslash);

  const rows = [];
  for (const [name, pred] of BATCH) {
    const g = probs.filter((p) => pred(p.docId));
    if (!g.length) continue;
    const plan = g.filter((p) => inPlan.has(p.docId)).length;
    const withSol = g.filter((p) => solPids.has(String(p.docId))).length;
    const used = g.filter((p) => (p.nSubmit || 0) > 0).length;
    const en = g.filter((p) => {
      const t = String(p.content || '').replace(/<[^>]*>/g, ' ');
      return (t.match(/[\u3400-\u9fff]/g) || []).length < 5 && t.replace(/\s+/g, '').length > 100;
    }).length;
    rows.push({
      name, n: g.length, plan, withSol, used, en,
      fig: g.filter((p) => deadFig.has(p.docId) || extFig.has(p.docId)).length,
      math: g.filter((p) => mathBad.has(p.docId)).length,
      esc: g.filter((p) => escBad.has(p.docId)).length,
      htmlTrue: g.filter((p) => p.html === 'true' || p.html === true).length,
      remote: g.filter((p) => /remote_judge/.test(String(p.config || ''))).length,
    });
  }

  console.log('batch'.padEnd(18), 'n'.padStart(5), 'inPlan'.padStart(7), '题解'.padStart(5), '被做过'.padStart(7), '英文题面'.padStart(9), '死图'.padStart(6), '公式坏'.padStart(7), 'html=true'.padStart(10));
  for (const r of rows) {
    console.log(
      r.name.padEnd(18), String(r.n).padStart(5), String(r.plan).padStart(7), String(r.withSol).padStart(5),
      String(r.used).padStart(7), String(r.en).padStart(9), String(r.fig).padStart(6), String(r.math).padStart(7), String(r.htmlTrue).padStart(10)
    );
  }
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, plan: a.plan + r.plan, withSol: a.withSol + r.withSol, used: a.used + r.used, en: a.en + r.en, fig: a.fig + r.fig, math: a.math + r.math }), { n: 0, plan: 0, withSol: 0, used: 0, en: 0, fig: 0, math: 0 });
  console.log('TOTAL'.padEnd(18), String(tot.n).padStart(5), String(tot.plan).padStart(7), String(tot.withSol).padStart(5), String(tot.used).padStart(7), String(tot.en).padStart(9), String(tot.fig).padStart(6), String(tot.math).padStart(7));

  console.log('\n--- 单测试点 / 0 字节输入, per batch ---');
  const sp = new Set((td.B6_single_testpoint || []).map((x) => x.d));
  const eb = new Set((td.B7_empty_input || []).map((x) => x.d));
  for (const [name, pred] of BATCH) {
    const g = probs.filter((p) => pred(p.docId));
    const a = g.filter((p) => sp.has(p.docId)).length;
    const b = g.filter((p) => eb.has(p.docId)).length;
    if (a || b) console.log(`  ${name.padEnd(18)} 单测试点=${a}  空输入=${b}`);
  }

  console.log('\n--- 剩余近似重复对 (>=0.55), 标注是否路线内 ---');
  for (const p of (cov.dupPairs || [])) {
    if (p.score < 0.55) break;
    console.log(`  ${p.score.toFixed(3)}  #${p.a} <-> #${p.b}  ${inPlan.has(p.a) || inPlan.has(p.b) ? '路线内' : ''}`);
  }
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
