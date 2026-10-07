# Changelog

## v1.21.0 - 2026-10-07

Full-library taxonomy pass: dedup, statement rebuild, samples, math repair,
eight topic training routes, and an editorial pipeline with verified
solutions.

### Removed

- **46 duplicate problem copies** (45 Codeforces problems that were imported
  once per contest round with 95-100% identical statements + data, plus
  蓝桥杯「矩阵乘方」 which existed twice). Keeper choice: the copy with the most
  test data; every deleted copy had zero submissions and zero references.
  System domain: 4,295 → 4,249 problems. Backup:
  `taxonomy-dedup-backup-20261007.json` (server) + `del46.js` (repo).

### Fixed

- **All 253 蓝桥杯 statements rebuilt** from the original Word sources:
  183 corrupted sample blocks, 29 missing samples and 4 lost-image problems
  repaired in one pass; 237 body figures extracted from the docx media and
  re-attached via `ProblemModel.addAdditionalFile` (including formula images
  and the 夺宝奇兵 map that lived in a junk header paragraph).
- **152 of 196 LOJ statements** freed of the KaTeX disease (raw MathML trees
  scraped into content); TeX recovered from the `katex-mathml` annotation,
  with a suffix rule for fraction/limit reordering. 43 remain (MathJax CHTML,
  need hand-written TeX maps) plus 1 structural edge case.
- **15 深基 remote problems** (4806-4909): computed sample outputs, each
  proven by an AC submission through the srqc relay before publishing; the
  site A+B (docId 1) restated with real judge data. While the hydroac relay
  is down the records wait at status 0 - a server cron applies them
  automatically when they turn AC.
- The 蓝桥杯 plan lost one duplicate chapter entry (254 → 253) and all public
  counts were refreshed (4,249).

### Added

- **8 topic training routes** (搜索与剪枝 / 动态规划 / 图论 / 数据结构 /
  数学 / 字符串 / 贪心与构造 / 二分与枚举优化), 256 problems total, 5
  difficulty-banded chapters each, chained unlock; drawn exclusively from
  verified-healthy CF problems outside every existing plan. Landing page
  gained a topic grid (8 cards + wide XCPC entry), the stats cell now counts
  11 training routes, display font re-subset (640 CJK).
- **Editorial pipeline** (`scripts/taxonomy/`): batch JSON → judge-verified AC
  → `SolutionModel.add` → verification records deleted and problem counters
  restored. 45 editorials published in this pass (蓝桥杯 batches 01-03c,
  including four deep-dive fixes: the 2n-queen same-cell rule, the
  tortoise-and-hare timing check, the C*++ join tokenization, Hankson
  32-bit divisor enumeration, cubic-root dedup and subset-order bits); the
  remaining plan problems continue through the same pipeline.

## v1.20.0 - 2026-10-05

The public identity is now **d&f算法网**, an independent algorithm-training
community. The brand meaning is simple: everyone can find their own final on
the road of algorithm competition.

### Changed

- The primary site is `dfacm.website`; `swpuacm.xyz` and both `www` hosts stay
  as compatible entry points, while public canonical and Open Graph metadata
  use the primary domain.
- Public about, onboarding, training and contest copy no longer describes a
  university-owned or school-selection platform. The site now presents open
  training routes, weekly/monthly events and topic challenges.
- The GitHub repository is published as `dfacm-oj`, with an independent
  description and homepage.

### Compatibility

- Runtime addon directories, Mongo collection prefixes, environment variables
  and deployment paths that begin with `swpu` remain internal compatibility
  identifiers. Renaming those would break existing installations and data;
  they do not define the public brand.

## v1.19.1 - 2026-10-05

The training group QR lived only inside QQ. It now ships with the landing
page, so any visitor can join straight from the homepage.

### Added

- **`oj 训练群` join card on the landing page's call-to-action section**: a
  cropped, palette-quantised QR tile (`landing/assets/qq-training-group.png`,
  640px, ~55KB, decodes to `https://qm.qq.com/q/8mG7ByDyCc`) beside the group
  name, a one-line feature blurb (AC 播报 / 每日榜单 / 比赛战报 / 答疑互助)
  and the group number 1128735782. The QR itself is a link, so on phones a
  tap opens the qm.qq.com join page directly; on desktops it scans normally.
  Display font re-subsetted (624 → 634 CJK glyphs) for the new blurb text.

## v1.19.0 - 2026-10-05

The site's role is settled: an independent teaching/training tool, with public
weekly/monthly events and topic challenges alongside an untimed, self-paced
ICPC track in the
Luogu/Nowcoder "不限时训练" tradition.

### Added

- **`【进阶】XCPC 专题训练 108 题` training plan** (tid
  6ac38fb88b364d5443b9ee22). Nine chapters with a rising difficulty arc
  (d2 → d8): a mandatory four-chapter spine (warm-up → search → basic data
  structures → graphs), four parallel topic tracks (advanced data structures /
  DP / math / strings) unlocking after the spine, and a final "冲顶突击"
  graduation chapter gated on all four tracks. Within every chapter problems
  ramp from its floor to its ceiling (stratified sampling), the warm-up
  chapters reserve slots for Chinese remote-judged problems as an on-ramp, and
  no problem already in the ybtbas/lanqiao plans is reused. Selection
  pipeline and review list: `scripts/xcpc_select.cjs` +
  `deploy/culture/selection.md`; replay and API notes: deployment.md §21.

