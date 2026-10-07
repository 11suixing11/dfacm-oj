const fs = require('fs');
const DEL = [2159,3388,3384,3382,3380,3378,3376,3375,3373,3372,3370,3369,3367,3270,3268,3267,3266,3263,3262,3261,3260,3259,2882,2881,2894,2892,2888,2887,2885,2884,2835,2833,2832,2830,2829,2827,2607,2606,2604,2602,2600,2599,2157,2155,2153,4302];
const stamp = '20261007';
const backup = { when: new Date().toISOString(), reason: 'taxonomy dedup: 45 CF multi-round duplicate copies + lanqiao 4302 (dup of 4205)', docs: [], psdocs: [], records: [] };
const ds = db.getCollection('document.status');
for (const d of DEL) {
  backup.docs.push(db.document.findOne({ domainId: 'system', docType: 10, docId: d }));
  ds.find({ domainId: 'system', docId: d }).forEach(x => backup.psdocs.push(x));
  db.record.find({ domainId: 'system', pid: String(d) }).forEach(x => backup.records.push(x));
}
fs.writeFileSync('/root/backups/taxonomy-dedup-backup-' + stamp + '.json', JSON.stringify(backup));
print('backup docs=' + backup.docs.length + ' psdocs=' + backup.psdocs.length + ' records=' + backup.records.length);
const missing = DEL.filter(d => !backup.docs.find(x => x && x.docId === d));
if (missing.length) { print('MISSING_DOCS_ABORT: ' + missing.join(',')); quit(1); }
if (backup.records.length) { print('RECORDS_EXIST_ABORT'); quit(1); }
const r1 = db.document.deleteMany({ domainId: 'system', docType: 10, docId: { $in: DEL } });
const r2 = ds.deleteMany({ domainId: 'system', docId: { $in: DEL } });
if (r1.deletedCount !== DEL.length) { print('DELETE_COUNT_MISMATCH: ' + r1.deletedCount); quit(1); }
print('deleted docs=' + r1.deletedCount + ' psdocs=' + r2.deletedCount);

const tid = ObjectId('6abf552caaa235606eedfbee');
const t = db.document.findOne({ _id: tid });
if (!t) { print('PLAN_NOT_FOUND_ABORT'); quit(1); }
let removed = 0;
for (const ch of t.dag) {
  const before = ch.pids.length;
  ch.pids = ch.pids.filter(p => p !== 4302);
  if (ch.pids.length !== before) {
    removed = before - ch.pids.length;
    ch.title = ch.title.replace(/\uff08\d+\u9898\uff09/, '\uff08' + ch.pids.length + '\u9898\uff09');
  }
}
const newTitle = t.title.replace('254 \u9898', '253 \u9898');
db.document.updateOne({ _id: tid }, { $set: { dag: t.dag, title: newTitle } });
print('plan removed=' + removed + ' newTitle=' + newTitle);
print('plan pids total=' + t.dag.reduce((a, c) => a + c.pids.length, 0));
print('system problems now=' + db.document.countDocuments({ domainId: 'system', docType: 10 }));
print('all problems now=' + db.document.countDocuments({ docType: 10 }));
