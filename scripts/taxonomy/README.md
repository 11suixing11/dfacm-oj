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

`run-solutions.sh` invokes `solutions-apply.cjs` inside the configured Hydro
administrator CLI. Node >=22.13 and Linux `flock` are required. It no longer
logs in through HTTP, restores counter snapshots, deletes user status rows, or
consumes `/root/sol-ready.json`.

**Release gate:** the existing `dfacm-ops` addon must be loaded with
`DFACM_CONTROLLED_HISTORY=1` in the administrator CLI and every process that
hosts native judge callbacks. Stock Hydro 5.0.7 writes controlled history under
a private callback ID without RID ownership; stock exports alone remain blocked.
The addon now installs `controlled-history.cjs` through native Cordis `ctx.effect`
and removes both wrappers and capability when its plugin fiber is disposed.
Compatibility is limited to Hydro **5.0.7**, ui-default **4.58.5**, and the
accepted native esbuild callback method shapes. An incompatible version, loader,
method replacement, or unloaded wrapper fails preflight. Do not bypass this
check with a boolean capability or task metadata.

`verifySolutions(api, batch, stateStore)` uses
`RecordModel.add(..., false, {type: 'judge'})` followed by
`RecordModel.judge(..., {}, {type: 'judge', rejudge: 'controlled', ...ownership})`.
Its capability comes from `getCapability(api)` in the installed native adapter.
The adapter verifies the exact native RID/domain/UID/PID/language/source marker,
code, and service username, then writes owned metadata under the callback's
actual history ID before native progress or terminal updates. Metadata includes
the code hash, service username, batch/entry ID, and native RID. No callback
source or executable is run by the adapter. Ordinary callbacks and unrelated
controlled callbacks retain their native behavior.

Ship the taxonomy runner, `solutions-apply.cjs`, `verify-solutions.cjs`, and
`verification-state.cjs` together, plus the updated existing ops entry and
`controlled-history.cjs`. Preserve the repository layout, or set
`DFACM_CONTROLLED_HISTORY_MODULE` to the absolute installed ops helper path when
taxonomy scripts live elsewhere. Existing ops runtime CJS modules remain
required. Use the installed Hydro package and locked dependencies; do not run
`npm ci` in the addon runtime. The shared deploy/CI shipping changes and process
inventory remain release work outside this local task.

Input is now an immutable versioned batch object (old bare arrays fail safely):

```json
{
  "id": "lq-editorials-20261113",
  "domainId": "system",
  "uid": 3,
  "uname": "hydsvc-0074",
  "entries": [
    {"id": "problem-4072", "docId": 4072, "t": "思路", "c": "int main() {}"}
  ]
}
```

Each batch/entry ID is unique; the actual account must match the exact UID and
service username. Keep the existing service-account score exclusion configured.
The current eligible problem family is local `judge`, default problem/checker,
using the problem's complete data with no config override. Remote problems are
scheduled by Hydro as `remotejudge` and are rejected here. Other task/checker
families also require separate native acceptance evidence.

State defaults to `<batch.json>.state.json`; `DFACM_SOL_STATE` can choose its
location. Reuse **the same canonical batch and state paths on one host** for
all retries. State uses file fsync, atomic rename, directory fsync, and a kernel
`flock` held for the entire verification/publication operation. This is not a
cross-host deployment lock. Never run the same batch through different state
files, manually edit a state file, or unlink its lock while a runner is alive.
Code is marked with a unique batch/entry comment before native insertion;
resume can recover a created RID even if its file receipt was lost.

Timeouts and uncertain scheduling stay pending with their records intact.
The native RID durably claims its first callback history. A reconnect that
creates a second callback retains both histories, marks the RID ambiguous, and
reports pending/manual reconciliation even if one row is AC. Invalid ownership
or persistence failure settles that controlled context to release its native
consumer slot, preserves evidence, and cannot authorize publication. Terminal
cleanup atomically seals the exact claim before deleting its owned artifacts;
late callbacks cannot create new owned histories after that seal. Do not select
the newest history or erase ambiguity/failed markers to resume automatically.
An operator must prove cancellation/completion and reconcile the exact batch,
source, RID and owned histories before authorizing manual recovery.

Durable terminal/cleanup work resumes even if its current problem is missing,
unsupported, has empty testdata, or changed identity. That current invalidation
still rejects publication. Unfinished work remains pending with RID/phase and
the invalidation reason; no new RID is created for an invalid current problem.
An uncertain schedule is not automatically retried: Hydro can remove a queued
task but cannot prove a previously fetched worker has stopped. Reconcile the
existing controlled callback or establish cancellation before any manual
recovery. Cleanup only follows a persisted owned terminal history, and uses
exact RID, UID, domain, source-code marker and history/batch/entry filters.
AC, WA and CE follow the same cleanup protocol. No `document.status` rows,
user statistics, problem counters, or ledgers are deleted or overwritten.

Only owned ACs whose original problem identity, config and testdata metadata
still match may reach `SolutionModel.add(domainId, pid, 1, content)`. The input
and result persist across retries, and an exact editorial content marker
recovers an insertion that succeeded before its receipt was saved. Another
existing editorial is preserved. The shell verifies a unique durable receipt
for the current invocation, because Hydro's CLI can catch errors and exit 0.
Pending, rejected, blocked and missing-receipt runs exit nonzero. `--dry`
checks installed capability, account and batch shape without submitting/publishing.

```bash
bash scripts/taxonomy/run-solutions.sh /absolute/path/batch.json --dry
bash scripts/taxonomy/run-solutions.sh /absolute/path/batch.json
node --test scripts/taxonomy/tests/solutions-apply.test.cjs
```

`tests/native-solutions.cjs` is an explicit isolated acceptance entry point:
call its exported async function with native Hydro models, ObjectId, version
and a writable artifact directory from `hydrooj cli execute`. It refuses any
database other than `dfacm_native_validation`. It compiles trusted C++ fixtures
with `g++`, reads all test files from native StorageModel task payloads, invokes
native callbacks with the production ops adapter, and checks ordinary AC
concurrency and real shop ledger functions. It also exercises durable file
checkpoints, lost native insert/delete receipts, conservative reconnect
ambiguity, and native Cordis disposal. The private-context ownership insertion
used by the old characterization fixture has been removed. It intentionally emulates the worker boundary; it does not
validate the production sandbox/daemon or a remote judge. It retains uniquely
named fixture domains, ordinary fixture records and evidence for audit.

## Working a batch: pre-flight locally, then judge

`preflight.cjs <batch.json>` compiles every solution in a batch and runs it
against that problem's real test files on the server, printing got vs expected
per case. Nothing reaches the judge until it passes locally.

```bash
export PATH=/root/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin
export NODE_PATH=/usr/local/share/.config/yarn/global/node_modules
node /root/preflight.cjs /root/lq-batch-07.json
# Historical preflight input is an array. Convert to the versioned batch above
# and satisfy the ownership release gate before invoking run-solutions.sh.
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

