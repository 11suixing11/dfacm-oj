// Deep-basic sample patch (replaces the cron path that stalled for 10 hours).
//
// Why the cron never fired: it only *polled* the records submitted while the
// hydroac relay was down. Those records sit at status 0/20/21 forever, so
// `applyonly` aborted on every tick. This script re-submits instead.
//
// What it fixes relative to the previous version:
//   - re-submits (the cron never did)
//   - snapshots and restores nSubmit/nAccept, so the RP system is not fed the
//     verification submissions (the old `cleanup` deleted records but left the
//     counters inflated)
//   - `cleanup` no longer deletes document.status rows by docId alone. That
//     filter also matched real users' AC markers and silently dropped their RP;
//     it is now scoped to the judge account uid read from judge.yaml.
//   - `db.getCollection()` is a mongosh helper and does not exist in the Node
//     driver, so the old cleanup would have thrown before deleting anything
//   - preserves the `{"zh": "..."}` storage shape instead of flattening it
//   - emits input1 + output1 as a pair: every sample in this library is a pair,
//     there is no output1-only precedent
//   - stages every new body and flushes the backup BEFORE touching the database
//   - skips problems that already carry a sample, so re-runs are no-ops
//
// Usage (on the server):
//   node /root/srq15.cjs reset    # drop judge-account records, recompute counters
//   node /root/srq15.cjs verify   # submit all 15, poll, require 15/15 AC
//   node /root/srq15.cjs apply    # write the samples (backs up first)
//   node /root/srq15.cjs cleanup  # delete verification records, restore counters
//   node /root/srq15.cjs report   # per-problem sample / counter state
//   node /root/srq15.cjs rollback # remove the sample block again (exact inverse)
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

const MODE = process.argv[2] || 'verify';
const BASE = 'http://127.0.0.1:8888';
const STATE = '/root/srq15-state.json';
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const SOL = {
  4806: { code: '#include <iostream>\nint main(){std::cout<<2+4<<" "<<10-2-4;}', ans: '6 4' },
  4807: { code: '#include <iostream>\nint main(){std::cout<<12<<" "<<23;}', ans: '12 23' },
  // 五年定存 is simple interest on the remote judge: 10000*(1+0.04*5)=12000.
  // The 10-07 batch assumed 10000*1.04^5=12166.5 and the submission came back
  // "On line 1: Read 12166.5, expect 12000"; probe rid 6ac68428a1cd796076ca6ded
  // (compound A + simple B) proves the computation, not just the literal.
  4818: { code: '#include <iostream>\n#include <cmath>\nint main(){std::cout<<10000*pow(1.035,5)<<" "<<10000*(1+0.04*5);}', ans: '11876.9 12000' },
  4824: { code: '#include <iostream>\nint main(){std::cout<<100.0/3;}', ans: '33.3333' },
  4825: { code: '#include <iostream>\nint main(){std::cout<<13<<"\\n"<<"R";}', ans: '13\nR' },
  4826: { code: '#include <iostream>\n#include <cmath>\nint main(){double v=4.0/3*3.141593*(64+1000);std::cout<<(int)cbrt(v);}', ans: '16' },
  4827: { code: '#include <iostream>\nint main(){std::cout<<50;}', ans: '50' },
  4832: { code: '#include <iostream>\nint main(){std::cout<<14/4<<"\\n"<<14/4*4<<"\\n"<<14%4;}', ans: '3\n12\n2' },
  4843: { code: '#include <iostream>\nint main(){std::cout<<2*3.141593*5<<"\\n"<<3.141593*25<<"\\n"<<4.0/3*3.141593*125;}', ans: '31.4159\n78.5398\n523.599' },
  4854: { code: '#include <iostream>\nint main(){std::cout<<22;}', ans: '22' },
  4865: { code: '#include <iostream>\nint main(){std::cout<<9;}', ans: '9' },
  4876: { code: '#include <iostream>\nint main(){std::cout<<140;}', ans: '140' },
  4887: { code: '#include <iostream>\nint main(){std::cout<<27;}', ans: '27' },
  4898: { code: '#include <iostream>\nint main(){std::cout<<200<<" "<<280;}', ans: '200 280' },
  4909: { code: '#include <iostream>\nint main(){std::cout<<12<<" "<<47;}', ans: '12 47' },
};
// @hydrooj/common STATUS: 0 waiting, 1 AC, 2 WA, 6 RE, 7 CE, 8 system error,
// 20 judging, 21 compiling, 22 fetched. Anything in NONFINAL is still in flight.
const NONFINAL = new Set([0, 20, 21, 22, 23, 24, 25]);

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
  if (res.status !== 302) throw new Error('login failed: ' + res.status);
  return (res.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
}

