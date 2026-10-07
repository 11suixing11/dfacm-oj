const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BASE = 'http://127.0.0.1:8888';
const BATCH = process.argv[2] || '/root/sol-batch.json';
const DRY = process.argv.includes('--dry');
const NONFINAL = new Set([0, 20, 21, 22, 23, 24, 25]);

const MARK = '\u3010\u672c\u9898\u89e3\u7531\u7ad9\u957f\u7f16\u5199\u3011';
function compose(e) {
  return MARK + '\n\n' + e.t + '\n\n**\u4ee3\u7801\uff08C++17\uff09**\n\n```cpp\n' + e.c + '\n```';
}

async function login() {
  const y = fs.readFileSync('/root/.hydro/judge.yaml', 'utf8');
  const uname = (y.match(/uname:\s*(\S+)/) || [])[1];
  const password = (y.match(/password:\s*(\S+)/) || [])[1];
  const res = await fetch(BASE + '/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ uname, password }).toString(),
    redirect: 'manual',
  });
  if (res.status !== 302) throw new Error('login failed ' + res.status);
  return (res.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
}

async function main() {
  const entries = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
  const cookies = await login();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('hydro');
  const col = db.collection('document');

  // skip problems that already carry our solution
  const todo = [];
  for (const e of entries) {
    const exist = await col.findOne({ domainId: 'system', docType: 11, parentId: e.docId, content: { $regex: '^\u3010\u672c\u9898\u89e3' } });
    if (exist) console.log('skip ' + e.docId + ' (already has editorial)');
    else todo.push(e);
  }
  console.log('batch=' + entries.length + ' todo=' + todo.length);

  // snapshot counters
  const snap = {};
  for (const e of todo) {
    const p = await col.findOne({ domainId: 'system', docType: 10, docId: e.docId }, { nSubmit: 1, nAccept: 1 });
    snap[e.docId] = { nS: p && (p.nSubmit || 0), nA: p && (p.nAccept || 0) };
  }
  fs.writeFileSync('/root/sol-counter-snap.json', JSON.stringify(snap, null, 1));

  if (DRY) { console.log('DRY: no submission'); await client.close(); return; }

  const ready = [];
  const failed = [];
  for (const e of todo) {
    const res = await fetch(BASE + '/p/' + e.docId + '/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies },
      body: new URLSearchParams({ lang: 'cc.cc17o2', code: e.c }).toString(),
      redirect: 'manual',
    });
    const rid = ((res.headers.get('location') || '').match(/record\/([0-9a-f]{24})/) || [])[1];
    if (!rid) { console.log('SUBMIT_FAIL ' + e.docId + ' ' + res.status); failed.push(e.docId); continue; }
    let status = -1;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const r = await db.collection('record').findOne({ _id: new ObjectId(rid) });
      if (r && !NONFINAL.has(r.status)) { status = r.status; break; }
    }
    if (status === 1) {
      ready.push({ pid: e.docId, content: compose(e), rid });
      console.log('AC ' + e.docId);
    } else {
      console.log('NOT_AC ' + e.docId + ' status=' + status);
      failed.push(e.docId);
      await db.collection('record').deleteOne({ _id: new ObjectId(rid) });
    }
  }
  fs.writeFileSync('/root/sol-ready.json', JSON.stringify(ready, null, 1));
  console.log('ready=' + ready.length + ' failed=' + failed.length);

  // cleanup: verification records + uid3 psdocs + counter restore
  for (const r of ready) {
    await db.collection('record').deleteOne({ _id: new ObjectId(r.rid) });
    await db.collection('document.status').deleteMany({ domainId: 'system', uid: 3, docId: r.pid });
  }
  const snapNow = JSON.parse(fs.readFileSync('/root/sol-counter-snap.json', 'utf8'));
  for (const [pid, v] of Object.entries(snapNow)) {
    if (!ready.find(r => String(r.pid) === pid)) continue;
    await col.updateOne({ domainId: 'system', docType: 10, docId: +pid }, { $set: { nSubmit: v.nS, nAccept: v.nA } });
  }
  console.log('cleaned + counters restored');
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
