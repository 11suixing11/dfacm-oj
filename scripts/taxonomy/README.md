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
and requiring AC before the `## 样例` block is written.

Subcommands, run in this order:

| command | effect |
|---|---|
| `reset` | delete judge-account records on the 15 targets, recompute `nSubmit`/`nAccept` from the surviving real records |
| `verify` | submit all 15 programs, poll, write `/root/srq15-state.json`, require 15/15 AC |
| `apply` | stage every new body, flush the backup, *then* write; refuses to run unless all 15 are AC |
| `cleanup` | delete the verification records and restore the counters |
| `report` | per-problem sample / counter state |
| `rollback` | exact inverse of `apply` |

**Do not schedule this.** The 2026-10-07 version shipped with an `applyonly`
cron mode that only *polled* the records submitted while the hydroac relay was
down; those records park at a non-final status forever, so the cron aborted on
every tick for ten hours while the relay was already healthy again. It polls,
it does not retry - run `verify` by hand instead.

Three defects in that version, all fixed here and worth remembering:

- `cleanup` deleted `document.status` rows with `{docId: {$in: ids}}`. That
  filter also matches **real users'** AC markers, and RP reads that collection,
  so their rating drops until they re-submit. Always scope by the judge uid.
- `db.getCollection()` is a mongosh helper; in the Node driver it throws, so
  cleanup would have failed even after all 15 came back AC.
- `apply` wrote the database rows before writing the backup file, so a failure
  in between leaves the library ahead of its backup. `rollback` exists for that
  case, but the ordering bug is fixed at the source.

Answers are re-derived by the judge, never trusted from arithmetic: 4818
【定期存款】 came back `Read 12166.5, expect 12000` because 五年定存 is **simple**
interest (`10000*(1+0.04*5)`), not `10000*1.04^5`. The statement's own wording
("到期后将连本带利再存一年") applies to 小A's yearly rollover only.

## html:"true" math bypass (2026-10-08)

`pdoc.html === "true"` makes Hydro emit content as raw HTML and skip the
markdown-it + KaTeX pipeline, so `$..$` survives as literal text. Setting
`html` to `''` routes it through the pipeline and the formulas render.

The repair is usually just the flag: these statements are already stored in the
target shape (`<h2>` headings, `<pre><code class="language-inputN">` sample
blocks, `$..$` math), so `content` is not rewritten at all.

**The real number is 292, not the 3547 that carry the flag.** 3255 of them
contain no math whatsoever and are simply unaffected — the flag is a
"not broken" rather than a "broken" thing. Of the 292, 290 need nothing but the
flag; 2 (`#1353`, `#3518`) are scraped raw HTML and need a rewrite.

| script | purpose |
|---|---|
| `htmltrue-scope.cjs` | classify every `html:"true"` problem: no math / fixable / needs rewrite |
| `htmltrue-fix.cjs` | `plan` \| `apply` \| `verify` \| `revert` — flip the flag |
| `render-measure.cjs` | ground truth: fetch the page and measure what a reader sees |
| `fix-entities.cjs` | un-escape `&#44;` that sits **inside** `$..$` (3 problems, 20 expressions) |
| `fix-trailing-comma.cjs` | drop a stray trailing comma inside `$..$` (3 CSP problems) |
| `rollback-kerr.cjs` | re-measure everything flipped and roll back anything that now renders as `katex-error` |

Three rules this pipeline enforces, each from something that went wrong:

1. **Measure after flipping, and roll back regressions.** `html:""` fixed 241
   problems but turned 6 others (`#3839` 阿克曼函数, `#3841` Hermite多项式,
   `#3893` 棋盘问题, `#3955` 滑雪, `#4048` 鱼塘钓鱼, `#4065` 食物链) from
   *harmless literal text* into *visible render errors*. A `katex-error` is
   worse than a literal `$`, so `rollback-kerr.cjs` restores `html:"true"` for
   any problem that regressed. Net result: 174 problems rendering, 0 errors.