const splitShape = (raw) => {
  const s = String(raw == null ? '' : raw);
  if (s.trim().startsWith('{')) {
    try { const j = JSON.parse(s); return { shape: 'json', json: j, body: j.zh != null ? j.zh : s }; } catch (e) { /* fall through */ }
  }
  return { shape: 'plain', json: null, body: s };
};
const joinShape = (st, body) => (st.shape === 'json' ? JSON.stringify({ ...st.json, zh: body }) : body);
const hasSample = (body) => /```input1|<code class="language-input1"|## 样例/.test(body);

const judgeUidFromYaml = () => {
  const y = fs.readFileSync('/root/.hydro/judge.yaml', 'utf8');
  const m = y.match(/^\s*uid:\s*(\d+)/m) || y.match(/uid:\s*(\d+)/);
  return m ? Number(m[1]) : 3;
};

function sampleBlock(ans) {
  return '## 样例\n\n本题无输入，输出固定为：\n\n```input1\n无\n```\n\n```output1\n' + ans + '\n```\n';
}

async function main() {
  const cookies = await login();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('hydro');
  const col = db.collection('document');
  const rec = db.collection('record');
  const psdoc = db.collection('document.status');

  const ids = Object.keys(SOL).map(Number);
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};

  if (MODE === 'verify') {
    // snapshot counters BEFORE submitting, so cleanup can restore them
    const snap = {};
    for (const d of ids) {
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { nSubmit: 1, nAccept: 1 } });
      snap[d] = { nSubmit: p.nSubmit || 0, nAccept: p.nAccept || 0 };
    }
    const rids = {};
    for (const [docId, s] of Object.entries(SOL)) {
      const res = await fetch(`${BASE}/p/${docId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies },
        body: new URLSearchParams({ lang: 'cc.cc17o2', code: s.code }).toString(),
        redirect: 'manual',
      });
      const rid = ((res.headers.get('location') || '').match(/record\/([0-9a-f]{24})/) || [])[1];
      rids[docId] = rid;
      console.log(`submit ${docId} -> ${res.status} rid=${rid || 'NONE'}`);
      if (!rid) console.log('   body:', (await res.text()).replace(/\s+/g, ' ').slice(0, 200));
    }
    const t0 = Date.now();
    const status = {};
    while (Date.now() - t0 < 600000) {
      let pending = 0;
      for (const [docId, rid] of Object.entries(rids)) {
        if (!rid || status[docId] !== undefined) continue;
        const r = await rec.findOne({ _id: new ObjectId(rid) });
        if (r && !NONFINAL.has(r.status)) status[docId] = r.status;
        else pending++;
      }
      console.log(`   pending=${pending} resolved=${Object.keys(status).length}/${Object.keys(SOL).length}`);
      if (!pending) break;
      await new Promise((r) => setTimeout(r, 8000));
    }
    const final = {};
    for (const [docId, rid] of Object.entries(rids)) final[docId] = rid ? (status[docId] === undefined ? 'TIMEOUT' : status[docId]) : 'NO_RID';
    fs.writeFileSync(STATE, JSON.stringify({ rids, snap, final, at: new Date().toISOString() }, null, 1));
    const ac = Object.values(final).filter((s) => s === 1).length;
    console.log('final:', JSON.stringify(final));
    console.log(`AC ${ac}/${Object.keys(SOL).length} -> ${ac === Object.keys(SOL).length ? 'ALL_AC' : 'NOT_ALL_AC'}`);
    console.log('state written to ' + STATE);
  }

  if (MODE === 'rollback') {
    // The 10-08 first apply run wrote the DB rows but crashed before the backup
    // file (Date.now().toISOString), so rebuild the originals by removing the
    // exact block that was inserted. The insertion is deterministic:
    //   body := body.replace(/\s+$/,'')
    //   body := body.slice(0,anchor) + '\n\n' + block + body.slice(anchor)   (anchor>0)
    //        | body + '\n\n' + block                                        (otherwise)
    const backup = [];
    for (const [docId, s] of Object.entries(SOL)) {
      const q = { domainId: 'system', docType: 10, docId: +docId };
      const p = await col.findOne(q);
      const st = splitShape(p.content);
      const block = sampleBlock(s.ans);
      if (!st.body.includes(block)) { console.log(`  ${docId}: block not present, nothing to roll back`); continue; }
      let orig;
      if (st.body.includes('\n\n' + block)) orig = st.body.split('\n\n' + block).join('\n');
      else orig = st.body.slice(0, -('\n\n' + block).length);
      backup.push({ docId: +docId, oldContent: joinShape(st, orig) });
      console.log(`  ${docId}: rolled back (${orig.length} chars, hasSample=${hasSample(orig)})`);
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const f = `/root/backups/srq15-samples-rollback-${stamp}.json`;
    fs.writeFileSync(f, JSON.stringify(backup));
    for (const b of backup) await col.updateOne({ domainId: 'system', docType: 10, docId: b.docId }, { $set: { content: b.oldContent } });
    console.log(`restored ${backup.length} contents; backup -> ${f}`);
  }

  if (MODE === 'apply') {
    if (!state.final) throw new Error('no state; run verify first');
    const bad = Object.entries(state.final).filter(([, s]) => s !== 1);
    if (bad.length) throw new Error('refusing to apply, not all AC: ' + JSON.stringify(bad));

    // Stage every new body first and flush the backup BEFORE touching the
    // database, so a crash can never leave the library ahead of its backup.
    const staged = [];
    const backup = [];
    for (const [docId, s] of Object.entries(SOL)) {
      const q = { domainId: 'system', docType: 10, docId: +docId };
      const p = await col.findOne(q);
      const st = splitShape(p.content);
      if (hasSample(st.body)) { console.log(`skip ${docId} (already has a sample)`); continue; }
      backup.push({ docId: +docId, oldContent: p.content });
      const block = sampleBlock(s.ans);
      let body = st.body.replace(/\s+$/, '');
      const anchor = body.search(/\n## (提示|说明|数据范围|题目背景)/);
      body = anchor > 0 ? body.slice(0, anchor) + '\n\n' + block + body.slice(anchor) : body + '\n\n' + block;
      staged.push({ docId: +docId, q, content: joinShape(st, body) });
    }
    if (backup.length) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      const f = `/root/backups/srq15-samples-backup-${stamp}.json`;
      fs.writeFileSync(f, JSON.stringify(backup));
      console.log('backup -> ' + f);
    }
    for (const s of staged) await col.updateOne(s.q, { $set: { content: s.content } });
    console.log(`applied=${staged.length} skipped=${Object.keys(SOL).length - staged.length}`);
  }

  if (MODE === 'reset') {
    // Establish a clean baseline: drop every judge-account record on the target
    // problems (all of them are verification artefacts - the judge uid is the
    // hidden hydsvc account), then recompute nSubmit/nAccept from what is left.
    const judgeUid = judgeUidFromYaml();
    const before = await rec.find({ uid: judgeUid, pid: { $in: ids } }).project({ _id: 1, pid: 1, status: 1 }).toArray();
    const d = await rec.deleteMany({ uid: judgeUid, pid: { $in: ids } });
    const dp = await psdoc.deleteMany({ uid: judgeUid, docId: { $in: ids } });
    console.log(`judge uid=${judgeUid}: removed records=${d.deletedCount} psdoc=${dp.deletedCount}`);
    const fixed = [];
    for (const id of ids) {
      const [nSubmit, nAccept] = await Promise.all([
        rec.countDocuments({ pid: id }),
        rec.countDocuments({ pid: id, status: 1 }),
      ]);
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: id }, { projection: { nSubmit: 1, nAccept: 1 } });
      const changed = (p.nSubmit || 0) !== nSubmit || (p.nAccept || 0) !== nAccept;
      if (changed) {
        await col.updateOne({ domainId: 'system', docType: 10, docId: id }, { $set: { nSubmit, nAccept } });
        fixed.push(`${id}: ${p.nSubmit}/${p.nAccept} -> ${nSubmit}/${nAccept}`);
      }
      console.log(`  #${id} counters ${p.nSubmit}/${p.nAccept} -> ${nSubmit}/${nAccept}${changed ? ' (fixed)' : ''}`);
    }
    console.log('corrected:', fixed.length);
    console.log('psdoc rows left for real users:', await psdoc.countDocuments({ docId: { $in: ids }, uid: { $ne: judgeUid } }));
  }

  if (MODE === 'cleanup') {
    const rids = Object.values((state.rids || {})).filter(Boolean);
    const oid = rids.map((r) => new ObjectId(r));
    // Only the hidden judge account. Scoping by uid is not optional: a plain
    // {docId: {$in: ids}} filter also wipes real users' document.status rows and
    // silently drops their RP.
    const judgeUid = Number((fs.readFileSync('/root/.hydro/judge.yaml', 'utf8').match(/uid:\s*(\d+)/) || [])[1] || 3);
    const r1 = await rec.deleteMany({ _id: { $in: oid } });
    const r1b = await rec.deleteMany({ uid: judgeUid, pid: { $in: ids } });
    const r2 = await psdoc.deleteMany({ rid: { $in: rids } });
    const r3 = await psdoc.deleteMany({ uid: judgeUid, docId: { $in: ids } });
    let restored = 0;
    for (const [d, snap] of Object.entries(state.snap || {})) {
      await col.updateOne({ domainId: 'system', docType: 10, docId: +d }, { $set: { nSubmit: snap.nSubmit, nAccept: snap.nAccept } });
      restored++;
    }
    console.log(`deleted records(state)=${r1.deletedCount} records(all judge-account on targets)=${r1b.deletedCount} psdoc(rid)=${r2.deletedCount} psdoc(judge uid)=${r3.deletedCount} countersRestored=${restored}`);
    console.log('remaining judge-account records on targets:', await rec.countDocuments({ uid: judgeUid, pid: { $in: ids } }));
    console.log('remaining psdoc rows for real users on targets:', await psdoc.countDocuments({ docId: { $in: ids }, uid: { $ne: judgeUid } }));
  }

  if (MODE === 'report') {
    for (const d of ids) {
      const p = await col.findOne({ domainId: 'system', docType: 10, docId: d }, { projection: { title: 1, content: 1, nSubmit: 1, nAccept: 1 } });
      const st = splitShape(p.content);
      const ok = hasSample(st.body);
      console.log(`#${d} ${ok ? 'SAMPLE_OK ' : 'NO_SAMPLE'} nS=${p.nSubmit} nA=${p.nAccept} "${(p.title || '').slice(0, 26)}"`);
      const m = st.body.match(/## 样例[\s\S]{0,160}/);
      if (m) console.log('    ' + m[0].replace(/\n/g, ' | '));
    }
  }

  await client.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
