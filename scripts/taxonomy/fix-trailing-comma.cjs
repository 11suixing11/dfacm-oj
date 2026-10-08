// Remove the trailing comma that the import left inside 5 formulas on 3 CSP
// problems: the source had a full-width Chinese comma after the formula, the
// import escaped it to &#44; and then folded it into the $..$ span, so it now
// renders as a stray mark inside the equation.
//
// #749 is deliberately excluded: there the comma separates real constraints
// ("1≤N≤10^9, 2≤M≤K≤3000, K≤N") and is legitimate TeX.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BASE = 'http://127.0.0.1:8888';
const HOST = 'dfacm.website';
const MODE = process.argv[2] || 'plan';

const TARGETS = [616, 617, 619]; // #749 excluded on purpose

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const col = db.collection('document');

  const staged = [];
  for (const d of TARGETS) {
    const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1, content: 1 } });
    const outside = String(p.content);
    const after = outside.replace(/\$([^$\n]{1,300}?)(,|&#44;)\$/g, (whole, body, comma) => '$' + body + '$');
    if (after !== outside) {
      staged.push({ d, title: (p.title || '').slice(0, 40), before: p.content, after, changed: (outside.match(/\$[^$\n]{1,300}?(,|&#44;)\$/g) || []).length });
    }
  }
  console.log(`=== trailing-comma repair (${TARGETS.join(', ')}; #749 excluded) ===`);
  for (const s of staged) console.log(`  #${s.d} ${s.title.padEnd(40)} ${s.changed} span(s)`);

  if (MODE === 'apply') {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const f = `/root/backups/trailing-comma-${stamp}.json`;
    if (fs.existsSync(f)) throw new Error('backup exists: ' + f);
    fs.writeFileSync(f, JSON.stringify(staged.map((s) => ({ docId: s.d, title: s.title, oldContent: s.before })), null, 1));
    console.log(`\nbackup -> ${f}`);
    for (const s of staged) await col.updateOne({ domainId: 'system', docType: 10, docId: s.d }, { $set: { content: s.after } });
    fs.writeFileSync('/root/trailing-comma-state.json', JSON.stringify({ ids: staged.map((s) => s.d), backup: f }, null, 1));
    console.log(`rewrote ${staged.length} problems`);
  }

  if (MODE === 'verify') {
    for (const d of TARGETS) {
      const html = await (await fetch(`${BASE}/p/${d}`, { headers: { host: HOST } })).text();
      const m = /<div class="section__body typo richmedia"[^>]*>/.exec(html);
      const rest = m ? html.slice(m.index + m[0].length) : '';
      const e = rest.search(/<div class="section side section--problem-sidebar"|<div class="section__header"|<section class="section"|<div id="problem-/);
      const body = (m ? e > 0 ? rest.slice(0, e) : rest : '').replace(/<script[\s\S]*?<\/script>/g, ' ');
      const vis = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const katex = (body.match(/class="katex"/g) || []).length;
      const kerr = /katex-error/.test(body);
      const dollars = (vis.match(/(?:^|\s)\$+\S?/g) || []).length;
      console.log(`  #${d} katex=${katex} katexError=${kerr} literal$=${dollars}`);
    }
  }

  if (MODE === 'revert') {
    const st = JSON.parse(fs.readFileSync('/root/trailing-comma-state.json', 'utf8'));
    const backup = JSON.parse(fs.readFileSync(st.backup, 'utf8'));
    for (const b of backup) await col.updateOne({ domainId: 'system', docType: 10, docId: b.docId }, { $set: { content: b.oldContent } });
    console.log(`reverted ${backup.length} problems from ${st.backup}`);
  }

  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
