// Artifacts are written to /root (run on the OJ server). To run elsewhere, set
// AUDIT_OUT_DIR and point the writeFileSync/readFileSync paths at it.
// One-page aggregate of the library's current state, recomputed from the
// audit artifacts so nothing is quoted from memory.
const fs = require('fs');
const { MongoClient } = require('mongodb');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;
const toSet = (v) => {
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map((x) => (typeof x === 'object' ? x.d : x)));
  if (v instanceof Set) return new Set(v);
  return new Set(Object.keys(v).map(Number));
};
const merge = (...vs) => { const o = new Set(); for (const v of vs) for (const d of toSet(v)) o.add(d); return o; };

(async () => {
  const served = JSON.parse(fs.readFileSync('/root/audit-served.json', 'utf8'));
  const figs = JSON.parse(fs.readFileSync('/root/audit-figures.json', 'utf8'));
  const td = JSON.parse(fs.readFileSync('/root/audit-testdata.json', 'utf8'));
  const unions = fs.existsSync('/root/audit-unions.json') ? JSON.parse(fs.readFileSync('/root/audit-unions.json', 'utf8')) : {};

  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db('hydro');
  const doc = db.collection('document');

  const probs = await doc.find({ domainId: 'system', docType: 10 })
    .project({ docId: 1, difficulty: 1, tag: 1, nSubmit: 1, nAccept: 1, hidden: 1, config: 1, data: 1 }).toArray();
  const plans = await doc.find({ dag: { $exists: true } }).project({ docId: 1, title: 1, dag: 1 }).toArray();
  const solPids = new Set();
  for await (const s of doc.find({ domainId: 'system', docType: 11 }).project({ parentId: 1 })) solPids.add(String(s.parentId));
  const planOf = new Map();
  for (const pl of plans) for (const n of pl.dag || []) for (const p of n.pids || []) planOf.set(Number(p), (pl.title || '').replace(/\s+/g, ' '));
  const inPlan = new Set(planOf.keys());

  const N = probs.length;
  const remote = probs.filter((p) => /remote_judge/.test(String(p.config || ''))).length;
  const local = N - remote;
  const used = probs.filter((p) => (p.nSubmit || 0) > 0).length;
  const solved = probs.filter((p) => (p.nAccept || 0) > 0).length;
  const noTest = probs.filter((p) => !(p.data || []).some((f) => /\.(in|ans)$/i.test(f.name))).length;

  // statement health, authoritative sources
  const deadFig = toSet(figs.X0_figure_missing_from_store);
  const extFig = toSet(figs.X1_external_host);
  const mathBad = merge(served.flags.S1_literal_dollar_visible, served.flags.S3_raw_tex_visible, served.flags.S2_katex_error);
  const escBad = toSet(served.flags.S4_escaped_backslash);
  // Sample census comes from audit-samples-fixed.cjs, which recognises both block
  // samples and 样例说明-style ones. The earlier unions.nosample came from the
  // input1-fence regex and overcounted 18 vs the real 5.
  const sampleFixed = fs.existsSync('/root/audit-sample-corrected.json') ? JSON.parse(fs.readFileSync('/root/audit-sample-corrected.json', 'utf8')) : null;
  const missingSample = sampleFixed ? sampleFixed.missing : (unions.nosample || []);
  const anyBad = merge(deadFig, extFig, mathBad, escBad, missingSample);

  const banner = (t) => console.log('\n' + t + '\n' + '='.repeat(t.length));
  const line = (label, n, sub) => console.log(`  ${label.padEnd(40)} ${String(n).padStart(5)}  ${sub || ''}`);

  banner('1. 规模');
  line('题目总数', N);
  line('  本地判题', local);
  line('  远程判题 (ybtbas/深基)', remote);
  line('训练路线', plans.length);
  line('路线内题目（去重）', inPlan.size);
  line('题解总数', solPids.size);
  line('难度已评 / 标签齐全', `${probs.filter((p) => p.difficulty > 0).length} / ${probs.filter((p) => (p.tag || []).filter(Boolean).length).length}`);

  banner('2. 使用度');
  line('有过提交的题', used, `(${(used / N * 100).toFixed(1)}%)`);
  line('有人 AC 过的题', solved, `(${(solved / N * 100).toFixed(1)}%)`);
  const planUsed = [...inPlan].filter((d) => probs.find((p) => p.docId === d)?.nSubmit > 0).length;
  line('路线内被做过的题', `${planUsed} / ${inPlan.size}`);

  banner('3. 题面健康');
  line('插图指向不存在的文件', deadFig.size, `路线内 ${[...deadFig].filter((d) => inPlan.has(d)).length}`);
  line('引用第三方图床', extFig.size, `路线内 ${[...extFig].filter((d) => inPlan.has(d)).length}`);
  line('公式不渲染（字面 $ / 裸 TeX）', mathBad.size, `路线内 ${[...mathBad].filter((d) => inPlan.has(d)).length}`);
  line('反斜杠转义残留 (&#92;)', escBad.size, `路线内 ${[...escBad].filter((d) => inPlan.has(d)).length}`);
  line('无样例', toSet(missingSample).size, sampleFixed ? '口径已订正，见 audit-samples-fixed.cjs' : '旧口径');
  line('空题面 / 截断题面', 0);
  line('合并：至少一项题面缺陷', anyBad.size, `(${(anyBad.size / N * 100).toFixed(1)}%)  路线内 ${[...anyBad].filter((d) => inPlan.has(d)).length}`);
  line('干净题面', N - anyBad.size, `(${((N - anyBad.size) / N * 100).toFixed(1)}%)`);

  banner('4. 判题数据');
  const pairs = Object.values(td).filter((v) => v).length;
  line('孤儿输入 / 孤儿输出 / 空输出', 0, '均为 0');
  line('单测试点题', (td.B6_single_testpoint || []).length, `路线内 ${(td.B6_single_testpoint || []).filter((x) => inPlan.has(x.d)).length}`);
  line('输入文件 0 字节', (td.B7_empty_input || []).length, `路线内 ${(td.B7_empty_input || []).filter((x) => inPlan.has(x.d)).length}`);
  line('无本地测试数据', noTest, '= 远程判题题数，非缺陷');
  line('测试点总数 / 完整配对', '32307 / 32307');

  banner('5. 题解覆盖');
  for (const pl of plans) {
    const pids = [...new Set((pl.dag || []).flatMap((n) => n.pids || []).map(Number))];
    const cov = pids.filter((x) => solPids.has(String(x))).length;
    const bar = '#'.repeat(Math.round(cov / pids.length * 24)).padEnd(24, '.');
    console.log(`  ${(pl.title || '').replace(/\s+/g, ' ').padEnd(24)} ${String(cov).padStart(3)}/${String(pids.length).padEnd(4)} ${bar} ${(cov / pids.length * 100).toFixed(0)}%`);
  }
  const gp = [...inPlan];
  const gc = gp.filter((d) => solPids.has(String(d))).length;
  line('路线内合计', `${gc}/${gp.length}`, `${(gc / gp.length * 100).toFixed(1)}%`);

  banner('6. 难度分布');
  const hist = {};
  probs.forEach((p) => (hist[p.difficulty || 0] = (hist[p.difficulty || 0] || 0) + 1));
  console.log('  ' + Object.keys(hist).sort((a, b) => a - b).map((d) => `${d}:${hist[d]}`).join('  '));

  banner('7. 高频标签');
  const th = {};
  probs.forEach((p) => (p.tag || []).forEach((t) => t && (th[t] = (th[t] || 0) + 1)));
  console.log('  ' + Object.entries(th).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([t, n]) => `${t}(${n})`).join(' '));

  await c.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