2. **Back up before the first write, never after.** Staged content and the
   backup file are flushed first; if the backup exists the script refuses to
   run.
3. **Only un-escape entities inside math.** `&#44;` in prose is valid HTML and
   the browser renders a comma correctly — rewriting it would be gratuitous.
   Only the ones KaTeX cannot parse (inside a `$..$` span) are touched.

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

## Working a batch: pre-flight locally, then judge

`preflight.cjs <batch.json>` compiles every solution in a batch and runs it
against that problem's real test files on the server, printing got vs expected
per case. Nothing reaches the judge until it passes locally.

```bash
export PATH=/root/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin
export NODE_PATH=/usr/local/share/.config/yarn/global/node_modules
node /root/preflight.cjs /root/lq-batch-07.json
# then
bash /root/run-solutions.sh /root/lq-batch-07.json
```

This is worth the extra step. Batch 07 went **8/8 on the first judge attempt**;
without the pre-flight, three of those eight would have been submitted wrong on
guessed output formats:

- #4226 输出九九乘法表 expects a fixed ASCII table with a `Nine-by-nine
  Multiplication Table` title, 38-char rules and right-aligned width-4 columns
  printing bare products (` 1   1`, no `1*1=1`).
- #4188 expects `3 9 20`, not `3天9小时20分`.
- #4096 takes **two packaging sizes from the input** (`10 13`), not the 4 and 7
  the statement mentions; the answer is the Frobenius number `a*b-a-b`.

A judge round trip costs a compile plus a poll cycle and tells you only "too
high" or "too low". The pre-flight tells you the exact expected bytes and turns
the fix into a local edit.

## Four failures that each looked like a modelling bug

#4149 促销购物 took four attempts, and three of the four failures were in my
head, not in the algorithm. Worth spelling out because each one cost a full
judge round trip:

1. **The input format is not what the statement says.** The statement reads
   "第一个整数 n，表示这种优惠方式由 n 种商品组成。后面 n 对整数 c 和 k". A
   natural reading is "n pairs, then the price", and that is what I wrote. The
   data is actually `n c₁ k₁ c₂ k₂ … cₙ kₙ p`. The two coincide on the first
   plan of a case and diverge immediately after, so a single happy-path case
   looks fine.
2. **A plan may be bought more than once.** Modelling it as 0-1 knapsack gave
   1631 where the judge wants 1563; the gap closes only when each plan can be
   repeated up to 5 times.
3. **A plan containing a product that is not on the shopping list is still
   usable** -- take the part of it that applies and ignore the rest. Dropping
   such plans wholesale made the answer collapse to "everything at list price",
   which was exactly the first wrong answer I submitted.
4. **A plan that appears useless can still be the cheapest route**, because
   buying a plan that overshoots nothing lets other plans fit around it.

The general lesson: after a WA, read `testCases.message` for the read/expect
pair, then **compile the candidate locally and run it against the real test
files** before resubmitting. Guessing at semantics from the diff alone cost two
extra rounds here; seeing "got 1695 = list price" immediately said "no plan
survived parsing". `preflight.cjs` now does that automatically for every entry in
a batch, so this only has to be remembered once.

Two more that a WA diff pinned down instantly:

- #4143 五次方数: `1` satisfies the definition but the judge's answer set starts
  at 4150, so the lower bound is 100 and up.
- #4138: when `n1 == 0` nothing is appended, yet the judge still expects the
  original `m` elements printed, so the length is `max(m1 + n1, m)` and there is
  no trailing comma. The visible sample does not contain an `n1 == 0` case.

## Problems whose test data is unjudgeable

`#4142` 乘法运算 (蓝桥杯 plan): all four `.out` files contain `U+FFFD`. The
vertical-multiplication layout wants a full-width multiplication sign and rule,
and the import mangled them into replacement characters, so no program can
match. It is the only such case among the 152 蓝桥杯 problems still lacking an
editorial. Fix by rebuilding the expected outputs in plain ASCII.

