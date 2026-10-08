// Un-escape HTML entities that live INSIDE $..$ spans.
//
// Flipping html:"" routes content through markdown-it, which renders KaTeX but
// passes the entity `&#44;` straight into the math, where it cannot be parsed.
// The affected expression then prints literally while its neighbours render --
// a worse appearance than the uniformly-unrendered state we started from.
//
// Scope guard: only touch entities inside a $...$ span, and only the ones KaTeX
// understands as characters. Text outside math keeps its entities, because that
// is valid HTML and changing it would be gratuitous.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BASE = 'http://127.0.0.1:8888';
const HOST = 'dfacm.website';

const MODE = process.argv[2] || 'plan'; // plan | apply | verify | revert

// Entities KaTeX cannot parse inside math but which have a plain-character
// equivalent. Keep this list tight: only numeric/named entities for characters
// that legitimately occur in formulae.
const IN_MATH = { '&#44;': ',', '&comma;': ',', '&#44': ',' };

function fixMathEntities(raw) {
  let changed = 0;
  const out = String(raw).replace(/\$([^$\n]{1,400})\$/g, (whole, body) => {
    let b = body;
    for (const [ent, ch] of Object.entries(IN_MATH)) {
      if (b.includes(ent)) { changed += b.split(ent).length - 1; b = b.split(ent).join(ch); }
    }
    return '$' + b + '$';
  });
  return { out, changed };
}

const measure = async (id) => {
  const r = await fetch(`${BASE}/p/${id}`, { headers: { host: HOST } });
  const html = await r.text();
  const m = /<div class="section__body typo richmedia"[^>]*>/.exec(html);
  if (!m) return { id, err: 'no container' };
  const rest = html.slice(m.index + m[0].length);
  const e = rest.search(/<div class="section side section--problem-sidebar"|<div class="section__header"|<section class="section"|<div id="problem-/);
  const body = (e > 0 ? rest.slice(0, e) : rest).replace(/<script[\s\S]*?<\/script>/g, ' ');
  const vis = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  return {
    id,
    literalDollar: (vis.match(/(?:^|\s)\$+\S?/g) || []).length,
    katex: (body.match(/class="katex"/g) || []).length,
    katexError: /katex-error/.test(body),
  };
};

(async () => {
  const st = JSON.parse(fs.readFileSync('/root/htmltrue-state.json', 'utf8'));
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const col = db.collection('document');

  const targets = [];
  for (const d of st.applied) {
    const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { content: 1, title: 1 } });
    const { out, changed } = fixMathEntities(p.content);
    if (changed > 0) targets.push({ d, title: (p.title || '').slice(0, 40), changed, before: p.content, after: out });
  }

  console.log(`=== entities inside math ===`);
  console.log(`  problems: ${targets.length}  expressions: ${targets.reduce((a, t) => a + t.changed, 0)}`);
  for (const t of targets) {
    console.log(`  #${t.d} ${t.title.padEnd(40)} ${t.changed} expression(s)`);
    const ex = (t.after.match(/\$[^$\n]{1,80}\$/g) || []).find((s) => s.includes(','));
    if (ex) console.log(`      e.g. ${JSON.stringify(ex)}`);
  }

  if (MODE === 'apply') {
    const backup = targets.map((t) => ({ docId: t.d, title: t.title, oldContent: t.before }));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const f = `/root/backups/math-entities-${stamp}.json`;
    if (fs.existsSync(f)) throw new Error('backup exists: ' + f);
    fs.writeFileSync(f, JSON.stringify(backup, null, 1));
    console.log(`\nbackup -> ${f}`);
    for (const t of targets) {
      await col.updateOne({ domainId: 'system', docType: 10, docId: t.d }, { $set: { content: t.after } });
    }
    fs.writeFileSync('/root/math-entities-state.json', JSON.stringify({ ids: targets.map((t) => t.d), backup: f }, null, 1));
    console.log(`rewrote content on ${targets.length} problems`);

    console.log('\n=== verify (fetch the page, count what a reader sees) ===');
    for (const t of targets) {
      const before = await measure(t.d);
      await new Promise((r) => setTimeout(r, 400));
      console.log(`  #${t.d} literal$=${before.literalDollar} katex=${before.katex} katexError=${before.katexError}`);
    }
  }

  if (MODE === 'revert') {
    const es = JSON.parse(fs.readFileSync('/root/math-entities-state.json', 'utf8'));
    const backup = JSON.parse(fs.readFileSync(es.backup, 'utf8'));
    for (const b of backup) await col.updateOne({ domainId: 'system', docType: 10, docId: b.docId }, { $set: { content: b.oldContent } });
    console.log(`reverted ${backup.length} problems from ${es.backup}`);
  }

  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
