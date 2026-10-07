# Taxonomy tooling

One-off-but-replayable scripts behind the 2026-10-07 library cleanup /
rebuild. All run on the OJ server (Node from nix + `NODE_PATH` pointing at the
yarn-global modules, Mongo URI read from `/root/.hydro/config.json`).

## rebuild-lanqiao.cjs

Rebuilds all 253 蓝桥杯 statements from the original Word sources
(`/root/NOIP/蓝桥杯题目和测试数据/<分类>/<题目名>/`) instead of the corrupted
10-02 import:

- `docx` → paragraph text via `unzip -p … word/document.xml`; `.doc` →
  `antiword -m UTF-8.txt`.
- Section markers (`题目描述/输入格式/输出格式/样例输入/输出格式/来源/数据规模和约定`)
  are *preserved* by the mid-line splitter (a `split()` variant that deletes
  the marker text loses whole sections - see git history of this file).
- Word-rendered samples are always discarded: Word tables lose newlines and
  glue sample cells together. The displayed sample is always the first
  *complete* `inputN.txt`/`outputN.txt` pair from the judge data (truncated
  pairs get a note, and if all cases are huge a smaller complete case is
  preferred).
- Inline body figures (`<w:drawing>`, including ones anchored in junk header
  paragraphs) are extracted to `/root/lq-media/<docId>/lqimgN.<ext>` and
  referenced as `<img src="/p/<docId>/file/lqimgN.png">`; upload them with
  `hydrooj cli execute` + `ProblemModel.addAdditionalFile`. `AlternateContent`
  fallback duplicates collapse to a single image.
- `--dry` prints the flag summary without writing. Backups: originals to
  `/root/backups/lanqiao-rebuild-backup-20261007.json` (write-protected by an
  exists-guard on re-runs).

Result: nosample/corrupt/[pic] all 0 for docId 4072-4325 (was 29/183/4).

## srq15.cjs

Adds real samples to the 15 no-input 深基 remote problems (4806-4909) whose
statements shipped without sample blocks. The answers are computed, then
*proven* by submitting the generating program to the srqc remote judge
(`lang=cc.cc17o2` - bare `cc` is rejected by the domain language whitelist)
and requiring AC before the `## 样例` block is written. Modes:
`verify` (submit + poll), `applyonly` (server cron: confirm AC, write content),
`cleanup` (delete the verification records). While the hydroac relay
(`ws.hydrooj.com`) was down the batch stayed at status 0; the server cron
`/root/srq15-auto.sh` applies + cleans automatically once all 16 records
turn AC.

## loj153.cjs

Batch-fixes the LOJ KaTeX disease (scraped pages contain raw
`<span class="katex">` MathML trees). The TeX is recovered from the scraped
`katex-mathml` span: rendered glyphs followed by the TeX annotation. When the
prefix rule (html == glyph prefix) fails because fractions/limits reorder the
glyphs, fall back to the suffix starting at the first `\command` - the
rendered part never contains raw TeX. Problems still carrying `mjx-chtml`
(MathJax CHTML, no embedded TeX) are deliberately skipped: 43 of them need
hand-written TeX maps, tracked as follow-up work. 152/196 fixed.

## solutions/ — editorial pipeline

`solutions-apply.cjs` + `run-solutions.sh` turn a batch JSON
(`[{docId, t: 思路, c: C++17 code}]`, see `solutions/lq-batch-*.json`) into
published editorials:

1. skip problems that already have one (marker `【本题解由站长编写】`);
2. snapshot `nSubmit`/`nAccept` of every target problem;
3. submit each solution as the hidden judge account (`lang=cc.cc17o2`),
   poll the record, require AC;
4. WAs are reported and dropped; the verification records of AC entries are
   deleted and the problem counters restored;
5. surviving entries are inserted through the official
   `SolutionModel.add(domainId, pid, owner=1, content)` via
   `hydrooj cli execute` (one CLI boot per batch).

Continue with further batches by authoring more `lq-batch-NN.json` files and
running `run-solutions.sh` against them. Coverage target: all problems inside
training plans (蓝桥杯 253 → in progress; XCPC 108; the 8 topic plans 256).
