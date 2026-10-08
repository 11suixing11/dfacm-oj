// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Re-scan only the pages that 403'd in the first pass, low concurrency + retry,
// and capture the 403 body so the block source is identifiable.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const HOST = 'dfacm.website';
const BASE = 'http://127.0.0.1:8888';
const stripTags = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#92;/g, '\\').replace(/\s+/g, ' ');

// Kept byte-identical to audit-served.cjs on purpose: the two passes share one
// measurement definition, otherwise a page measured by pass one and pass two
// would not be comparable.
const CONTAINER_RE = /<div class="section__body typo richmedia"[^>]*>/;
function statementOf(html) {
  // Anchor on the class attribute, then walk to the tag's real `>`. Matching the
  // literal `<div class="section__body typo richmedia">` fails because Hydro
  // appends data-fragment-id after the class attribute.
  const m = CONTAINER_RE.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const end = rest.search(/<div class="section side section--problem-sidebar"|<section class="section"|<div class="section__header"|<div id="problem-/);
  return end > 0 ? rest.slice(0, end) : rest;
}
const statementOrNull = (html) => {
  const s = statementOf(html);
  return s === null ? null : s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
};

(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const prev = JSON.parse(fs.readFileSync('/root/audit-served.json', 'utf8'));
  const failed = Object.keys(prev.err).map(Number);
  console.log('retrying', failed.length, 'pages');

  const plans = await doc.find({ dag: { $exists: true } }).project({ dag: 1 }).toArray();
  const inPlan = new Set();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) inPlan.add(Number(p));

  const flags = prev.flags || {};
  const flag = (k, d, ev) => { (flags[k] = flags[k] || []).push({ d, ev }); };
  const still = [];
  let probe = null;
  let done = 0;

  async function one(pid) {
    let html = null;
    for (let a = 0; a < 3 && !html; a++) {
      try {
        const r = await fetch(`${BASE}/p/${pid}`, { headers: { host: HOST, 'user-agent': 'Mozilla/5.0 audit', 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(30000) });
        if (r.status === 200) html = await r.text();
        else { if (!probe) probe = `HTTP${r.status} :: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 260)}`; await new Promise((x) => setTimeout(x, 800 * (a + 1))); }
      } catch (e) { await new Promise((x) => setTimeout(x, 800 * (a + 1))); }
    }
    if (!html) { still.push(pid); return; }

    // Same correction as audit-served.cjs: the container is
    // `<div class="section__body typo richmedia">`, not `<div class="typo
    // richmedia">` (which never matched and silently measured the whole page),
    // and <script> must be dropped because window.UiContext embeds the statement
    // as JSON. See the long comment in audit-served.cjs.
    const body = statementOrNull(html);
    if (body === null) { still.push(pid); return; }
    const vis = stripTags(body.replace(/<pre[\s\S]*?<\/pre>/g, ''));
    const dollars = (vis.match(/(?:^|\s)\$+\S?/g) || []).length;
    if (dollars) flag('S1_literal_dollar_visible', pid, `count=${dollars} "${vis.match(/.{0,40}\$.{0,40}/)[0].trim()}"`);
    if (/katex-error/.test(body)) flag('S2_katex_error', pid, 'katex-error');
    if (/class="katex"/.test(body)) flag('S2c_katex_rendered', pid, `spans=${(body.match(/class="katex"/g) || []).length}`);
    const tex = vis.match(/\\(frac|sum|sqrt|begin|mathbb|cdot|times|leq|geq|alpha|beta)\b/);
    if (tex) flag('S3_raw_tex_visible', pid, `"${vis.match(/.{0,40}\\[a-z]{2,}.{0,30}/)[0].trim()}"`);
    if (/&#92;/.test(body)) flag('S4_escaped_backslash', pid, '&#92;');
    const escU = (body.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
    if (escU) flag('S4b_json_escape_visible', pid, `count=${escU}`);
    for (const im of body.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = im[1];
      if (/^(https?:\/\/)/.test(src)) { flag('S6_external_image', pid, src.slice(0, 110)); continue; }
      const u = BASE + (src.startsWith('/') ? src : `/p/${pid}/` + src);
      try {
        const ir = await fetch(u, { headers: { host: HOST }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
        if (ir.status >= 400) { flag('S5_broken_image', pid, `${ir.status} ${src.slice(0, 90)}`); break; }
      } catch (e) { flag('S5b_image_fetch_error', pid, `${e.message.slice(0, 30)} ${src.slice(0, 70)}`); break; }
    }
    if (!/language-input|sample-input|样例输入|Sample Input/i.test(body)) flag('S7_no_sample_on_page', pid);
    if (++done % 500 === 0) console.log(`  ...${done}/${failed.length}`);
  }

  const q = failed.slice();
  await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await one(q.shift()); }));

  console.log(`\n=== retry done: recovered=${failed.length - still.length} stillFailing=${still.length} ===`);
  if (probe) console.log('403 probe body:', probe);
  if (still.length) console.log('still failing:', still.slice(0, 30).join(','), still.length > 30 ? '...' : '');
  for (const k of Object.keys(flags).sort()) {
    const v = flags[k];
    console.log(`  ${k.padEnd(28)} total=${String(v.length).padStart(5)}  inPlan=${String(v.filter((x) => inPlan.has(x.d)).length).padStart(4)}`);
  }
  fs.writeFileSync('/root/audit-served.json', JSON.stringify({ flags, err: Object.fromEntries(still.map((d) => [d, ['retry-failed']])), probe }, null, 1));
  await c.close();
})();
