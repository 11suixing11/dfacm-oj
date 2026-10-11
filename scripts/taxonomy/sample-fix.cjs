// One-off statement repair, applied on 2026-10-11 (run on the OJ server).
//
// Ten 一本通 problems had 「（无）」 in their sample **output** block while the judge
// holds a real expected answer, so the statement gave the student nothing to test
// against. This rewrites each sample output block with the judge's own 1.out bytes.
//
// It is statement-only: no data[] entry, no `html` flag and no judge config is touched,
// so nothing has to be restarted. Backup is written before any write.
//
//   node sample-fix.cjs           # dry run, prints the proposed answers
//   node sample-fix.cjs --apply   # write, after dumping /root/backups/sample-fix-<ts>.json
//
// Companions: scripts/taxonomy/README.md and docs/plan-2026-10-11-A.md.
const fs = require('fs');
const { MongoClient } = require('mongodb');

const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const BACKUP_DIR = '/root/backups';
const APPLY = process.argv.includes('--apply');

// 一本通 1000-1049 / 1150-1157 / 1213 / 1241: no input at all, sample output was a placeholder.
const IDS = [3692, 3693, 3694, 3699, 3829, 3830, 3831, 3832, 3833, 3916];

// content is raw HTML (html:"true"), so the judge bytes must be escaped on the way in.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = (s) => String(s).replace(/\r\n/g, '\n');

// problem test files live on disk; data[].etag is base64 of the absolute path.
function readTestFile(entry) {
  return fs.readFileSync(Buffer.from(entry.etag, 'base64').toString('utf8'), 'utf8');
}
function firstByExt(files, ext) {
  return files
    .filter((f) => f.name.toLowerCase().endsWith(ext))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
}

(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const doc = client.db('hydro').collection('document');

  const rows = await doc.find({ domainId: 'system', docType: 10, docId: { $in: IDS } }).toArray();
  const changes = [];
  for (const r of rows) {
    const out = firstByExt(r.data || [], '.out');
    if (!out) { console.error('NO .out FOR', r.docId); process.exit(2); }
    // statement blocks carry no trailing newline, the file does
    const answer = norm(readTestFile(out)).replace(/\n$/, '');
    const content = String(r.content || '').replace(
      /(<code[^>]*class="[^"]*language-output1[^"]*"[^>]*>)[^]*?(<\/code>)/i,
      (_m, open, close) => open + esc(answer) + close,
    );
    if (content === r.content) { console.log('unchanged', r.docId); continue; }
    changes.push({ docId: r.docId, _id: r._id, before: r.content, content, bytes: answer.length });
  }

  for (const ch of changes) console.log(`#${ch.docId}  output1 <- ${ch.bytes} bytes`);
  if (!APPLY) {
    console.log(`\ndry run: ${changes.length} problem(s); re-run with --apply`);
    await client.close();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${BACKUP_DIR}/sample-fix-${stamp}.json`;
  fs.writeFileSync(path, JSON.stringify(changes.map((c) => ({ docId: c.docId, content: c.before })), null, 1));
  console.log('BACKUP', changes.length, 'docs ->', path);

  let modified = 0;
  for (const ch of changes) {
    const res = await doc.updateOne({ _id: ch._id }, { $set: { content: ch.content } });
    modified += res.modifiedCount;
  }
  console.log(`DONE modified=${modified}/${changes.length}`);
  await client.close();
})().catch((e) => { console.error('FAIL', e && e.message); process.exit(1); });
