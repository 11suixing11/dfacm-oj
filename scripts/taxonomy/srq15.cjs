const fs = require('fs');
const { MongoClient } = require('mongodb');

const MODE = process.argv[2] || 'verify';
const BASE = 'http://127.0.0.1:8888';
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

const SOL = {
  4806: { code: '#include <iostream>\nint main(){std::cout<<2+4<<" "<<10-2-4;}', ans: '6 4' },
  4807: { code: '#include <iostream>\nint main(){std::cout<<12<<" "<<23;}', ans: '12 23' },
  4818: { code: '#include <iostream>\n#include <cmath>\nint main(){std::cout<<10000*pow(1.035,5)<<" "<<10000*pow(1.04,5);}', ans: '11876.9 12166.5' },
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
  const cookies = (res.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
  return cookies;
}

const NONFINAL = new Set([0, 20, 21, 22, 23, 24, 25]);

async function main() {
  const cookies = await login();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('hydro');

  if (MODE === 'verify' || MODE === 'apply') {
    const rids = {};
    for (const [docId, s] of Object.entries(SOL)) {
      const res = await fetch(BASE + '/p/' + docId + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies },
        body: new URLSearchParams({ lang: 'cc.cc17o2', code: s.code }).toString(),
        redirect: 'manual',
      });
      const loc = res.headers.get('location') || '';
      const rid = (loc.match(/record\/([0-9a-f]{24})/) || [])[1];
      rids[docId] = rid;
      console.log('submit ' + docId + ' -> ' + res.status + ' rid=' + rid);
      if (!rid) { console.log('  body:', (await res.text()).slice(0, 300)); }
    }
    const t0 = Date.now();
    const status = {};
    while (Date.now() - t0 < 240000) {
      let pending = 0;
      for (const [docId, rid] of Object.entries(rids)) {
        if (!rid || status[docId] !== undefined) continue;
        const r = await db.collection('record').findOne({ _id: new (require('mongodb').ObjectId)(rid) });
        if (r && !NONFINAL.has(r.status)) status[docId] = r.status;
        else pending++;
      }
      if (!pending) break;
      await new Promise(r => setTimeout(r, 5000));
    }
    const final = {};
    for (const [docId, rid] of Object.entries(rids)) final[docId] = status[docId];
    fs.writeFileSync('/root/srq15-verify.json', JSON.stringify({ rids, final }, null, 1));
    const allAC = Object.keys(SOL).length === Object.values(final).filter(s => s === 1).length;
    console.log('verify: ' + JSON.stringify(final));
    console.log(allAC ? 'ALL_AC' : 'NOT_ALL_AC');

    if (MODE === 'apply' && allAC) {
      const col = db.collection('document');
      const backup = [];
      for (const [docId, s] of Object.entries(SOL)) {
        const p = await col.findOne({ domainId: 'system', docType: 10, docId: +docId });
        let c = p.content || '';
        if (typeof c === 'string' && c.trim().startsWith('{')) { try { c = JSON.parse(c).zh || c; } catch (e) {} }
        backup.push({ docId: +docId, oldContent: p.content });
        const sample = '\n## \u6837\u4f8b\n\n```output1\n' + s.ans + '\n```\n';
        let nc;
        if (c.includes('## \u6837\u4f8b\u8bf4\u660e')) nc = c.replace('## \u6837\u4f8b\u8bf4\u660e', sample + '\n## \u6837\u4f8b\u8bf4\u660e');
        else nc = c.replace(/\s+$/, '') + '\n' + sample;
        await col.updateOne({ domainId: 'system', docType: 10, docId: +docId }, { $set: { content: nc } });
      }
      fs.writeFileSync('/root/backups/srq15-samples-backup-20261007.json', JSON.stringify(backup));
      console.log('APPLIED ' + Object.keys(SOL).length + ' sample updates');
    }
  }

  if (MODE === 'cleanup') {
    const v = JSON.parse(fs.readFileSync('/root/srq15-verify.json', 'utf8'));
    const ridList = Object.values(v.rids).filter(Boolean).map(r => new (require('mongodb').ObjectId)(r));
    const r1 = await db.collection('record').deleteMany({ _id: { $in: ridList } });
    const r2 = await db.getCollection('document.status').deleteMany({ rid: { $in: v.rids && Object.values(v.rids) || [] } });
    console.log('deleted records=' + r1.deletedCount + ' psdocs=' + r2.deletedCount);
  }
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
