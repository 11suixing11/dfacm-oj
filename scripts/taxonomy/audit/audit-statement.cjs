// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Full-library statement-quality audit (system domain, docType 10) — v2, corrected
// additional_file field + evidence capture for every issue class.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const BATCH = [
  ['loj-head', (d) => d >= 2 && d <= 6],
  ['csp24', (d) => d >= 616 && d <= 623],
  ['loj', (d) => d >= 624 && d <= 842],
  ['cf', (d) => d >= 843 && d <= 3675],
  ['ybt396', (d) => d >= 3676 && d <= 4071],
  ['lq', (d) => d >= 4072 && d <= 4325],
  ['ybtbas', (d) => d >= 4326 && d <= 4805],
  ['srqc', (d) => d >= 4806 && d <= 4927],
  ['patch', (d) => d >= 4928 && d <= 4931],
];
const label = (d) => (BATCH.find(([, f]) => f(d)) || ['other'])[0];

const issues = {};
const add = (k, docId, batch, ev) => {
  (issues[k] = issues[k] || []).push({ d: docId, b: batch, ...(ev ? { ev } : {}) });
};
const plainText = (h) =>
  String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const snip = (s, n = 90) => String(s).replace(/\s+/g, ' ').slice(0, n);

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc
    .find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, title: 1, content: 1, html: 1, tag: 1, difficulty: 1, data: 1, additional_file: 1, nSubmit: 1, nAccept: 1, hidden: 1 })
    .toArray();
  probs.sort((a, b) => a.docId - b.docId);

  const counts = {};
  for (const p of probs) {
    const b = label(p.docId);
    counts[b] = (counts[b] || 0) + 1;
    const raw = typeof p.content === 'string' ? p.content : '';
    const txt = plainText(raw);
    const outsidePre = raw.replace(/<pre[\s\S]*?<\/pre>/g, '');
    const files = (p.data || []).map((f) => f.name).concat((p.additional_file || []).map((f) => f.name));

    if (txt.length < 60) add('A1_stub_statement', p.docId, b, `len=${txt.length} "${snip(txt, 60)}"`);
    if (!/language-input|sample_input|样例输入|```input|Sample Input/i.test(raw) && !/样例/.test(txt)) add('A2_no_sample', p.docId, b, `"${snip(txt, 70)}"`);
    if (/样例|输入样例/.test(txt) && !/language-output|output1|样例输出|输出样例/.test(raw + txt)) add('A3_sample_incomplete', p.docId, b, `"${snip(txt, 70)}"`);
    if (/\[pic\]|\[img\]|图片已丢失/im.test(raw)) add('A4_pic_placeholder', p.docId, b, snip((raw.match(/.{0,40}\[pic\].{0,40}/i) || [''])[0]));
    if (/class=["']?katex/i.test(raw)) add('A5_katex_residue', p.docId, b, /mjx-chtml/i.test(raw) ? 'mathjax-chtml' : 'katex-mathml');
    if (/\$\$?[^$\n]{0,300}?\\(frac|sum|sqrt|begin|mathbb|cdot|times|leq|geq)/.test(outsidePre)) add('A6_literal_tex', p.docId, b, snip((outsidePre.match(/.{0,30}\$\$[^$]{0,60}\\[a-z]+.{0,20}/) || [''])[0]));
    if (p.html === 'true' || p.html === true) add('A7_html_true_mode', p.docId, b);
    if (!p.difficulty || p.difficulty === 0) add('A8_difficulty_unrated', p.docId, b);
    if (!Array.isArray(p.tag) || p.tag.filter(Boolean).length === 0) add('A9_no_tag', p.docId, b);
    if (Array.isArray(p.tag) && p.tag.some((t) => !t || !String(t).trim())) add('A10_empty_tag', p.docId, b);
    if ((txt.match(/[\u3400-\u9fff]/g) || []).length < 5 && txt.length > 100) add('A11_english_statement', p.docId, b, `"${snip(txt, 60)}"`);
    for (const m of raw.matchAll(/(?:src|href)=["'](?:\/p\/\d+\/file\/|\.\/)?([^"'>]+)["']/g)) {
      const n = m[1].split('/').pop();
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(n) && !files.includes(n)) { add('A12_missing_image', p.docId, b, n); break; }
    }
    if (!files.length) add('A13_no_testdata', p.docId, b);

    const t = String(p.title || '').trim();
    if (!t) add('A14_no_title', p.docId, b);
    else if (t.length > 60) add('A14b_title_too_long', p.docId, b, `${t.length} "${snip(t)}"`);
    else if (/^(P|CF|LOJ|YBT|AT|J)\s*\d*$/i.test(t)) add('A14c_title_id_only', p.docId, b, t);
    else if (!/[\u3400-\u9fffA-Za-z0-9]/.test(t)) add('A14d_title_garbage', p.docId, b, JSON.stringify(t));
    else if (/^\s*【.*】\s*$/.test(t)) add('A14e_title_bracketed_only', p.docId, b, t);
  }

  // de-dup cross-view: which problems are inside a training plan (real user exposure)
  const plans = await doc.find({ dag: { $exists: true } }).project({ docId: 1, title: 1, dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  console.log('=== library: ' + probs.length + ' problems ===');
  console.log('batch sizes:', JSON.stringify(counts));
  console.log('problems inside a training plan:', inPlan.size);
  console.log('\n=== issues ===');
  const rows = [];
  for (const k of Object.keys(issues).sort()) {
    const v = issues[k];
    const inPlanN = v.filter((x) => inPlan.has(x.d)).length;
    rows.push([k, v.length, inPlanN]);
    console.log(`  ${k.padEnd(24)} total=${String(v.length).padStart(5)}  inPlan=${String(inPlanN).padStart(4)}`);
  }
  const all = Object.values(issues).flat().map((x) => x.d);
  console.log(`\nissue instances=${all.length}  distinct problems=${new Set(all).size}  clean=${probs.length - new Set(all).size}`);

  console.log('\n=== evidence (first 3 per class) ===');
  for (const k of Object.keys(issues).sort()) {
    console.log(`-- ${k}`);
    for (const x of issues[k].slice(0, 3)) console.log(`   #${x.d} [${x.b}] ${x.ev || ''}`);
  }
  fs.writeFileSync('/root/audit-statement.json', JSON.stringify({ issues, inPlan: [...inPlan], plans: plans.map((p) => ({ docId: String(p.docId), title: p.title })) }, null, 1));
  await c.close();
})();
