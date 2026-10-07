const { execSync } = require('child_process');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const B = '/root/NOIP/\u84dd\u6865\u676f\u9898\u76ee\u548c\u6d4b\u8bd5\u6570\u636e';
const CATS = ['\u57fa\u7840\u8bad\u7ec3', '\u7b97\u6cd5\u8bad\u7ec3', '\u7b97\u6cd5\u63d0\u9ad8', '\u5386\u5c4a\u8bd5\u9898'];
const STAGE = '/root/lq-media';
const DRY = process.argv.includes('--dry');
const uri = JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri;

function decodeEntities(s) {
  return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function docxText(file) {
  try {
    let xml = execSync(`unzip -p "${file}" word/document.xml`, { maxBuffer: 64 << 20 }).toString('utf8');
    xml = xml.replace(/<w:tab[^>]*\/>/g, ' ').replace(/<w:br[^>]*\/>/g, '\n');
    xml = xml.replace(/<w:drawing[^>]*>([\s\S]*?)<\/w:drawing>/g, (m0, inner) => {
      const r = inner.match(/r:embed="(rId\d+)"/);
      return r ? '\u2329IMG:' + r[1] + '\u232a' : '';
    });
    xml = xml.replace(/<w:pict[\s\S]*?r:id="(rId\d+)"[\s\S]*?<\/w:pict>/g, '\u2329IMG:$1\u232a');
    const lines = [];
    for (const p of xml.split(/<\/w:p>/)) {
      const runs = p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      const marker = p.match(/\u2329IMG:(rId\d+)\u232a/);
      let text = decodeEntities(runs.map(r => r.replace(/<[^>]+>/g, '')).join(''));
      if (marker) text += '\u2329IMG:' + marker[1] + '\u232a';
      lines.push(text);
    }
    return lines.join('\n');
  } catch (e) { return null; }
}
function docxRels(file) {
  try {
    const xml = execSync(`unzip -p "${file}" word/_rels/document.xml.rels`, { maxBuffer: 4 << 20 }).toString('utf8');
    const map = {};
    for (const m of xml.matchAll(/Id="(rId\d+)"[^>]*Target="(media\/[^"]+)"/g)) map[m[1]] = m[2];
    return map;
  } catch (e) { return {}; }
}
function docText(file) {
  try { return execSync(`antiword -m UTF-8.txt "${file}"`, { maxBuffer: 16 << 20 }).toString('utf8'); }
  catch (e) { return null; }
}
function wordText(folder) {
  const files = fs.readdirSync(folder);
  const dx = files.find(f => /\.docx$/i.test(f));
  if (dx) return { text: docxText(folder + '/' + dx), file: folder + '/' + dx, docx: true };
  const d = files.find(f => /\.doc$/i.test(f));
  if (d) return { text: docText(folder + '/' + d), file: folder + '/' + d, docx: false };
  return { text: null, file: null, docx: false };
}

const M = {
  desc: '(?:\u3010)?\\s*(?:\u9898\u76ee\u63cf\u8ff0|\u95ee\u9898\u63cf\u8ff0)\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  infmt: '(?:\u3010)?\\s*\u8f93\u5165\u683c\u5f0f\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  outfmt: '(?:\u3010)?\\s*\u8f93\u51fa\u683c\u5f0f\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  smpin: '(?:\u3010)?\\s*(?:(?:\u8f93\u5165)?\u6837\u4f8b\u8f93\u5165|\u8f93\u5165\u6837\u4f8b)\\s*([0-9\uff10-\uff19]*)\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  smpout: '(?:\u3010)?\\s*(?:(?:\u8f93\u51fa)?\u6837\u4f8b\u8f93\u51fa|\u8f93\u51fa\u6837\u4f8b)\\s*([0-9\uff10-\uff19]*)\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  hint: '(?:\u3010)?\\s*(?:\u6570\u636e\u89c4\u6a21(?:\u4e0e\u7ea6\u675f|\u548c\u7ea6\u5b9a)?|\u6570\u636e\u8303\u56f4|\u6570\u636e\u8bf4\u660e|\u6837\u4f8b\u8bf4\u660e|\u8bf4\u660e|\u63d0\u793a|\u5907\u6ce8)\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
  source: '(?:\u3010)?\\s*\u6765\u6e90\\s*(?:\u3011)?\\s*[\uff1a:]?\\s*',
};
const ANCH = {};
for (const [k, src] of Object.entries(M)) ANCH[k] = new RegExp('^' + src + '(.*)$');
// bare sample markers (exact line or marker with inline remainder)
const BARE_IN = /^(\u8f93\u5165|input|in)\s*[0-9\uff10-\uff19]*\s*[\uff1a:]\s*(.*)$/i;
const BARE_OUT = /^(\u8f93\u51fa|output|out)\s*[0-9\uff10-\uff19]*\s*[\uff1a:]\s*(.*)$/i;
const UNION = new RegExp('(?:' + Object.values(M).join('|') + ')', 'g');
const JUNK = /^(?:[\uff3b\u3010\[]?\s*pic\s*[\uff3d\u3011\]]?\.?\s*|\u65f6\u95f4\u9650\u5236.*|\u5185\u5b58\u9650\u5236.*|(\u57fa\u7840\u8bad\u7ec3|\u57fa\u7840\u7ec3\u4e60|\u7b97\u6cd5\u8bad\u7ec3|\u7b97\u6cd5\u63d0\u9ad8|\u7b97\u6cd5\u7ec3\u4e60|\u5386\u5c4a\u8bd5\u9898)(?:\s.*)?)$/;
const BARE_LABEL = /^(input|output|in|out)\s*[0-9]*\s*[\uff1a:]/i;

function toAsciiDigits(s) { return s.replace(/[\uff10-\uff19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); }

function parse(raw) {
  raw = toAsciiDigits(raw);
  const st = { desc: [], infmt: [], outfmt: [], hint: [], source: [], smpin: [], smpout: [] };
  let cur = 'desc';
  for (let raw0 of raw.split('\n')) {
    let line = raw0.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
    if (!line) { if (cur === 'desc' && st.desc.length && st.desc[st.desc.length - 1] !== '') st.desc.push(''); continue; }
    if (JUNK.test(line)) {
      const mk = line.match(/\u2329IMG:(rId\d+)\u232a/g);
      if (mk) line = mk.join(' '); else continue;
    }
    line = line.replace(UNION, '\n$&\n'); // keep marker text, isolate it on its own line
    for (const seg of line.split('\n')) {
      const s = seg.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
      if (!s) continue;
      let matched = false;
      for (const k of ['desc', 'infmt', 'outfmt', 'smpin', 'smpout', 'hint', 'source']) {
        const mm = s.match(ANCH[k]);
        if (mm) {
          cur = k;
          if (k === 'smpin' || k === 'smpout') {
            st[k].push({ n: mm[1] || String(st[k].length + 1), lines: [] });
            if (mm[mm.length - 1]) st[k][st[k].length - 1].lines.push(mm[mm.length - 1]);
          } else if (mm[mm.length - 1].trim()) {
            st[k].push(mm[mm.length - 1].trim());
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        // bare sample markers: 输入：/输出：/input/output (only after 输出格式 seen, to avoid hijacking description text)
        if (cur === 'outfmt' || cur === 'smpin' || cur === 'smpout') {
          const bi = s.match(BARE_IN);
          if (bi) { cur = 'smpin'; st.smpin.push({ n: String(st.smpin.length + 1), lines: bi[2] ? [bi[2]] : [] }); continue; }
          const bo = s.match(BARE_OUT);
          if (bo) { cur = 'smpout'; st.smpout.push({ n: String(st.smpout.length + 1), lines: bo[2] ? [bo[2]] : [] }); continue; }
        }
        if (cur === 'desc' && BARE_LABEL.test(s)) continue; // mangled sample label inside description
        if (cur === 'smpin' || cur === 'smpout') st[cur][st[cur].length - 1].lines.push(s);
        else st[cur].push(s);
      }
    }
  }
  for (const k of ['desc', 'infmt', 'outfmt', 'hint', 'source']) st[k] = st[k].filter((l, i, a) => !(l === '' && (i === a.length - 1 || i === 0)));
  return st;
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function block(lines) { return lines.map(esc).join('\n'); }

function dataCaseSample(folder) {
  const entries = [];
  for (const f of fs.readdirSync(folder)) {
    const m = f.match(/^input(\d+)\.txt$/i);
    if (m && fs.existsSync(folder + '/output' + m[1] + '.txt')) entries.push({ n: +m[1] });
  }
  entries.sort((a, b) => a - b);
  for (const e of entries) {
    const si = fs.readFileSync(folder + '/input' + e.n + '.txt', 'utf8');
    const so = fs.readFileSync(folder + '/output' + e.n + '.txt', 'utf8');
    if (si.length <= 1500 && so.length <= 1500) return { n: e.n, in: si, out: so, trunc: false };
  }
  const e = entries[0];
  if (!e) return null;
  return {
    n: e.n,
    in: fs.readFileSync(folder + '/input' + e.n + '.txt', 'utf8').slice(0, 1500),
    out: fs.readFileSync(folder + '/output' + e.n + '.txt', 'utf8').slice(0, 1500),
    trunc: true,
  };
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('hydro');
  const col = db.collection('document');

  const folders = new Map();
  const foldersByName = new Map();
  for (const cat of CATS) {
    const base = B + '/' + cat;
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const p = base + '/' + name;
      if (fs.statSync(p).isDirectory()) {
        folders.set(cat + '|' + name.trim(), { path: p, cat });
        foldersByName.set(name.trim(), { path: p, cat });
      }
    }
  }
  const probs = await col.find({ domainId: 'system', docType: 10, docId: { $gte: 4072, $lte: 4325 } }, { docId: 1, title: 1, tag: 1, content: 1 }).sort({ docId: 1 }).toArray();
  console.log('lanqiao problems in db: ' + probs.length + ' | folders: ' + folders.size);
  if (fs.existsSync(STAGE)) execSync(`rm -rf ${STAGE}`);
  fs.mkdirSync(STAGE, { recursive: true });

  const backup = [];
  const report = [];
  const updates = [];
  const mediaManifest = [];
  for (const p of probs) {
    const tags = (p.tag || []).filter(Boolean).filter(t => t !== '\u84dd\u6865\u676f');
    const cat = tags.find(t => CATS.includes(t));
    let fo = cat ? folders.get(cat + '|' + String(p.title).trim()) : null;
    const r = { docId: p.docId, title: p.title, cat, flags: [] };
    backup.push({ docId: p.docId, title: p.title, oldContent: p.content });
    if (!fo) fo = foldersByName.get(String(p.title).trim());
    if (!fo) { r.flags.push('FOLDER_NOT_FOUND'); report.push(r); continue; }
    if (fo.cat !== cat) r.flags.push('FOLDER_CAT_DIFFERS:' + fo.cat + '/' + cat);

    const wt = wordText(fo.path);
    if (!wt.text) { r.flags.push('WORD_EXTRACT_FAIL'); report.push(r); continue; }
    const st = parse(wt.text);
    if (st.desc.filter(x => x).length < 1 && st.infmt.length === 0 && st.outfmt.length === 0) { r.flags.push('EMPTY_DESC'); report.push(r); continue; }
    if (st.smpin.length || st.smpout.length) r.flags.push('dropped_word_samples:' + st.smpin.length + '/' + st.smpout.length);

    const dcase = dataCaseSample(fo.path);
    if (!dcase) r.flags.push('NO_DATA_SAMPLE');
    if (dcase && dcase.trunc) {
      r.flags.push('SAMPLE_TRUNCATED');
      st.hint.push('\u6ce8\uff1a\u6837\u4f8b\u56e0\u6570\u636e\u91cf\u8f83\u5927\u5df2\u622a\u65ad\uff0c\u5b8c\u6574\u6570\u636e\u4ee5\u5b9e\u9645\u6d4b\u8bd5\u70b9\u4e3a\u51c6\u3002');
    }

    let content = '';
    const cleanFmt = arr => arr.filter(l => !BARE_LABEL.test(l));
    content += '<h2>\u9898\u76ee\u63cf\u8ff0</h2>\n' + block(st.desc) + '\n\n';
    const infmtClean = cleanFmt(st.infmt), outfmtClean = cleanFmt(st.outfmt);
    if (infmtClean.length) content += '<h2>\u8f93\u5165\u683c\u5f0f</h2>\n' + block(infmtClean) + '\n\n';
    if (outfmtClean.length) content += '<h2>\u8f93\u51fa\u683c\u5f0f</h2>\n' + block(outfmtClean) + '\n\n';
    const sampleAreaImgs = [];
    for (const k of ['smpin', 'smpout']) for (const sp of st[k]) for (let i = 0; i < sp.lines.length; i++) {
      for (const m of String(sp.lines[i]).matchAll(/\u2329IMG:(rId\d+)\u232a/g)) { sampleAreaImgs.push(m[1]); sp.lines[i] = ''; }
    }
    if (dcase) {
      content += '<h2>\u6837\u4f8b</h2>\n';
      content += '<pre><code class="language-input1">' + esc(dcase.in) + '</code></pre>\n';
      content += '<pre><code class="language-output1">' + esc(dcase.out) + '</code></pre>\n\n';
    } else r.flags.push('NO_SAMPLE_AT_ALL');
    if (st.hint.length) content += '<h2>\u8bf4\u660e/\u63d0\u793a</h2>\n' + block(st.hint) + '\n\n';
    content += '<h2>\u6765\u6e90</h2>\n\u84dd\u6865\u676f ' + fo.cat;

    if (wt.docx) {
      const rels = docxRels(wt.file);
      const rids = [...content.matchAll(/\u2329IMG:(rId\d+)\u232a/g)].map(m => m[1])
        .concat(sampleAreaImgs);
      const seen = new Map();
      for (const rid of rids) {
        if (seen.has(rid)) continue;
        const target = rels[rid];
        if (!target) { seen.set(rid, null); continue; }
        const ext = target.split('.').pop().toLowerCase();
        const idx = mediaManifest.filter(x => x.docId === p.docId).length + 1;
        const name = 'lqimg' + idx + '.' + ext;
        const dest = STAGE + '/' + p.docId;
        fs.mkdirSync(dest, { recursive: true });
        try {
          execSync(`unzip -p "${wt.file}" "word/${target}" > "${dest}/${name}"`);
          const sz = fs.statSync(dest + '/' + name).size;
          if (sz < 2000) { fs.unlinkSync(dest + '/' + name); seen.set(rid, null); r.flags.push('TINY_IMG_SKIPPED'); continue; }
          mediaManifest.push({ docId: p.docId, name, path: dest + '/' + name, size: sz });
          seen.set(rid, name);
        } catch (e) { seen.set(rid, null); r.flags.push('MEDIA_EXTRACT_FAIL:' + rid); }
      }
      const imgTag = rid => { const name = seen.get(rid); return name ? '<img src="/p/' + p.docId + '/file/' + name + '" alt="\u914d\u56fe" style="max-width:640px">' : ''; };
      content = content.replace(/\u2329IMG:(rId\d+)\u232a/g, (_, rid) => imgTag(rid));
      if (sampleAreaImgs.length) {
        const tags = sampleAreaImgs.map(imgTag).filter(Boolean);
        if (tags.length) content = content.replace('\u6765\u6e90</h2>', '\u914d\u56fe</h2>\n' + tags.join('\n') + '\n\n<h2>\u6765\u6e90</h2>');
      }
      r.imgs = mediaManifest.filter(x => x.docId === p.docId).length;
      if (/(\u5982\u56fe|\u4e0b\u56fe|\u89c1\u56fe)/.test(wt.text) && !r.imgs) r.flags.push('TEXT_REFERS_FIGURE_NO_IMG');
    }
    content = content.replace(/[\[\uff3b\u3010]\s*pic\s*[\]\uff3d\u3011]?\.?/gi, '').replace(/\n{3,}/g, '\n\n');

    if (p.docId === 4093) {
      const withFormula = content.replace('\u5982\u4e0b\u7684\u5f0f\u5b50\u6765\u8868\u793a\uff1a', '\u5982\u4e0b\u7684\u5f0f\u5b50\u6765\u8868\u793a\uff1a\n\n$$\\mathrm{rep}(S)=\\sum_{1\\le i<j\\le k} f(a_i,a_j)$$\n');
      if (withFormula === content) r.flags.push('OVERRIDE_4093_MISS'); else content = withFormula;
    }
    if (p.docId === 4089) {
      content = content.replace('\u4e3a\u4e86\u66f4\u597d\u5730\u7406\u89e3\u8bf7\u770b\u4e00\u4e2a\u4f8b\u5b50\u3002', '');
      content = content.replace('\u63a8\u8350\u4f7f\u7528I64d\u8f93\u51fa\u3002', '\u6ce8\u610f\uff1a\u7b54\u6848\u53ef\u80fd\u8d85\u51fa 32 \u4f4d\u6574\u6570\u8303\u56f4\uff0c\u8bf7\u4f7f\u7528 64 \u4f4d\u6574\u6570\u7c7b\u578b\u3002');
    }
    r.newLen = content.length;
    updates.push({ docId: p.docId, content });
    report.push(r);
  }

  fs.writeFileSync('/root/lanqiao-rebuild-report.json', JSON.stringify({ report, updatesCount: updates.length }, null, 1));
  fs.writeFileSync('/root/lanqiao-updates.json', JSON.stringify(updates, null, 1));
  fs.writeFileSync('/root/lq-media-manifest.json', JSON.stringify(mediaManifest, null, 1));
  if (!fs.existsSync('/root/backups/lanqiao-rebuild-backup-20261007.json')) fs.writeFileSync('/root/backups/lanqiao-rebuild-backup-20261007.json', JSON.stringify(backup));
  console.log('updates=' + updates.length + ' media=' + mediaManifest.length + ' flags:');
  const fc = {};
  for (const r of report) for (const f of r.flags) fc[f.replace(/:.*$/, ':*')] = (fc[f.replace(/:.*$/, ':*')] || 0) + 1;
  console.log(JSON.stringify(fc));
  if (!DRY) {
    for (const u of updates) await col.updateOne({ domainId: 'system', docType: 10, docId: u.docId }, { $set: { content: u.content } });
    console.log('DB updated: ' + updates.length);
  } else console.log('DRY RUN - no DB write');
  await client.close();
}
main().catch(e => { console.error(e); process.exit(1); });
