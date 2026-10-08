// Scope the html:"true" math bypass precisely.
//
// Hydro's document.pdoc has an `html` field: "true" means content is emitted as
// raw HTML and the markdown-it + KaTeX pipeline is skipped entirely, so $..$
// stays literal. "" means the pipeline runs and $..$ renders.
//
// Two things decide how much work this is:
//   - how many of those problems actually carry $..$ math (a problem with no
//     formulas is unaffected, despite the flag)
//   - whether the content is already clean markdown-with-HTML-blocks (safe to
//     just flip the flag) or is raw scraped HTML (needs a rewrite)
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const plans = await doc.find({ dag: { $exists: true } }).project({ dag: 1, title: 1 }).toArray();
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));

  const probs = await doc.find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, content: 1, html: 1, tag: 1, difficulty: 1, nSubmit: 1, nAccept: 1 })
    .sort({ docId: 1 }).toArray();

  const htmlTrue = probs.filter((p) => p.html === 'true' || p.html === true);

  // does the stored content carry LaTeX delimiters at all?
  const withMath = (raw) => {
    const outsidePre = String(raw).replace(/<pre\b[\s\S]*?<\/pre>/g, '');
    return /\$\$[\s\S]{1,400}?\$\$|\$[^$\n]{1,200}\$/.test(outsidePre);
  };
  const katexResidue = (raw) => /class=["']?katex/i.test(String(raw));

  const stats = {
    htmlTrue: htmlTrue.length,
    hasMath: 0, noMath: 0,
    katexResidue: 0,
    cleanStructure: 0, rawHtml: 0,
  };
  const buckets = { fixable: [], needsRewrite: [], noMath: [], residue: [] };

  for (const p of htmlTrue) {
    const raw = String(p.content || '');
    const math = withMath(raw);
    const residue = katexResidue(raw);
    // A clean markdown statement: has <h2> section headings and language-* sample
    // blocks, and no leftover scraped chrome (class="tex-", <div class="title">).
    const looksStructured = /<h2|<h3|language-(input|output)\d|```(input|output)\d/.test(raw);
    const looksScraped = /class="tex-(span|formula|graphics)"|<div class="title"|<div style="font-family/.test(raw);
    if (residue) { stats.katexResidue++; buckets.residue.push(p.docId); }
    if (!math && !residue) { stats.noMath++; buckets.noMath.push(p.docId); continue; }
    stats.hasMath++;
    if (looksStructured && !looksScraped) { stats.cleanStructure++; buckets.fixable.push(p.docId); }
    else { stats.rawHtml++; buckets.needsRewrite.push(p.docId); }
  }

  const inPlan = (a) => a.filter((d) => planOf.has(d)).length;
  console.log(`=== html:"true" scope, library ${probs.length} ===`);
  console.log(`  html:"true" problems            : ${stats.htmlTrue}  (inPlan ${inPlan(htmlTrue.map((p) => p.docId))})`);
  console.log(`  ...carrying no math at all      : ${stats.noMath}  (inPlan ${inPlan(buckets.noMath)})  -> unaffected`);
  console.log(`  ...carrying math, clean structure: ${stats.cleanStructure}  (inPlan ${inPlan(buckets.fixable)})  -> flip flag, light touch`);
  console.log(`  ...carrying math, scraped html   : ${stats.rawHtml}  (inPlan ${inPlan(buckets.needsRewrite)})  -> rewrite`);
  console.log(`  ...with raw katex residue         : ${stats.katexResidue}  (inPlan ${inPlan(buckets.residue)})  (overlaps the two above)`);

  const actionable = [...new Set([...buckets.fixable, ...buckets.needsRewrite])];
  console.log(`\n  ACTIONABLE (math would actually render after repair): ${actionable.length}  (inPlan ${inPlan(actionable)})`);
  console.log(`  by plan:`);
  const byPlan = {};
  for (const d of actionable) { const p = planOf.get(d) || '(outside plans)'; byPlan[p] = (byPlan[p] || 0) + 1; }
  for (const [p, n] of Object.entries(byPlan).sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${p}`);

  console.log('\n  sample fixable:');
  for (const d of buckets.fixable.slice(0, 6)) {
    const p = probs.find((x) => x.docId === d);
    console.log(`    #${d} ${(p.title || '').slice(0, 38).padEnd(40)} ${planOf.get(d) || '-'}`);
  }
  console.log('  sample needsRewrite:');
  for (const d of buckets.needsRewrite.slice(0, 6)) {
    const p = probs.find((x) => x.docId === d);
    console.log(`    #${d} ${(p.title || '').slice(0, 38).padEnd(40)} ${planOf.get(d) || '-'}`);
  }

  fs.writeFileSync('/root/htmltrue-scope.json', JSON.stringify({ stats, buckets }, null, 1));
  console.log('\nwrote /root/htmltrue-scope.json');
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
