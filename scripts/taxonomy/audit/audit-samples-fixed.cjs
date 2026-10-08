// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Corrected no-sample check. The first pass only recognised ```input1 /
// language-input1, so it mislabelled the 样例说明-style samples (4876, 4909)
// as missing. A sample exists if the statement carries any of:
//   - a paired input/output fence or <pre><code class="language-*N">
//   - a 样例/输入样例 section heading
//   - an explicit output line inside 样例说明 (the inline-derivation style)
// Sample *blocks* and inline derivations are counted separately, because the
// former is machine-checkable and the latter is a different authoring style.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const classify = (body) => {
  const hasFence = /```(?:input|output)\d|<code class="language-(?:input|output)\d/.test(body);
  const hasHeading = /##\s*样例|输入样例|输出样例|Sample\s*(Input|Output)|<h2[^>]*>\s*样例/.test(body);
  const hasExplain = /##\s*样例说明/.test(body);
  const sampleSection = (body.match(/##\s*样例([\s\S]*?)(?=\n##\s|$)/) || ['', ''])[1];
  // an inline derivation must actually show the answer, not just say "see above"
  const explainsOutput = hasExplain && /(输出|因此|所以|答案为|即)[:：]?\s*\n?[\s\S]{0,200}/.test(sampleSection + (body.match(/##\s*样例说明([\s\S]*?)(?=\n##\s|$)/) || ['', ''])[1]);
  if (hasFence) return { ok: true, style: 'block' };
  if (hasHeading && explainsOutput) return { ok: true, style: 'inline' };
  if (hasHeading) return { ok: false, style: 'heading-only' };
  return { ok: false, style: 'none' };
};

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const probs = await db.collection('document').find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, content: 1 }).sort({ docId: 1 }).toArray();
  const plans = await db.collection('document').find({ dag: { $exists: true } }).project({ dag: 1, title: 1 }).toArray();
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));

  const byStyle = { block: [], inline: [], 'heading-only': [], none: [] };
  for (const p of probs) {
    let body = String(p.content || '');
    if (body.trim().startsWith('{')) { try { const j = JSON.parse(body); body = j.zh != null ? j.zh : body; } catch (e) {} }
    byStyle[classify(body).style].push(p.docId);
  }
  const missing = [...byStyle['heading-only'], ...byStyle.none];
  console.log(`=== corrected sample census, library ${probs.length} ===`);
  console.log(`  block sample (input/output pairs) : ${byStyle.block.length}`);
  console.log(`  inline derivation (样例说明)        : ${byStyle.inline.length}`);
  console.log(`  sample heading but no output      : ${byStyle['heading-only'].length} ${JSON.stringify(byStyle['heading-only'])}`);
  console.log(`  no sample at all                  : ${byStyle.none.length} ${JSON.stringify(byStyle.none)}`);
  console.log(`  => genuinely missing a sample     : ${missing.length}`);
  console.log('  of those, inside a training plan  :', missing.filter((d) => planOf.has(d)).length, JSON.stringify(missing.filter((d) => planOf.has(d)).map((d) => planOf.get(d))));
  console.log('\nper missing problem:');
  for (const d of missing) {
    const p = probs.find((x) => x.docId === d);
    console.log(`  #${d} ${(p.title || '').slice(0, 40).padEnd(42)} ${planOf.get(d) || '(outside plans)'}`);
  }
  fs.writeFileSync('/root/audit-sample-corrected.json', JSON.stringify({ byStyle, missing }));
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