### Notes

- Training create API confirmed: `POST /training/create` takes
  title/content/dag(JSON string)/pin(**UnsignedInt**)/description; the dag node
  unlock is all-or-nothing (`requireNids` chapters must be fully AC'd), so
  mandatory-chain chapters must not contain mis-difficulty'd outliers - the
  selection script carries a manual BLACKLIST (network-flow and ZJOI-level
  problems the heuristics had misplaced).
- The problem `data` array entries are objects (`{name, etag, size}`), not
  strings - counting test pairs requires `e.name`; a naive String() count
  reports zero pairs for everything.

## v1.18.0 - 2026-10-05

The site had polish but no pulse: every problem was imported, the discussion
area was empty, and /wiki/about was stock legal boilerplate. This release
seeds the independent community's guides, discussion structure and training
culture, plus landing links that make that material reachable from the front
page.

### Added

- **Culture seed runbook (`deploy/culture/`)**. One-time seeding through the
  service-account session: a `d&f算法网` discussion-node category (公告 / 云剪切板 /
  闲聊), four pinned posts authored as the site owner (the algorithm
  onboarding guide, the problem-authoring tutorial with the config.yaml / SPJ / interactive examples, a weekly-race walkthrough
  covering post-contest solution culture, and a how-to-ask guide), an
  /wiki/about rewrite keeping the stock privacy/tos sections,
  mountain-flavored training chapter titles (大本营 → 登顶眺望) with
  senior-tone plan descriptions, the site's first contest (海拔周赛 R0, ACM
  rule, five warm-up problems, allowViewCode for post-contest learning), and
  footer links to the guide and the paste node. Replay, gotchas and the
  executed ids: deployment.md §20.

- **Landing community links and route-map identity**. The footer community
  column now leads with the freshman guide and the paste node; the 山外 column
  gains the bilibili usage tutorial and the LaTeX cheat sheet; the brand blurb
  carries the QQ group and the closing CTA a kaomoji. The training route map's
  waypoints are renamed to the mountain identities (大本营 … 登顶眺望) to match
  the training-plan chapters, keeping the topic name in the mobile list and
  aria labels. Display font re-subset (624 CJK).

### Notes

- Hydro's sudo flow requires touching a `@requireSudo` page before POSTing
  the password (the session must first receive sudoArgs); a 302 from
  `POST /manage/setting` is not evidence of success - verify the stored value.
  All three settings updates go through the manage API and take effect
  without a restart.
- `operation=init_discussion_node` flushes every discussion node before
  re-adding them; never re-run it once posts exist (post parentId would
  dangle). Future node additions must insert node documents directly.

## v1.17.0 - 2026-10-05

Ranking fixes: members who had solved exactly one easy problem were invisible
on the leaderboard, and one's own row was hard to find as the board grows.

### Fixed

- **First-AC members got RP 0 and vanished from the leaderboard.** The
  upstream problem component compresses raw scores with
  `max(0, min(raw, log(raw) / log(1.03)))`, and the log branch is exactly 0 at
  raw == 1 - which is precisely what a single difficulty-1 AC contributes.
  The ranking page filters `rp > 0` and calcLevel only assigns ranks to
  rp > 0, so those members appeared nowhere on the board while their profile
  read "RP: 0 (No. ?)". `deploy/patch-rating-floor.sh` floors any positive
  raw score at 1 RP, mirroring the contest component's own `max(1, ...)`
  floor. Replay and verification notes: deployment.md §19.

- **One's own position was hard to find on a long leaderboard.** The ranking
  template patch now also brands the signed-in viewer's own row (the pinned
  row and the in-list row) with `.swpu-row--self`; the brand layer paints a
  highlight, a left accent bar and a "你" badge. New marker `SWPU ACM patch:
  ranking self-row highlight`; the template script applies both ranking
  patches in order, so a fresh upstream template is fully patched by a single
  run. Replay and verification notes: deployment.md §18.

## v1.16.0 - 2026-10-04

A hardening pass over the boundaries of the customisation layer: the seams
between Hydro and the plugins, and between the deploy scripts and the live
server. Test count went from 136 to 200; every fix below has a regression test
or a CI lock, and the behavioural tests added for the boot-payload,
Cloudflare-range and CSRF-wiring fixes were each confirmed to fail against the
old code.

### Security

