// Corrected measurement, generalised.
//
// Two defects in the original audit, both from measuring the whole page:
//   1. <script> blocks were counted. window.UiContext serialises the statement
//      into JSON, so the page legitimately contains \uXXXX escapes and duplicated
//      text that no reader ever sees. This produced 298 phantom "escapes" on a
//      single page and fake "literal $" counts.
//   2. The body extractor keyed on <div class="typo richmedia">, but the real
//      container is <div class="section__body typo richmedia">. It matched
//      nothing and silently fell back to the whole document, which is why the
//      "KaTeX triple display" conclusion was wrong too.
//
// The honest measure: isolate the real statement container, then drop
// script/style, then count.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BASE = 'http://127.0.0.1:8888';
const HOST = 'dfacm.website';

// Hydro renders the statement inside `<div class="section__body typo richmedia">`.
// Nested divs make a non-greedy regex stop early, so cut on the known sibling
// that follows it instead: the solution entry, or the sidebar.
// The container is `<div class="section__body typo richmedia" data-fragment-id="...">`.
// Two earlier attempts failed here:
//   - matching `<div class="typo richmedia">` (missing the `section__body ` prefix):
//     never matches, so measurement silently fell back to the whole page
//   - matching the full tag string `<div class="section__body typo richmedia">`:
//     still fails because Hydro appends `data-fragment-id="..."` after the class
//     attribute, so the literal `">` is not there
// Match the class attribute itself and walk forward to the tag's real `>`.
const CONTAINER_RE = /<div class="section__body typo richmedia"[^>]*>/;

function statementOf(html) {
  const m = CONTAINER_RE.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const endM = rest.search(/<div class="section side section--problem-sidebar"|<div class="section__header"|<section class="section"|<div id="problem-/);
  return endM > 0 ? rest.slice(0, endM) : rest;
}

function measure(html) {
  const stmt = statementOf(html);
  if (stmt === null) return { error: 'statement container not found' };
  const noScript = stmt.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const vis = noScript
    .replace(/<pre[\s\S]*?<\/pre>/g, ' [[SAMPLE]] ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#92;/g, '\\')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  return {
    literalDollar: (vis.match(/(?:^|\s)\$+\S?/g) || []).length,
    katexSpans: (noScript.match(/class="katex"/g) || []).length,
    katexDisplay: (noScript.match(/class="katex-display"/g) || []).length,
    katexError: /katex-error/.test(noScript),
    escapedU: (noScript.match(/\\u[0-9a-fA-F]{4}/g) || []).length,
    rawTex: (vis.match(/\\(frac|sum|sqrt|begin|mathbb|cdot|times|leq|geq)\b/g) || []).length,
    texAnnotations: (noScript.match(/<annotation encoding="application\/x-tex">/g) || []).length,
    headings: (noScript.match(/<h2[^>]*>/g) || []).length,
    sampleBlocks: (noScript.match(/<pre><code class="language-(input|output)\d+"/g) || []).length,
    brokenImgs: (noScript.match(/<img[^>]+src="([^"]+)"/g) || []).filter((t) => /file:\/\//.test(t)).length,
    vis,
  };
}

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const plans = await db.collection('document').find({ dag: { $exists: true } }).project({ dag: 1, title: 1 }).toArray();
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));

  const targets = process.argv.slice(2).map(Number).filter(Boolean);
  const scope = JSON.parse(fs.readFileSync('/root/htmltrue-scope.json', 'utf8'));
  const ids = targets.length ? targets : [...new Set([...scope.buckets.fixable, ...scope.buckets.needsRewrite])];

  const CONC = 3;   // 6 tripped the 403 burst guard (114/292 lost)
  const q = ids.slice();
  const rows = [];
  async function one(id) {
    try {
      const r = await fetch(`${BASE}/p/${id}`, { headers: { host: HOST }, signal: AbortSignal.timeout(30000) });
      if (r.status !== 200) return rows.push({ id, http: r.status });
      const m = measure(await r.text());
      rows.push({ id, http: 200, ...m, vis: undefined });
    } catch (e) { rows.push({ id, error: String(e.message).slice(0, 60) }); }
  }
  await Promise.all(Array.from({ length: CONC }, async () => { while (q.length) await one(q.shift()); }));
  rows.sort((a, b) => a.id - b.id);

  const good = rows.filter((r) => r.http === 200 && !r.error);
  const literal = good.filter((r) => r.literalDollar > 0);
  const kerr = good.filter((r) => r.katexError);
  const rawtex = good.filter((r) => r.rawTex > 0);
  const esc = good.filter((r) => r.escapedU > 0);
  const rendered = good.filter((r) => r.katexSpans > 0);

  const ip = (list) => list.filter((r) => planOf.has(r.id)).length;
  console.log(`=== corrected rendered-page measure (${good.length}/${rows.length} fetched) ===`);
  console.log(`  literal $ visible to the reader : ${literal.length}   inPlan=${ip(literal)}`);
  console.log(`  katex-error                     : ${kerr.length}   inPlan=${ip(kerr)}`);
  console.log(`  raw \\TeX visible                : ${rawtex.length}   inPlan=${ip(rawtex)}`);
  console.log(`  \\uXXXX escapes in the statement : ${esc.length}   inPlan=${ip(esc)}`);
  console.log(`  formulas rendering via katex    : ${rendered.length}   inPlan=${ip(rendered)}`);
  const clean = good.filter((r) => r.literalDollar === 0 && !r.katexError && r.rawTex === 0 && r.escapedU === 0);
  console.log(`  fully clean statements          : ${clean.length}   inPlan=${ip(clean)}`);

  if (literal.length) {
    console.log('\n  still showing literal $:');
    for (const r of literal.slice(0, 12)) console.log(`    #${r.id} ${planOf.get(r.id) || '-'} katex=${r.katexSpans}`);
  }
  if (kerr.length) {
    console.log('\n  katex-error:');
    for (const r of kerr.slice(0, 12)) console.log(`    #${r.id} ${planOf.get(r.id) || '-'}`);
  }
  fs.writeFileSync('/root/render-measure.json', JSON.stringify(rows, null, 1));
  console.log('\nwrote /root/render-measure.json');
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
