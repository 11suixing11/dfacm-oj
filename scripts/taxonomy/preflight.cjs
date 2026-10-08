// Pre-flight a whole batch before touching the judge: compile every entry and
// run it against that problem's real test inputs, printing got vs expected.
// Catches wrong output formats and misread semantics locally, where the
// iteration loop is seconds instead of a judge round trip.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const decode = (f) => Buffer.from(f.etag, 'base64').toString();

const BATCH = process.argv[2] || '/root/lq-batch-07.json';
const CACHE = '/tmp/preflight-src';
fs.mkdirSync(CACHE, { recursive: true });

(async () => {
  const entries = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  let totalCases = 0, totalOK = 0;
  const failed = [];

  for (const e of entries) {
    const p = await db.collection('document').findOne({ domainId: 'system', docType: 10, docId: e.docId }, { projection: { title: 1, data: 1 } });
    const src = `${CACHE}/${e.docId}.cpp`;
    const bin = `${CACHE}/${e.docId}`;
    fs.writeFileSync(src, e.c);
    try {
      execFileSync('g++', ['-O2', '-std=gnu++17', src, '-o', bin], { stdio: 'pipe', timeout: 60000 });
    } catch (err) {
      console.log(`#${e.docId} ${(p.title || '').slice(0, 34).padEnd(36)} COMPILE FAIL`);
      console.log('   ' + String(err.stderr || err.message).split('\n').slice(0, 3).join(' | ').slice(0, 200));
      failed.push(e.docId);
      continue;
    }
    const ins = (p.data || []).map((f) => f.name).filter((n) => /\.in$/.test(n)).sort((a, b) => parseInt(a) - parseInt(b));
    const read = (n) => {
      const f = (p.data || []).find((x) => x.name === n);
      return f ? fs.readFileSync(decode(f), 'utf8') : null;
    };
    let ok = 0, bad = [], noData = false;
    for (const n of ins) {
      const input = read(n);
      const want = (read(n.replace('.in', '.out')) || '').trim();
      let got;
      // maxBuffer matters: Node caps captured stdout at 1MB by default, and a
      // problem like #4224 emits 100000 sorted lines (~1.9MB). Without this the
      // run dies with ENOBUFS and reports a RUNFAIL that looks exactly like a
      // wrong answer or a timeout, which sends you hunting a bug you don't have.
      try { got = execFileSync(bin, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024 }).trim(); }
      catch (err) {
        const why = err.code === 'ENOBUFS' ? 'ENOBUFS (output over maxBuffer)'
          : err.signal === 'SIGTERM' ? 'TIMEOUT over 15s'
          : err.code || String(err.message).slice(0, 60);
        got = `RUNFAIL ${why}`;
      }
      totalCases++;
      if (got === want) ok++;
      else bad.push(`${n.replace('.in', '')}: got ${JSON.stringify(got.slice(0, 40))} want ${JSON.stringify(want.slice(0, 40))}`);
    }
    if (!ins.length) noData = true;
    totalOK += ok;
    const mark = noData ? 'NO-DATA' : bad.length ? 'FAIL' : 'PASS';
    console.log(`#${e.docId} ${(p.title || '').slice(0, 34).padEnd(36)} ${mark}  ${ok}/${ins.length}`);
    for (const b of bad.slice(0, 3)) console.log('     ' + b);
    if (bad.length) failed.push(e.docId);
  }
  console.log(`\ncases ${totalOK}/${totalCases} matched; problems with failures: ${failed.length ? failed.join(',') : '(none)'}`);
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
