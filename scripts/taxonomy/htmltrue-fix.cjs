// Pilot for the html:"true" math bypass.
//
// Mechanism (confirmed 2026-10-06): pdoc.html === "true" makes Hydro emit content
// as raw HTML and skip the markdown-it + KaTeX pipeline, so $..$ survives as
// literal text. html === "" routes it through the pipeline, where $..$ renders.
//
// The stored content of these problems is already in the target shape -- <h2>
// section headings, <pre><code class="language-inputN"> sample blocks, $..$
// math -- so flipping the flag is the whole repair. No content rewrite needed.
//
// Rules this script enforces, each learned from a past incident:
//   - back up every original BEFORE the first write, and never overwrite a
//     backup file
//   - only flip the flag; never touch `content`
//   - skip any problem that already has html === ""
//   - require the content to still contain the math we expect to start rendering
//   - verify after writing that the served page no longer shows a literal $
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const MODE = process.argv[2] || 'plan'; // plan | apply | verify | revert
const BASE = 'http://127.0.0.1:8888';
const HOST = 'dfacm.website';
const STATE = '/root/htmltrue-state.json';

const hasMath = (raw) => {
  const outsidePre = String(raw).replace(/<pre\b[\s\S]*?<\/pre>/g, '');
  return /\$\$[\s\S]{1,400}?\$\$|\$[^$\n]{1,200}\$/.test(outsidePre);
};

async function main() {
  const scope = JSON.parse(fs.readFileSync('/root/htmltrue-scope.json', 'utf8'));
  const ids = [...new Set([...scope.buckets.fixable, ...scope.buckets.needsRewrite])];
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const col = db.collection('document');

  if (MODE === 'plan') {
    console.log(`candidate problems: ${ids.length}`);
    for (const d of ids.slice(0, 10)) {
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1, html: 1, content: 1 } });
      const m = String(p.content).replace(/<pre\b[\s\S]*?<\/pre>/g, '').match(/\$[^$\n]{1,80}\$/g) || [];
      console.log(`  #${d} ${(p.title || '').slice(0, 36).padEnd(38)} html=${JSON.stringify(p.html)} mathExprs=${m.length} e.g. ${JSON.stringify(m[0] || '')}`);
    }
    console.log(`\n... run: node ${process.argv[1]} apply`);
  }

  if (MODE === 'apply') {
    // stage the backup first, flush it, then write -- never the other way round
    const backup = [];
    const staged = [];
    for (const d of ids) {
      const q = { domainId: 'system', docType: 10, docId: d };
      const p = await col.findOne(q, { projection: { html: 1, content: 1, title: 1 } });
      if (!p) { console.log(`  skip ${d}: not found`); continue; }
      if (!(p.html === 'true' || p.html === true)) { console.log(`  skip ${d}: html already ${JSON.stringify(p.html)}`); continue; }
      if (!hasMath(p.content)) { console.log(`  skip ${d}: no math left in content`); continue; }
      backup.push({ docId: d, oldHtml: p.html, title: p.title });
      staged.push(d);
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const f = `/root/backups/htmltrue-flag-${stamp}.json`;
    if (fs.existsSync(f)) throw new Error('backup exists, refusing to overwrite: ' + f);
    fs.writeFileSync(f, JSON.stringify(backup, null, 1));
    console.log(`backup -> ${f} (${backup.length} entries)`);

    for (const d of staged) {
      await col.updateOne({ domainId: 'system', docType: 10, docId: d }, { $set: { html: '' } });
    }
    fs.writeFileSync(STATE, JSON.stringify({ applied: staged, at: new Date().toISOString(), backup: f }, null, 1));
    console.log(`flipped html to "" on ${staged.length} problems`);
    console.log(`state -> ${STATE}`);
  }

  if (MODE === 'verify') {
    // Ground truth: fetch the page and look at what the reader actually sees.
    const check = process.argv.slice(3).map(Number).filter(Boolean);
    const list = check.length ? check : JSON.parse(fs.readFileSync(STATE, 'utf8')).applied.slice(0, 10);
    let bad = 0;
    for (const d of list) {
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1, html: 1 } });
      const r = await fetch(`${BASE}/p/${d}`, { headers: { host: HOST } });
      const html = await r.text();
      const m = html.match(/<div class="typo richmedia"[\s\S]*?<\/div>\s*(?:<div class="problem-actions|$)/);
      const body = m ? m[0] : html;
      const vis = body.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<[^>]*>/g, ' ').replace(/&#92;/g, '\\').replace(/\s+/g, ' ');
      const dollars = (vis.match(/(?:^|\s)\$+\S?/g) || []).length;
      const katex = (body.match(/class="katex"/g) || []).length;
      const ok = dollars === 0;
      if (!ok) bad++;
      console.log(`  ${ok ? 'OK  ' : 'BAD '} #${d} html=${JSON.stringify(p.html)} literal$=${dollars} katexSpans=${katex}  ${(p.title || '').slice(0, 30)}`);
    }
    console.log(`\n${list.length - bad}/${list.length} render math correctly`);
  }

  if (MODE === 'revert') {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const backup = JSON.parse(fs.readFileSync(st.backup, 'utf8'));
    for (const b of backup) await col.updateOne({ domainId: 'system', docType: 10, docId: b.docId }, { $set: { html: b.oldHtml } });
    console.log(`reverted ${backup.length} problems from ${st.backup}`);
  }

  await c.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
