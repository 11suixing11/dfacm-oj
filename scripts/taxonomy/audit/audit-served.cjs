// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Ground-truth pass: fetch every problem page from the live site and look at what
// the browser actually gets. This is the only way to judge formula rendering —
// the stored `html` flag decides whether markdown-it/KaTeX runs at all.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const HOST = process.env.HOST_HEADER || 'dfacm.website';
const BASE = 'http://127.0.0.1:8888';

const stripTags = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#92;/g, '\\').replace(/\s+/g, ' ');

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc.find({ domainId: 'system', docType: 10 }).project({ docId: 1, title: 1, html: 1, tag: 1, hidden: 1 }).sort({ docId: 1 }).toArray();

  const plans = await doc.find({ dag: { $exists: true } }).project({ docId: 1, dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  const res = { err: {}, flag: {} };
  const flag = (k, d, ev) => { (res.flag[k] = res.flag[k] || []).push({ d, ev }); };
  let done = 0;
  const CONC = 16;

  async function one(p) {
    const pid = p.docId;
    let html;
    try {
      const r = await fetch(`${BASE}/p/${pid}`, { headers: { host: HOST, 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(30000) });
      if (r.status !== 200) { (res.err[pid] = res.err[pid] || []).push('HTTP' + r.status); return; }
      html = await r.text();
    } catch (e) { (res.err[pid] = res.err[pid] || []).push(String(e.message).slice(0, 60)); return; }

    // visible text of the statement body only
    const m = html.match(/<div class="typo richmedia"[\s\S]*?<\/div>\s*(?:<div class="problem-actions|$)/);
    const body = m ? m[0] : html;

    // 1. literal $ visible to the reader (unrendered math delimiters)
    const vis = stripTags(body.replace(/<pre[\s\S]*?<\/pre>/g, ''));
    const dollars = (vis.match(/(?:^|\s)\$+\S?/g) || []).length;
    if (dollars) flag('S1_literal_dollar_visible', pid, `count=${dollars} "${vis.match(/.{0,40}\$.{0,40}/)[0].trim()}"`);
    // 2. KaTeX error markup
    if (/katex-error/.test(body)) flag('S2_katex_error', pid, 'katex-error');
    if (/katex/.test(body) && !/katex-display/.test(body) && /class="katex"/.test(body)) flag('S2b_katex_unrendered', pid, 'class="katex"');
    // 3. unrendered MathJax / raw TeX commands in visible text
    const tex = vis.match(/\\(frac|sum|sqrt|begin|mathbb|cdot|times|leq|geq|alpha|beta)\b/);
    if (tex) flag('S3_raw_tex_visible', pid, `"${vis.match(/.{0,40}\\[a-z]{2,}.{0,30}/)[0].trim()}"`);
    // 4. escaped backslash double-display artefact
    if (/&#92;/.test(body)) flag('S4_escaped_backslash', pid, '&#92;');
    // 5. broken image references
    for (const im of body.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = im[1];
      if (/^\/(p|file|public)\//.test(src) || /^\.\//.test(src)) {
        const u = src.startsWith('/') ? BASE + src : `${BASE}/p/${pid}/` + src;
        try {
          const ir = await fetch(u.startsWith('http') ? u : u, { headers: { host: HOST }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
          if (ir.status >= 400) { flag('S5_broken_image', pid, `${ir.status} ${src.slice(0, 90)}`); break; }
        } catch (e) { flag('S5b_image_fetch_error', pid, `${e.message.slice(0, 30)} ${src.slice(0, 70)}`); break; }
      } else if (/^https?:\/\//.test(src)) {
        flag('S6_external_image', pid, src.slice(0, 110));
      }
    }
    // 6. sample block present on the page?
    if (!/language-input|sample-input|样例输入|Sample Input/i.test(body)) flag('S7_no_sample_on_page', pid);
    // 7. title renders?
    if (!/<title>.+?<\/title>/.test(html) || /<title><\/title>/.test(html)) flag('S8_no_title_render', pid, (p.title || '').slice(0, 40));
  }

  const queue = probs.slice();
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (queue.length) {
        const p = queue.shift();
        await one(p);
        if (++done % 500 === 0) console.log(`  ...${done}/${probs.length}`);
      }
    })
  );

  console.log(`\n=== served-page scan: ${probs.length} pages, errors=${Object.keys(res.err).length} ===`);
  const errKeys = Object.keys(res.err);
  if (errKeys.length) console.log('  error sample:', errKeys.slice(0, 10).map((k) => `${k}:${res.err[k][0]}`).join(' '));
  for (const k of Object.keys(res.flag).sort()) {
    const v = res.flag[k];
    console.log(`  ${k.padEnd(28)} total=${String(v.length).padStart(5)}  inPlan=${String(v.filter((x) => inPlan.has(x.d)).length).padStart(4)}`);
  }
  console.log('\n=== evidence (first 5 per class) ===');
  for (const k of Object.keys(res.flag).sort()) {
    console.log(`-- ${k}`);
    for (const x of res.flag[k].slice(0, 5)) console.log(`   #${x.d}${inPlan.has(x.d) ? ' (inPlan)' : ''} ${x.ev || ''}`);
  }
  fs.writeFileSync('/root/audit-served.json', JSON.stringify({ flags: res.flag, err: res.err }, null, 1));
  await c.close();
})();
