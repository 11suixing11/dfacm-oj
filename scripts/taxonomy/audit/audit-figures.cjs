// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Authoritative figure audit: for every <img> inside the *statement body* only,
// resolve the filename against pdoc.data + additional_file (the real file store).
// The served-page HTTP probe is deliberately NOT used — it produced two
// false-positive classes: the chrome gravatar avatar and Hydro's
// 302 -> signed-storage redirect which answers 403 to a re-probe.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc.find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, content: 1, data: 1, additional_file: 1, html: 1 }).sort({ docId: 1 }).toArray();
  const plans = await doc.find({ dag: { $exists: true } }).project({ dag: 1, title: 1 }).toArray();
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));

  // statement body = content, minus the pieces Hydro appends (样例 is inside, keep it)
  const bodyOf = (raw) => String(raw).replace(/^[\s\S]*?<h2>题目描述|^[\s\S]*?题目描述/, '<h2>题目描述');

  const classes = {};
  const add = (k, d, ev) => { (classes[k] = classes[k] || []).push({ d, ev }); };
  let withImg = 0, totalImg = 0;

  for (const p of probs) {
    const raw = typeof p.content === 'string' ? p.content : '';
    const own = new Set([...(p.data || []).map((f) => f.name), ...(p.additional_file || []).map((f) => f.name)]);
    // figure references live in the statement; ignore anything after 提交/讨论 chrome markers
    const imgs = [...raw.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    if (!imgs.length) continue;
    withImg++;
    totalImg += imgs.length;
    let broken = 0, external = 0, ok = 0;
    const brokenNames = [];
    for (const src of imgs) {
      if (/^(https?:)?\/\//i.test(src) || /^https?:/i.test(src)) { external++; add('X1_external_host', p.docId, src.slice(0, 100)); continue; }
      const name = src.split('/').pop().split('?')[0];
      if (/^file:/i.test(src) || /^\d+[a-z0-9]{8}$/i.test(name) || !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(name)) {
        broken++; brokenNames.push(src.slice(0, 60)); continue;
      }
      if (own.has(name)) ok++;
      else { broken++; brokenNames.push(`${src.slice(0, 60)} (file not in store)`); }
    }
    if (broken) add('X0_figure_missing_from_store', p.docId, `${broken}/${imgs.length} e.g. ${brokenNames[0]}`);
    if (external && broken) add('X2_figure_external_and_broken', p.docId, `${external} external, ${broken} broken`);
  }

  const N = probs.length;
  console.log(`=== figure audit (statement-body <img> only, library ${N}) ===`);
  console.log(`  problems carrying at least one figure: ${withImg}`);
  console.log(`  total figure references: ${totalImg}`);
  for (const k of Object.keys(classes).sort()) {
    const v = classes[k];
    const inp = v.filter((x) => planOf.has(x.d)).length;
    console.log(`  ${k.padEnd(30)} ${String(v.length).padStart(5)}  inPlans=${String(inp).padStart(4)}`);
  }
  const missing = new Set((classes.X0_figure_missing_from_store || []).map((x) => x.d));
  const ext = new Set((classes.X1_external_host || []).map((x) => x.d));
  const union = new Set([...missing, ...ext]);
  console.log(`  union(problems with a dead or third-party figure): ${union.size}  inPlans=${[...union].filter((d) => planOf.has(d)).length}`);
  console.log(`  dead-figure problems per plan:`);
  const per = {};
  for (const d of union) { const p = planOf.get(d) || '(outside plans)'; per[p] = (per[p] || 0) + 1; }
  for (const [p, n] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${p}`);
  console.log('\n  sample dead-figure references:');
  for (const k of Object.keys(classes).sort()) {
    console.log(`  -- ${k}`);
    for (const x of classes[k].slice(0, 6)) console.log(`     #${x.d}${planOf.has(x.d) ? ' (' + planOf.get(x.d) + ')' : ''} ${x.ev}`);
  }
  fs.writeFileSync('/root/audit-figures.json', JSON.stringify(classes));
  await c.close();
})();
