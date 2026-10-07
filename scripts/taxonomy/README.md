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
  `hydrooj cli execute` + `ProblemModel.addAdditionalFile` (see
  `run-upload-media.sh` pattern). `AlternateContent` fallback duplicates
  collapse to a single image.
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
`verify` (submit + poll), `apply` (write content after all-AC),
`cleanup` (delete the verification records).
