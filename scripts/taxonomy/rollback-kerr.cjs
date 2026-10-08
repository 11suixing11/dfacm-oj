// Four problems regressed: flipping html:"" made KaTeX *fail* where before it
// harmlessly printed $..$ literally. A visible katex-error is worse than
// literal text, so roll those back to html:"true" while keeping the 243 that
// improved. Decide per problem by measuring, not by guessing.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BASE = 'http://127.0.0.1:8888';
const HOST = 'dfacm.website';
const MODE = process.argv[2] || 'plan';

const stmt = async (id) => {
  const html = await (await fetch(`${BASE}/p/${id}`, { headers: { host: HOST } })).text();
  const m = /<div class="section__body typo richmedia"[^>]*>/.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const e = rest.search(/<div class="section side section--problem-sidebar"|<div class="section__header"|<section class="section"|<div id="problem-/);
  return (e > 0 ? rest.slice(0, e) : rest).replace(/<script[\s\S]*?<\/script>/g, ' ');
};

(async () => {
  const st = JSON.parse(fs.readFileSync('/root/htmltrue-state.json', 'utf8'));
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const col = db.collection('document');

  // Re-measure every flipped problem and split on the outcome.
  const bad = [], good = [], unknown = [];
  for (const d of st.applied) {
    let body;
    try { body = await stmt(d); } catch (e) { unknown.push(d); continue; }
    if (body === null) { unknown.push(d); continue; }
    if (/katex-error/.test(body)) bad.push(d);
    else good.push(d);
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`=== re-measure of the ${st.applied.length} flipped ===`);
  console.log(`  render without katex-error : ${good.length}`);
  console.log(`  katex-error (regressed)   : ${bad.length}`);
  console.log(`  could not measure         : ${unknown.length}`);
  for (const d of bad) {
    const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1 } });
    console.log(`    #${d} ${(p.title || '').slice(0, 44)}`);
  }

  if (MODE === 'apply') {
    if (!bad.length) { console.log('\nnothing to roll back'); await c.close(); process.exit(0); }
    const rows = [];
    for (const d of bad) {
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1, html: 1 } });
      rows.push({ docId: d, title: p.title, oldHtml: p.html });
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const f = `/root/backups/htmltrue-rollback-${stamp}.json`;
    if (fs.existsSync(f)) throw new Error('backup exists: ' + f);
    fs.writeFileSync(f, JSON.stringify(rows, null, 1));
    console.log(`\nbackup -> ${f}`);
    for (const r of rows) await col.updateOne({ domainId: 'system', docType: 10, docId: r.docId }, { $set: { html: 'true' } });
    st.applied = good;
    st.rolledBack = bad;
    fs.writeFileSync('/root/htmltrue-state.json', JSON.stringify(st, null, 1));
    console.log(`rolled back ${rows.length} problems to html:"true"; state now lists ${good.length} as applied`);
  }

  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