- **The `/reg` boot payload was assembled with `String.replace` and a string
  replacement (`plugin-swpu-regcode`).** The replacement is JSON containing an
  OAuth provider's `text`, and a string replacement expands `$&`, `` $` ``,
  `$'` and `$$` — so a provider whose text contained `` $` `` spliced the
  remaining ~400 lines of `reg.html` into the inline `<script>`. Now uses a
  function replacer.
- **Registered email addresses could be enumerated at request rate.** `/reg/code`
  and `/reg/login` answer differently for a known vs unknown address, and
  `UserModel.getByEmail` ran *before* any rate limit. Both now pass a probe
  budget keyed on the submitted address and the real client IP first. The key
  uses Hydro's `_handleMailLower` rather than a bare lowercase, because a
  per-address budget keyed on the raw string is trivially evaded with `+tag`
  variants.
- **Theme backups were written inside the directory Caddy publishes.**
  `install-theme.sh` used `mktemp "<target>.bak-…"`, which for the static theme
  and service-worker targets means `/root/.hydro/static` — served by
  `root *` + `try_files {path}` + `file_server`. Every `*.bak-*` file was a
  public download and nothing pruned them. Backups now live in `BACKUP_DIR`
  (default `/root/swpu-theme-backups`), and the script refuses to run if that
  directory is inside the served tree.
- **The service-account purge deleted far more than the RP calculation reads.**
  `createSanitize` issued `deleteMany({uid:{$in:[3]}})` with no `docType`, so
  every hour it removed every `document.status` row for the judge account
  across all domains and all document types — problem statuses, but also
  training enrolments. Now scoped to `docType: 10`. Two further guards: the
  target uids are verified against the user collection at boot and the purge is
  refused if one does not look like a service account, and
  `SWPU_SERVICE_UIDS_DRYRUN=1` turns it into a `countDocuments` report.
- **Two `innerHTML` sinks fed by data the page did not fully control.**
  `reg.html` concatenated an OAuth provider's icon *and* text into one
  assignment; the icon is now parsed as XML with scripts, event handlers, style
  and external references stripped, and the label uses `textContent`. The
  landing page's welcome line concatenated the scraped username; it is built
  from nodes now, with entities decoded once so the text is neither raw nor
  double-escaped.
- **Five state-changing POSTs had no CSRF token** (`/reg/complete`,
  `/reg/login`, `/mistakes/update`, `/mistakes/remove`, `/shop/redeem`,
  `/manage/shop`, and `/mistakes/sync`). Each now mints a token into the
  session — a plain mutable object, the same one `loginAs` writes — and echoes
  it through that page's existing data channel: the `/reg` boot payload, a
  `window.__SWPU_CSRF__` marker in `mistakes.html`, and a hidden field in the
  two shop forms. Comparison is `timingSafeEqual` with a length pre-check.
  Sending a code (`/reg/code`) deliberately still works without a token: a
  first-time visitor has no account to protect, and requiring one would make
  registration impossible.

### Data integrity

- **A failed badge grant destroyed the member's points.** `redeem()` debited
  the ledger and *then* called `userBadgeAdd`; if the badge plugin threw, the
  error surfaced while the debit was already irrecoverable. A failure now
  writes a `refund` ledger row and reports that the points came back.
- **Two different badges could be bought with the same balance.** The
  `{uid, ref}` unique key only prevents buying the same badge twice; balance was
  read, compared and then inserted with nothing in between. Redemptions are now
  serialised per uid, which is correct for the single-instance pm2 deployment
  the plugin already assumes — the comment says so, since several app instances
  would need a multi-node lock or a transaction.
- **Shop business errors never reached the member.** `ShopError` messages such
  as "积分不足：当前 12 分，兑换需 50 分。" were never caught, so every failure
  was a generic 500. Both clients are plain form POSTs, where a JSON body is
  not rendered either — Koa's redirect wins. A failed POST now redirects back
  with the reason in the query string and the templates render it.
- **The mistake book reported deletions that never happened, and its
  "unclassified" option always errored.** `MistakesRemoveHandler` discarded
  `remove()`'s return value; `/mistakes/sync` had no try/catch while its
  siblings did; and the page's `未分类` option (value `""`) was rejected by the
  store's reason list.
- **The mistake book's "open" filter could not use its index.** It matched
  `resolved: {$ne: true}`, and `$ne` is not a usable range bound, so the
  `{domainId, uid, resolved, lastAt}` index could not serve the query and every
  page sorted in memory. Every write path already stores an explicit boolean, so
  `false` is equivalent and indexable.
- **The shop backfill scanned without a limit**, awaiting a problem lookup plus
  an insert per unique record. Bounded now, and truncation is reported rather
  than silent — the idempotency key makes a re-run resume the work.

### Deployment

- **`deploy.sh` installed before it verified.** On a hash mismatch it correctly
  refused to restart, but the server had already been modified: new brand CSS,
  new service-worker killswitch and new plugin sources on disk while the old
  process kept serving, with no way back. The run is now staged — upload into a
  `mktemp -d` directory, hash both ends, and only then install. A staging
  mismatch leaves the live site untouched. New `--stage-only` rehearses the
  upload without touching anything.
- **The manifest shipped `landing/index.html` and nothing else**, so the two
  subsetted woff2 fonts and the seven icons were never delivered by the
  orchestrator: changing one required a manual `install-landing.sh` that
  `deploy.sh` would never run. The whole `landing/` tree is now enumerated,
  `install-landing.sh` runs as part of activation, and `smoke.sh` asserts the
  fonts and icons are actually reachable rather than merely uploaded.
- **`install-theme.sh` had forward-only backups and non-atomic writes.** A run
  failing post-write verification left four rewritten targets with no way back,
  and `cat >>` interrupted mid-write left truncated CSS. Content is now staged
  in the target's own directory and swapped with one rename, and an `EXIT` trap
  restores everything already touched. Retention is bounded by
  `SWPU_THEME_BACKUP_KEEP` (default 10).
- The staging path was the fixed `/tmp/swpu-deploy-stage`, which a local
  unprivileged user can pre-create or symlink before extraction on a root box.
  SSH now defaults to `StrictHostKeyChecking=accept-new`; this session runs as
  root over both Tailscale and a public address. `install-landing.sh` gained
  `nullglob`.

### Correctness and honesty

- **The 蓝桥杯 card's four differently-named stages were anchors that all
  pointed at one training.** Hydro exposes no per-stage URL for a DAG node, so
  each promised a destination and then opened the route entry page. They are now
  plain labels with the route link as the sole affordance.
- **The landing session probe used a fixed 48-character lookback** to find
  `href="/user/"`. An upstream template adding one attribute between `href` and
  `class` would silently degrade every page to the guest view. It now walks back
  to the enclosing anchor tag.
- **The README advertised BBR congestion control**, which no file in the
  repository configures, and DNS-layer HTTPS records, which `deployment.md`
  states Cloudflare publishes automatically. Both claims corrected; CI now
  rejects their reintroduction, because a tuning claim nobody can verify rots
  silently.
- `deployment.md` sections were numbered `0..10, 15, 16, 11, 17, 12, 13, 14,
  18` — §15/§16 were appended later and §11 got pushed down. Renumbered by
  document order, and an orphaned checklist item moved out of 角色分组 back to
  the verification list it belongs to.
- Removed a byte-identical duplicate block in `theme/00-brand.css` and the dead
  `data-count` attributes on the landing stats — nothing read them, and
  `data-count="4298"` had drifted from the visible `4,295` while a test
  protected the stale value.

### CI

Each new check covers something the production run does but CI did not, or a
regression class CI had no lock for: `shellcheck -S warning` (`bash -n` only
parses), `caddy adapt --validate` on `Caddyfile.example` (`check-deployment.sh`
already runs this on the live config, and the file had uncommitted changes),
byte-identical Cloudflare range lists between the global `trusted_proxies`
block and the `@fromcf` matcher, the `@hidejudge` 404, reintroduction locks for
both injection classes above, and a wiring check that every state-changing POST
declares *and* verifies the CSRF token while every client sends it.

That last check earned its place immediately: it found that
`ShopManageSaveHandler` read a `csrf` argument it had never declared with
`@post`, so Hydro would not have populated it and admin pricing would have
failed on every submission. The handler tests stub the decorators as no-ops, so
only a check comparing declarations against call sites could see it.

### Known gaps

`scripts/subset_fonts.py` needs font TTFs that are not committed. The download
and regeneration steps are now documented in `landing/FONTS-LICENSE.md`,
including the caveat that the glyph set is a static scan of the HTML, so new
copy needs a re-run.

## v1.15.0 - 2026-10-04

### Fixed

- **The ranking board showed the signed-in user twice (`deploy/patch-ranking-template.sh`).** Upstream `ranking.html` renders the viewer's own rank row above the list unconditionally, so the #1-ranked member saw themself duplicated and the numbering read 1, 1, 2, 3... The pinned row is now skipped while the viewer's stored rank already falls inside the current page's window — it still pins on later pages and for members without a rank, keeping the upstream "show my position" intent. The patch is idempotent and marker-based so a ui-default upgrade can be repaired by re-running the script, which fails loudly if the upstream anchor moves. The condition is deliberately pure arithmetic: the bundled nunjucks build has no `namespace` global, no `map` filter, and crashes on attribute assignment in `{% set %}`.

## v1.14.0 - 2026-10-04

### Added

- **Self-enforcing service-account hygiene (`plugin-swpu-ops`).** The v1.12.0 incident root cause — the RP script scores `document.status`, not `record`, and `calcLevel` writes the stored rank without filtering `join`, so one leftover solved-status row for the judge service account (hydsvc-0074) resurrected phantom RP and displaced every real member — is now guarded by the system instead of a human memory item: every RP recalculation purges service-account rows from `document.status` before computing (aborting the run, not computing on a dirty source), the live hook deletes a service account's just-written status row on sight, and the purge list is configurable via `SWPU_SERVICE_UIDS` (default `3`, empty disables). The judge account's `record` rows are deliberately left alone — they are debugging evidence and do not feed RP.
- **Every member reaches the ranking boards, whatever created the account (`plugin-swpu-ops`).** The v1.12.0 auto-join covered only `/reg/complete`; a GitHub (or any OAuth) first login funnels into Hydro core's `UserRegisterWithCodeHandler`, which sets no join flag, and admin-created accounts don't either — such members stayed invisible on `/ranking` even after solving (surfaced by the owner's own GitHub-registered account missing its poj membership). Two layers close the gap: the plugin now hooks Hydro's serial `auth/login` event — the chokepoint every login and registration path ends in (`SWPU_AUTO_JOIN=0` to disable) — and joins the member to `system` + `poj` on sight with existing roles preserved, and the hourly sweep reconciles every member's join flags (missing domain docs inserted with the default role, service accounts excluded).
- **Hourly RP sweep (`rp-sweep.cjs`).** Mutations that bypass the record flow — contest deletion, admin edits, manual database fixes — fire no events, and Hydro's own `task.daily` only recomputes at 03:00. The sweep reruns the RP script for all domains every hour (3-minute startup delay past the 75-second readiness window, pm2 instance 0 only, `SWPU_RP_SWEEP=0` to disable, serialized with the live path through a shared lock so two RP computations never overlap), bounding out-of-band staleness to one hour.
- **`swpuRpSweep` admin script** — `hydrooj cli script swpuRpSweep '{}'` performs an immediate purge + full-domain recalculation after out-of-band data fixes, replacing the hand-typed `rp` CLI invocation.

### Fixed

- The shop plugin asked MongoDB to create an explicit `_id` index on `swpuBadgePrice` at every boot; Hydro's `ensureIndexes` injects `background: true`, which MongoDB rejects for `_id` specifications, so each restart (and every CLI invocation) logged an index error. The call was dead weight — the `_id` index is implicit — and is removed; the ledger's idempotency indexes are untouched.

### Removed

- The landing page's “最快一次评测 2.5ms” stat. The 2.5ms came from a judge test submission whose records were removed in the v1.12.0 cleanup, leaving the headline number unattributable to any real member; the stats row now shows three cells. `scripts/landing.test.cjs` locks the removal.

## v1.13.0 - 2026-10-04

### Added

- **Points shop (`plugin-swpu-shop`)** — badges become something you earn and spend. Every problem's first AC credits 1–10 points by difficulty (the same algorithm Hydro's RP script uses, ported verbatim from `lib/difficulty.ts`), and admins put badges on sale at `/manage/shop` for members to redeem with their balance at `/shop` (guest-browsable). Redemption reuses the installed badge-for-hydrooj model for ownership (`userBadgeAdd`) — no fork, no modification; wearing still happens on `/mybadge`.
  - Idempotency is index-backed: `swpuPointsLedger` has a unique `{uid, ref}` key (`solve:{domainId}:{docId}` per solve, `redeem:{badgeId}` per redemption), so resubmissions, event replays and double-spend races can never double-credit; inserts that hit the key are silently absorbed.
  - `/shop/history` shows the full ledger with a running balance (prefix sums across pages, 20/page); balance is a live `$sum` aggregation — the site is small, no cache yet.
  - `swpuShopBackfill` script replays historical AC records (`kind: 'backfill'`, same idempotency key, safe to rerun); the `record/change` hook awards live, pm2 instance 0 only, error-isolated from judging.
  - New collection prefix `swpu` (`swpuPointsLedger`, `swpuBadgePrice`); no new npm runtime dependencies; covered by 21 unit tests plus deployment wiring assertions; smoke battery gains `/shop` 200, badge-table render and the `/shop/history`, `/manage/shop` guest gates.

## v1.12.0 - 2026-10-04

### Fixed

- **New students were invisible on the ranking board.** Hydro lists only domain users with `join=true`, and neither native registration nor `UserModel.create` sets that flag — it normally only comes from an explicit domain join or an admin role assignment, so members could solve problems and still never appear on `/ranking` (or `/d/poj/ranking`). `/reg/complete` now auto-joins the system domain and the POJ mirror via `DomainModel.setUserRole(..., 'default', true)` right after account creation, so the boards pick members up as soon as they solve something. Existing members were joined on the server during the fix.
- Server ops (not in-repo): the hidden judge account still carried solved-problem statuses in `document.status` — the earlier cleanup removed its `record` rows, but Hydro's RP script (`src/script/rating.ts`) scores `document.status`, not `record`, so every recalculation resurrected phantom RP=40 and rank 1 for it, pushing each real member's stored rank down by one (the only human on the board showed rank 2 while topping the visible list). All residue (problem statuses in both domains, a training-plan enrollment, mistake-book rows) was deleted with backup and ranks recomputed; operating rule: never let the judge account AC a problem, or clean its `document.status` afterwards.

## v1.11.0 - 2026-10-04

### Added

- **Session-aware landing page.** The static homepage no longer greets signed-in members with “登录 / 注册账号”: since `sid` is HttpOnly and `home.html` is served straight from Caddy, the page now probes an SSR route (`fetch('/p')`, same-origin) for the nav markers Hydro renders — `nav_login` for guests, `nav_logout` plus the `<a href="/user/<uid>" class="nav__item">` link for members (verified against the live template). Members see their username linked to their profile, a 工作台 pill in place of 注册账号, a “欢迎回来” hero line, and matching mobile-menu entries; a 1-hour `sessionStorage` cache paints returning visitors without waiting for the probe and rolls back if the probe reports guest. Covered by `scripts/landing.test.cjs` (vm sandbox over the shipped script: wiring lock, member, guest, stale-cache rollback, expired cache, displayName variant and fail-safe paths).

### Fixed

- Landing stats had drifted from reality: “4 判题语言” (29 languages are selectable on local problems, verified on A+B) and “8.1ms 最快一次评测” (a 2026-10-04 AC on problem 4326 judged in 2.5ms, verified in `db.record`). Both refreshed; the display font subset was regenerated (440 → 545 CJK), which also restores display-font glyphs for onboarding copy added by the frontend merge.

## v1.10.0 - 2026-10-04

### Added

- **One-command deployment orchestrator (`deploy/deploy.sh`)**, run from the local checkout: ships every file (plugins, landing, theme assets, smoke script) before the single `pm2 restart hydrooj`, verifies sha256 on both ends and refuses to restart on mismatch, waits until the new process serves the branded page, then runs the smoke battery. `--sync-only` skips the restart for static-only changes. Exit codes: 64 usage, 65 hash mismatch (never restarts), 66 missing source/unreachable server, 67 not ready within 75s, 68 smoke failed. Plugin file lists are parsed from `deployment.md`'s documented `cp` blocks so the docs and what ships can never drift.
- **Anonymous smoke battery (`deploy/smoke.sh`)**, executed on the server after every deploy via loopback `--resolve`: server-side boot injection markers (tab/embed/oauth), bare `/login` and `/register` convergence, guest gates, regcode bad-purpose rejection, framing/HSTS/cache headers, the 404-without-cache regression, HTTP→308 and the Service Worker killswitch. Count-agnostic — no hardcoded problem totals.

### Fixed

- Root cause of the 2026-10-04 audit finding: the live process had been serving pre-merge plugin code because files landed after the previous restart. The orchestrator's sync→verify→restart order makes that structurally impossible, and the smoke battery would have caught the missing OAuth injection within seconds.
- Server ops (not in-repo): daily backup cron restored (root crontab was empty since Oct 2), pm2 log rotation installed, orphan `custom/reg.html` removed, stale `swpu-regcode/package.json` synced.
- **Judge account profile page returned 500 for every visitor since account creation**: the 2026-10-01 Mongo-clone that created the judge user stored `regat` as a plain `{$date: ...}` object instead of a BSON Date, crashing the `user_detail.html` template's `dt.getTime()`. Fixed in the database; the smoke battery now locks a user profile page render so this class cannot regress silently again.
- **`hydrooj-rating-system` had silently dropped out of `addon.json`** (lost when the list was rewritten to register `swpu-train`), making `/rating` 404. Re-registered and verified. Note for contest organizers: the plugin's `contest/finish` auto-hook is an upstream stub — ratings are managed via its `/manage/rating*` CSV workflow.

### Added (ops runbook)

- `docs/upstream-issue-regcode-content-type.md`: ready-to-file upstream draft for the framework `@post` decorator crashing with a 500 TypeError on unparseable request bodies instead of a 400.

## v1.9.0 - 2026-10-04

### Added

- **Personal training workbench at `/workbench`** (plugin `swpu-train`, from PR #4): enrolled plans with progress, the next unfinished problem in the current chapter, this week's training stats (Asia/Shanghai week, non-contest submissions) and recently failed problems, so returning users can resume training directly.
- **Mistake book at `/mistakes`**: judged failures (WA/TLE/MLE/OLE/RE/CE) are collected automatically per problem, with editable error reason, review notes and re-solve status; a later AC marks the entry resolved. First visit backfills from recent submissions; contest finals are included, pretest/generate excluded. `SWPU_TRAIN_MISTAKES=0` disables live collection.

### Fixed

- Reject external, backslash and control-character auth return paths on the branded page; password login now submits an explicit safe redirect instead of returning to its Referer.
- Add a visible native two-factor/passkey login entry and top-level OAuth/password-recovery links; retain inputs and restore controls on login failure or timeout.
- Serialize live RP recalculations and coalesce changes arriving during a slow run. Ignore progress, pretest and generation events, bound diagnostic history, and stop queued work when the addon unloads. `SWPU_LIVE_RP=0` disables live recalculation.
- Include `live-rp.cjs` in the documented addon installation. Theme deployment now validates all targets before writing, creates unique backups even on first install, preserves minified CSS without a trailing newline on reinstall, and verifies installed assets.
- Set the light system default without resetting users' choices; initialize missing footer configuration safely and idempotently.

### Tests and documentation

- Add page-script regression tests and slow-RP, disposal, fresh-install and theme-reinstall scenarios; pin development dependencies with an npm lockfile and use `npm ci` in CI.
- Cover mistake-book collection/backfill, workbench assembly and route wiring with unit tests.
- Synchronize theme filenames, default behavior, addon write effects and development/deployment instructions.

## v1.8.0 - 2026-10-04

### Fixed

- **Auth overlay escape routes are usable from the first frame** (`deploy/clean-auth-entries.js`): while the embedded `/reg` iframe loads, the shell now shows a close ✕ and a 「直接打开登录页」 link immediately instead of a blank dark box; a failed/stalled load (10 s) falls into an error state that keeps both. The direct link now opens the **top-level `/reg` without `embed=1`** — it previously carried the embed flag, so the top-level page booted in iframe mode where the in-card ✕ and the `swpu-auth-success` postMessage had no host to receive them (close and login relay both dead). The iframe success check now requires a `/reg`-specific DOM marker (`#tab-reg`) instead of "URL contains /reg and has a body", so a Caddy/Hydro error page served at the same URL can no longer be revealed as the login card. Closing the overlay also cancels the pending load timer. Verified the OAuth root cause on the way: `@hydrooj/login-with-github` concatenates `` `${server.url}oauth/github/callback` `` for the token-exchange `redirect_uri`, so the missing trailing slash on `server.url` (not the GitHub App callback, which is correctly registered without one) was what broke the exchange — the live config already carries `https://swpuacm.xyz/`.

