// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Testdata structural audit — reads pdoc.data metadata only (no downloads), so it
// is cheap enough for all 4249 problems. Flags the failure shapes that actually
// produce WA/PE/TLE for students.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc.find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, data: 1, config: 1, hidden: 1, difficulty: 1, tag: 1 })
    .sort({ docId: 1 }).toArray();
  const plans = await doc.find({ dag: { $exists: true } }).project({ dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  const F = {};
  const flag = (k, d, ev) => { (F[k] = F[k] || []).push({ d, ev }); };
  const stats = { totalIn: 0, totalOut: 0, problems: 0, pairs: 0 };

  for (const p of probs) {
    stats.problems++;
    const names = (p.data || []).map((f) => f.name);
    const size = new Map((p.data || []).map((f) => [f.name, f.size || 0]));
    if (!names.length) { flag('B1_no_testdata', p.docId, 'data[] empty'); continue; }
    if (!names.includes('config.yaml')) flag('B2_no_config_yaml', p.docId, names.slice(0, 8).join(','));

    const base = (n) => n.replace(/\.(in|out|ans|txt|IN|OUT)$/i, '');
    const ins = new Map(), outs = new Map();
    for (const n of names) {
      if (/\.(in|ans)$/i.test(n)) ins.set(base(n), n);
      else if (/\.out$/i.test(n)) outs.set(base(n), n);
      else if (/\.(inp|input)$/i.test(n)) ins.set(base(n), n);
      else if (/\.(ans|answer|res)$/i.test(n)) outs.set(base(n), n);
    }
    stats.totalIn += ins.size;
    stats.totalOut += outs.size;
    const pairs = [...ins.keys()].filter((k) => outs.has(k));
    stats.pairs += pairs.length;

    const orphanIn = [...ins.keys()].filter((k) => !outs.has(k));
    const orphanOut = [...outs.keys()].filter((k) => !ins.has(k));
    if (orphanIn.length) flag('B3_orphan_input', p.docId, `${orphanIn.length}/${ins.size} orphan: ${orphanIn.slice(0, 5).join(',')}`);
    if (orphanOut.length) flag('B4_orphan_output', p.docId, `${orphanOut.length}/${outs.size} orphan: ${orphanOut.slice(0, 5).join(',')}`);
    if (!pairs.length) flag('B5_no_complete_pair', p.docId, `in=${ins.size} out=${outs.size} files=${names.slice(0, 8).join(',')}`);
    if (pairs.length === 1) flag('B6_single_testpoint', p.docId, 'only 1 case');

    for (const k of pairs) {
      if (size.get(ins.get(k)) === 0) { flag('B7_empty_input', p.docId, `${ins.get(k)} size=0`); break; }
    }
    for (const k of pairs) {
      if (size.get(outs.get(k)) === 0) { flag('B8_empty_output', p.docId, `${outs.get(k)} size=0 (${pairs.length} pairs)`); break; }
    }
    // suspicious ratio: answer much bigger than input
    for (const k of pairs) {
      const si = size.get(ins.get(k)) || 0;
      const so = size.get(outs.get(k)) || 0;
      if (so > 4096 && so > si * 20) { flag('B9_outlier_size_ratio', p.docId, `${ins.get(k)}=${si}B ${outs.get(k)}=${so}B`); break; }
    }
    if (names.length > 220) flag('B10_bloated_testdata', p.docId, `${names.length} files`);

    // config: time / memory / checker sanity (pdoc.config is a YAML string)
    const cfg = typeof p.config === 'string' ? p.config : '';
    const conf = names.includes('config.yaml') ? cfg : cfg + '\n' + '';
    if (!/time/i.test(conf) && !/time/i.test(cfg)) flag('B11_no_time_limit_declared', p.docId, snip(cfg, 70));
    if (!/memory/i.test(conf) && !/memory/i.test(cfg)) flag('B12_no_memory_limit_declared', p.docId, '');
    const spjDecl = /checker_type:\s*(\S+)|checker:\s*(\S+)/i.exec(cfg);
    if (spjDecl && !names.some((n) => /\.(cc|cpp|c)$/i.test(n))) flag('B13_checker_declared_but_absent', p.docId, snip(cfg, 90));
    if (p.hidden) flag('B14_hidden_problem', p.docId, '');
  }

  console.log('=== testdata structural audit ===');
  console.log(`problems=${stats.problems} inputFiles=${stats.totalIn} outputFiles=${stats.totalOut} completePairs=${stats.pairs}`);
  for (const k of Object.keys(F).sort()) {
    const v = F[k];
    console.log(`  ${k.padEnd(32)} total=${String(v.length).padStart(5)}  inPlan=${String(v.filter((x) => inPlan.has(x.d)).length).padStart(4)}`);
  }
  console.log('\n=== evidence (first 5 per class) ===');
  for (const k of Object.keys(F).sort()) {
    console.log(`-- ${k}`);
    for (const x of F[k].slice(0, 5)) console.log(`   #${x.d}${inPlan.has(x.d) ? ' (inPlan)' : ''} ${x.ev || ''}`);
  }
  fs.writeFileSync('/root/audit-testdata.json', JSON.stringify(F, null, 1));
  await c.close();
})();
function snip(s, n) { return String(s || '').replace(/\s+/g, ' ').slice(0, n); }
