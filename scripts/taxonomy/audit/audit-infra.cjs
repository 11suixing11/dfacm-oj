// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// Infrastructure health: process, judge queue, error log, remote judge sources,
// cron, disk, route smoke, backup freshness.
const fs = require('fs');
const { execSync } = require('child_process');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const HOST = 'dfacm.website';
const BASE = 'http://127.0.0.1:8888';
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', timeout: 60000, maxBuffer: 32 << 20 }); } catch (e) { return 'ERR ' + (e.message || '').slice(0, 120); } };

(async () => {
  console.log('=== 1. processes ===');
  console.log(sh("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s))console.log(`  ${p.name.padEnd(16)} ${p.pm2_env.status.padEnd(9)} up=${Math.round((Date.now()-p.pm2_env.pm_uptime)/60000)}min restarts=${p.pm2_env.restart_time} rss=${Math.round(p.monit.memory/1048576)}MB`);})'").trim());

  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');

  console.log('\n=== 2. judge queue / records ===');
  console.log('  task queue by status:', JSON.stringify(await db.collection('task').aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()));
  console.log('  task by type:', JSON.stringify(await db.collection('task').aggregate([{ $group: { _id: '$type', n: { $sum: 1 } } }]).toArray()));
  const byStatus = await db.collection('record').aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  console.log('  records by status (1=AC 2=WA 20=Judging 21=Compiling 22=Fetched):', JSON.stringify(byStatus));
  const recent = await db.collection('record').aggregate([
    { $match: { judgeAt: { $gte: new Date(Date.now() - 3 * 86400000) } } },
    { $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } },
  ]).toArray();
  console.log('  records last 3d:', JSON.stringify(recent));
  console.log('  stale judging (>10min, status 20/21):', await db.collection('record').countDocuments({ status: { $in: [20, 21] }, judgeAt: { $lt: new Date(Date.now() - 600000) } }));

  console.log('\n=== 3. error log (last 24h) ===');
  const errLog = '/root/.pm2/logs/hydrooj-error.log';
  if (fs.existsSync(errLog)) {
    const size = fs.statSync(errLog).size;
    const txt = fs.readFileSync(errLog, 'utf8');
    const lines = txt.split('\n').filter(Boolean);
    const buckets = {};
    for (const l of lines) {
      const key = (l.match(/\[([a-zA-Z]+Error|\[E\]|MongoServerError|Error)\b/) || [])[1] || l.slice(0, 70);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`  log ${(size / 1048576).toFixed(1)}MB, ${lines.length} lines`);
    for (const [k, n] of top) console.log(`   ${String(n).padStart(5)}  ${k.replace(/\s+/g, ' ').slice(0, 100)}`);
    const recentErr = lines.slice(-400).filter((l) => /cannot GET|cannot POST|EADDR|timeout|ECONN|MongoServerError|\[E\]/.test(l));
    console.log('  --- last-400-line notable errors ---');
    for (const l of recentErr.slice(-15)) console.log('   ', l.replace(/\s+/g, ' ').slice(0, 150));
  } else console.log('  no error log');

  console.log('\n=== 4. remote judge sources ===');
  for (const [name, url] of [['srqc relay ws.hydrooj.com', 'https://ws.hydrooj.com/'], ['hydro.ac', 'https://hydro.ac/'], ['ybt remote (ybt训练)', 'https://hydro.ac/p/1000'], ['poj.org', 'http://poj.org/']]) {
    const t0 = Date.now();
    const code = sh(`curl -sk -o /dev/null -w '%{http_code}' --max-time 20 ${url}`).trim();
    console.log(`  ${name.padEnd(28)} ${code}  ${Date.now() - t0}ms`);
  }

  console.log('\n=== 5. cron ===');
  console.log(sh('crontab -l').trim().split('\n').map((l) => '  ' + l).join('\n'));
  console.log('  backup log tail:');
  console.log(sh('tail -4 /root/backups/backup.log').trim().split('\n').map((l) => '    ' + l).join('\n'));
  console.log('  newest backup file:');
  console.log(sh('ls -lt /root/backups/*.zip /root/backups/*.tar.gz 2>/dev/null | head -3').trim().split('\n').map((l) => '    ' + l).join('\n'));

  console.log('\n=== 6. disk / db ===');
  console.log(sh("df -h / /data 2>/dev/null | awk 'NR==1||/\\/$|\\/data/'").trim().split('\n').map((l) => '  ' + l).join('\n'));
  console.log('  mongo dataSize:', JSON.stringify(await db.command({ dbStats: 1 })).match(/"dataSize":([0-9.]+)/)?.[1] + ' MB');

  console.log('\n=== 7. route smoke ===');
  const routes = ['/', '/p', '/training', '/p/1', '/p/4072', '/p/4928', '/p/4806', '/p/2', '/p/646', '/p/1259', '/ranking', '/contest', '/user/1', '/status', '/setting', '/d/6abf552caaa235606eedfbee', '/d/6ac38fb88b364d5443b9ee22', '/d/6ac63618a1cd796076ca5dae'];
  for (const r of routes) {
    const t0 = Date.now();
    const out = sh(`curl -sk -o /dev/null -w '%{http_code}' -H 'Host: ${HOST}' ${BASE}${r}`);
    console.log(`  ${String(out).trim().padStart(4)}  ${r.padEnd(38)} ${Date.now() - t0}ms`);
  }

  console.log('\n=== 8. editorial route (new feature from 10-07) ===');
  for (const r of ['/p/4072/solution', '/p/1/solution', '/p/4245/solution']) {
    const out = sh(`curl -sk -o /dev/null -w '%{http_code}' -H 'Host: ${HOST}' ${BASE}${r}`);
    console.log(`  ${String(out).trim().padStart(4)}  ${r}`);
  }

  await c.close();
})();