## v1.7.0 - 2026-10-03

### Added

- **GitHub third-party login is live** (official `@hydrooj/login-with-github` addon; OAuth App credentials configured in the server system config on 2026-10-03 — secrets stay server-side only). Verified end to end: the branded `/reg` page and the in-place auth modal render the button via the server-injected `loginMethods`, and `/oauth/github/login` redirects to GitHub's authorize page. First sign-in auto-creates the account (GitHub name/email, avatar as `github:<login>`).
- **Roles `acmer` and `teamleader`** on the system domain (permission equals builtin `default`, value `1370624076369558733505`); new users keep the builtin default role. Previous roles state backed up at `system.roles.backup-20261003`.
- System config `server.url` fixed from the retired `.bot.cd` domain to `https://swpuacm.xyz/` (the trailing slash is required by Hydro's OAuth callback concatenation; it feeds lost-password mail links and share links; the old value is backed up at `config.backup-20261003`). GitHub's registered callback remains `https://swpuacm.xyz/oauth/github/callback` without a trailing slash.

## v1.6.0 - 2026-10-03

### Added

- **Live RP ranking** (`plugin-swpu-ops/live-rp.cjs`): Hydro only recalculates RP in `task.daily` (03:00), so a freshly solved problem took until the next night to show on the ranking page. The ops plugin now listens on `record/change` and reruns the domain `rp` script ~30s after a judged submission (debounced — a contest burst yields at most one run per window; registered on pm2 instance 0 only; idempotent with the daily task). The `swpu-ops` addon is now actually deployed to the server (it previously existed only in the repo) and keeps a replay copy in `/root/swpu-theme-deploy/plugin-swpu-ops/`.

### Fixed

- `hydrooj-rating-system` disabled and removed from `addon.json` (data and directory retained for re-enable); the stale `unify-login-entries.js` hijack installer was removed from the server replay dir so it cannot resurrect the old modal-redirect; merged branches `pr-1`/`pr-3` and the stale `oj-frontend-preview` worktree deleted; dead `dialog--signin` theme rules removed.

## v1.5.0 - 2026-10-03

### Changed

- **Login is now clean — no forced redirects, no native auth UI anywhere.** Caddy serves the branded `/reg` page *in place* at the native auth URLs (`rewrite` instead of `302`): bare `GET /login` renders the branded page with the password tab active at the same URL, bare `GET /register` renders it with the register tab. `POST /login`, `GET /login?...` (two-step flows) and `POST /register` / `/register/<token>` still pass through untouched. The rewritten `?tab=pwd` reaches the regcode plugin through Hydro's merged handler args, which boots the right tab via an injected `window.__SWPU_BOOT` script (the browser URL keeps no query after a rewrite).
- **Every login-required trigger now opens the branded page itself, in place.** `deploy/clean-auth-entries.js` replaces Hydro's global `showSignInDialog()` with an overlay that embeds `/reg?embed=1` (same-origin iframe, compact card layout); the native `dialog--signin` is never shown (and hidden + replaced if it ever slips through before the hook applies). The header 登录 button — whose jQuery handler bypasses the global function — is intercepted at capture phase on `[name="nav_login"]`. On mobile Hydro navigates to the nav href, which now points at the branded page anyway. The embedded page posts `swpu-auth-success` / `swpu-auth-close` to the host: success navigates the host to the `return` path (site-relative only, validated), so users land back where they started, logged in. Close via the in-card ✕, Esc, or clicking the backdrop. `/reg` alone is downgraded to `X-Frame-Options: SAMEORIGIN` / `frame-ancestors 'self'` (two disjoint header matchers — a later `header` line cannot override the catch-all block); every other route keeps `DENY` / `frame-ancestors 'none'`.
- `/reg` noscript fallback links now point at `/login?fallback=1` / `/register?fallback=1` so they still reach the native pages after the rewrite.
- Password login on `/reg` now distinguishes outcomes by response status: 403/401 (and a bare `/login` render) mean wrong credentials; any other non-2xx reports the status instead of mislabeling, and two-step-verification redirects navigate to the native 2FA step as before. Hydro renders `footer_extra_html` line-by-line inside `<ol>` items, so multi-line scripts are shredded into inert text — every installed script stays on one line (the historical multi-line `/login` banner script never executed; its remains are removed and the feature reinstalled as a single line).

## v1.4.0 - 2026-10-03

### Changed

- The site now has exactly one login interface. Bare `GET /login` is redirected (302) to `/reg?tab=pwd` by Caddy — `POST /login` and `GET /login?...` (two-step verification flows) pass through untouched. Hydro's in-page login modal (`dialog--signin`, shown on restricted pages when signed out) is intercepted by a footer script (`deploy/unify-login-entries.js`) and replaced with a redirect to `/reg?tab=pwd&return=<current path>`; `/reg` honors the `return` parameter (site-relative paths only) on both the code-login and password-login success paths, so users land back where they started.

## v1.3.0 - 2026-10-03

### Added

- `/reg` is now a one-stop auth page with a third `密码登录` tab: the form posts natively to Hydro's `/login` (uname/password/rememberme plus the tfa/authnChallenge hidden fields), enhanced with a seamless fetch submit that detects success by the final URL (wrong credentials return 403 on `/login`; success redirects away, including two-step-verification flows). The footer links switch to the password tab in-page and point lost-password to `/lostpass`; landing page login links now target `/reg?tab=pwd`. Verified end to end with a temporary user (created, logged in via POST /login with session cookie, preference page 200, deleted).

## v1.2.0 - 2026-10-03

### Changed

- Default theme switched from forced dark back to Hydro's native light; every user can pick Light/Dark in preferences again (`preference.theme` system key removed, per-user `theme` fields cleared, `ui-default` default restored to `light`).
- Brand overlay rebuilt as `theme/00-brand.css` covering both modes: shared base (brand fonts, buttons, active menu, table/markdown readability, focus rings), dark specifics (dark nav, body contrast, immersive auth pages) and new light specifics (white nav with gold edge, deep-gold highlights for AA contrast, light table headers, light immersive auth gradient). Replaces the dark-only `00-native-dark-brand.css`.

### Added

- Footer theme toggle injected via `ui-default.footer_extra_html`: signed-in users get a one-click `白天 / 夜间` switch hitting `GET /set_theme/:theme` (redirects back, guarded by `PRIV_USER_PROFILE`); guests are pointed at the login flow instead.
- Landing page dual-theme: default light with the full CSS variable set re-based for day (deep-gold accents, light ridges/mountains, white cards), `html.dark` carries the original night look; day/night toggle button in the nav (and mobile menu) persisted in `localStorage 'swpu-theme'` with a head-level anti-FOUC script; the OJ footer toggle now writes the same key so the landing page follows the OJ choice (`deploy/update-footer-toggle-sync.js`). The judge terminal card intentionally stays dark in both modes; `meta theme-color` follows the active mode.
- Fixed the immersive auth pages (login/register/lostpass): the native full-page backdrop lives on `.layout--immersive #panel` (an ID selector that outranks any class combination), so the brand overlay now targets `#panel` for both modes — light gets the soft gradient panel with all native inverse white text re-based for day (labels, inputs, checkboxes, supplementary links, footer), dark keeps the brand gradient and now actually clears the leftover native wallpaper image.

## v1.1.0 - 2026-10-03

### Security

- `swpu-regcode` stores verification codes as salted SHA-256 digests instead of plaintext, binds each code to its salt/generation/UID/purpose, and consumes it with an atomic `findOneAndDelete` so concurrent requests cannot reuse one code.
- Login codes are only sent to the account's bound mailbox; registration codes are bound to the exact delivery address that received them.
- `swpu-regcode` now runs Hydro's login policy checks (disabled account, `server.login`, two-factor/passkey accounts, contest-mode IP binding) before issuing and before consuming a code, and emits `auth/before-login`, `user.loginSuccess` and `auth/login` with codes/passwords stripped from the audit record.
- Real client IP resolution (direct peer wins, loopback falls back to the proxy-written XFF) is used for rate limits, login records and contest IP binding.
- Caddy cache headers now apply only to successful static responses; `/home.html` keeps `no-cache` after the `/` rewrite and `/resource/*` keeps Hydro's own policy. Requires Caddy 2.9.1+ for `header ... { match status 2xx }`.

### Added

- `plugin-swpu-ops`: read-only admin scripts for weekly training reports (CSV/Markdown) and judge health summaries (Markdown/JSON), registered with Hydro's `PRIV_EDIT_SYSTEM` + sudo script permissions and no HTTP routes.
- `scripts/backup-hydro.sh`: locked, non-destructive backup wrapper around `hydrooj backup --withAddons` with ZIP validation, sidecar state archives, checksums and offsite/restore guidance.
- `scripts/check-deployment.sh`: read-only deployment checks with `--role web|judge` and opt-in HTTP cache verification.
- Handler-level regression tests for `swpu-regcode` and `deploy/deployment.md` sections on backup/restore, deployment checks and manual judge acceptance.

### Repository

- CI now installs the regcode test dependency, runs the regcode handler tests, the ops plugin tests and the deployment script tests.

## v1.0.0 - 2026-10-03

### Security

- `swpu-regcode` now uses `crypto.randomInt` for six-digit codes.
- Verification codes are bound to their `purpose` (`reg` or `login`).
- Failed attempts are counted with an atomic MongoDB update, so concurrent guesses cannot bypass the five-attempt limit.
- Code verification checks `expireAt` explicitly instead of relying only on delayed TTL cleanup.
- Client IP extraction uses `request.ip` for direct connections and only trusts the first `X-Forwarded-For` entry when the direct peer is loopback.
- Caddy adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and a minimal `Content-Security-Policy`, and overwrites client-supplied XFF.

### Changed

- Landing page finishes the `swpuacm.xyz` migration and adds canonical, Open Graph, Twitter card and icon metadata.
- Registration front end handles fetch/network failures without leaving buttons stuck in a loading state.
- Theme direction is now Hydro native Dark plus `theme/00-native-dark-brand.css`; 01-05 remain as legacy fallback.
- `deploy/install-landing.sh` installs `index.html` as `home.html` and flattens `landing/assets/*`.
- `deploy/install-theme.sh` applies the brand overlay idempotently and supports the legacy overlay set via `SWPU_THEME_LEGACY=1`.
- Deployment docs cover reverse-proxy IP handling, security headers, plugin symlink caveats and reproducible installs.

### Repository

- Added plugin unit tests for code format, expiry, purpose binding and verification filters.
- Added GitHub Actions CI for secret scanning, plugin tests, retired-domain checks, shell syntax and Python compilation.
- Added `.gitattributes` and ignored local secret/QA files.
