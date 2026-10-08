// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const HOST = 'dfacm.website';
const BASE = 'http://127.0.0.1:8888';
(async () => {
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');
  const probs = await doc.find({ domainId: 'system', docType: 10 }).project({ docId: 1, content: 1, data: 1, additional_file: 1 }).sort({ docId: 1 }).toArray();
  const byBatch = {};
  const cause = {};
  for (const p of probs) {
    const raw = String(p.content || '');
    const own = new Set([...(p.data || []).map((f) => f.name), ...(p.additional_file || []).map((f) => f.name)]);
    const imgs = [...raw.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    if (!imgs.length) continue;
    const b = p.docId <= 6 ? 'loj-head' : p.docId <= 623 ? 'csp24' : p.docId <= 842 ? 'loj' : p.docId <= 3675 ? 'cf' : p.docId <= 4071 ? 'ybt396' : p.docId <= 4325 ? 'lq' : p.docId <= 4805 ? 'ybtbas' : p.docId <= 4927 ? 'srqc' : 'patch';
    byBatch[b] = byBatch[b] || { imgs: 0, dead: 0 };
    byBatch[b].imgs += imgs.length;
    for (const src of imgs) {
      if (/^(https?:)?\/\//i.test(src)) continue;
      let dead = false, why = '';
      if (/^data:image\//i.test(src) && /&#44;|,/.test(src)) { dead = /&#44;/.test(src); why = 'base64 data-URI with escaped comma (&#44;)'; }
      else if (/^file:/i.test(src)) { dead = true; why = 'file:// src from hustoj import, extension stripped'; }
      else if (!/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(src.split('?')[0])) { dead = true; why = 'src has no image extension'; }
      else if (!own.has(src.split('/').pop().split('?')[0])) { dead = true; why = 'filename not in data[]/additional_file[]'; }
      if (dead) { byBatch[b].dead++; cause[why] = (cause[why] || 0) + 1; }
    }
  }
  console.log('=== dead figure references by import batch ===');
  for (const [b, v] of Object.entries(byBatch)) console.log(`  ${b.padEnd(10)} refs=${String(v.imgs).padStart(5)} dead=${String(v.dead).padStart(4)}`);
  console.log('\n=== dead-reference causes ===');
  for (const [k, v] of Object.entries(cause).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

  console.log('\n=== does the CSP base64 figure actually render? (served check) ===');
  for (const id of [617, 618, 619]) {
    const html = await (await fetch(`${BASE}/p/${id}`, { headers: { host: HOST } })).text();
    const srcs = [...html.matchAll(/<img[^>]+src="(data:image[^"]{0,60})/g)].map((m) => m[1]);
    console.log(`  #${id} served data-URI imgs: ${srcs.length}  first="${srcs[0] || 'none'}"`);
  }
  await c.close();
})();
