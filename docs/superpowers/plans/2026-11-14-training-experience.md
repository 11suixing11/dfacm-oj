# Training Drafts and Resume Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve mistake-review drafts through list operations and request races, and make homepage training continuation choose the actual unfinished route and next problem.

**Architecture:** Keep the existing standalone HTML and injected domain routes. Mistakes use account/domain/PID-scoped dirty state with optional tab sessionStorage and memory fallback; only the latest fixed-query read may render. Homepage and workbench share unfinished-first summarization, batched status reads and existing native training-context URL construction.

**Tech Stack:** Hydro5.0.7/TypeScript/CommonJS/HTML, Node22/node:test/linkedom, existing esbuild.

**Spec:** The approved scope and acceptance below implements the user's “好，你来做” for the recommended first optimization batch. No broadcast, collector, PTA or AI-project subsystem implementation is included.

## Global Constraints

- Hydro **5.0.7** and ui-default **4.58.5**; Node.js **>=22.13**. Reuse exact existing dependency locks; no dependency updates.
- Existing system/poj routes, CSRF protections, production `swpu-*` names and collections remain. No production data, website, provider or message actions.
- Work in the existing linked worktree on `fix/training-drafts-and-resume`, base `103091246eea059132b6afdc49fe7e3b815ea535`.
- Preserve raw notes as text, URL and script/attribute escaping, guest/static fallback and existing training DAG unlock semantics.
- Tests load actual production scripts/functions/handlers; mock only browser/network/DB infrastructure. Deferred response gates and fake clocks make races deterministic.

---

## Approved Scope and Acceptance

1. Editing A's reason/note then resolving/removing B, synchronizing, changing filter/page or reloading the same account/domain must not discard A. Persist only dirty drafts in same-tab sessionStorage when available; otherwise retain memory and clearly state page-only storage.
2. Dirty/save/error feedback is per item. Successful save clears only the exact submitted snapshot: edits typed during the request remain dirty. Failed, timed-out or rejected save preserves text/reason and retry. Successful explicit removal clears only that PID's draft; failed/cancelled removal preserves it.
3. Draft keys include the page's server-injected positive user ID and domain ID. No guessed identity from names/CSRF. Corrupt/blocked storage cannot break the page; changed account/domain cannot restore another scope's notes.
4. Each GET has a fixed filter/page snapshot, sequence/abort ownership and a 10-second deadline. Only the newest request updates rows/count/pager/empty/error/loading; old success/failure must not append mixed rows or overwrite current UI. POST's existing CSRF and 15-second timeout remain.
5. Recently completed A/B/C cannot hide joined unfinished D on homepage. Rank joined candidates by real activity/pin/docId, compute status before truncation and then choose unfinished first. Preserve legacy activity-derived fallback when no joined routes exist.
6. Query shared problem statuses once per recent summary, batch-load visible next problems and reuse native route/trainingProblemUrl helpers. Completed cards are explicit review links; unfinished cards choose visible next problem, current chapter, then route. Existing DTO fields remain, new next/current fields additive.
7. Homepage recent normalization and welcome continuation use the same safe target, preserve cached old DTO fallback, limit to3, reject off-origin/unsafe routes and accept correctly encoded domain paths. Empty/failure/guest/static and bfcache behavior remain.

## File Responsibilities

- `plugin-dfacm-train/mistakes.html`: draft/read ownership and existing form operations.
- `plugin-dfacm-train/index.ts`: safe per-page draft scope injection only; no new HTTP endpoints.
- `scripts/preview/pages.cjs`: explicit local preview draft identity if this raw template path needs it.
- `plugin-dfacm-train/workbench.cjs`: shared route shortlist and richer recent DTO.
- `landing/index.html`: additive DTO normalization, accurate card/welcome actions.
- New focused production-browser fixtures/tests stay under `plugin-dfacm-train/tests/` or `scripts/` and execute shipped HTML.
- Existing train/root tests, README and a short completion report are updated only as required by these contracts.

### Task 1: Draft-safe latest-query mistakes UI

**Files:** Modify `plugin-dfacm-train/mistakes.html`, `plugin-dfacm-train/index.ts`, `scripts/preview/pages.cjs` if needed; create `plugin-dfacm-train/tests/mistakes-browser-fixture.cjs` and `plugin-dfacm-train/tests/mistakes-frontend.test.cjs`; update relevant handler/page/domain fixtures and README.

**Interfaces:** Consumes existing `__SWPU_ROUTES__`, `__SWPU_CSRF__`, `{items,page,pages,total,open,noteMaxLength}` and existing POST routes. Produces `window.__SWPU_MISTAKE_SCOPE__={uid,domainId}` via `/*__SWPU_MISTAKE_SCOPE__*/`; the fixture exposes `openMistakesBrowser(options)` with actual handler-rendered HTML, memory tab storage, controlled deferred fetch/timers and returned document/calls/flush/click/edit helpers.

- [ ] Add actual browser regressions for A draft/B toggle/remove/sync/filter/page, session reload/scoped accounts/domains, blocked/corrupt storage, dirty reason, save failure/rejected/timeout and edits during successful save.
- [ ] Add deterministic older open response returning after latest done/all, stale failure, repeated paging and GET timeout; assert current rows, counts, pager and retained drafts, not request-call presence alone.
- [ ] Run focused tests red and record literal original-loss/race assertions before production edits:

```bash
node --test plugin-dfacm-train/tests/mistakes-frontend.test.cjs
```

Example required observable assertion (fixture contract defined above):

```javascript
test('resolving B preserves A draft without auto-saving it', async () => {
  const b = await openMistakesBrowser({ domainId: 'poj', uid: 42 });
  b.edit(1001, { reason: 'boundary', note: 'unsaved A' });
  await b.click('[data-act="toggle"][data-pid="1002"]');
  assert.equal(b.document.querySelector('#note-1001').value, 'unsaved A');
  assert.equal(b.storedNote(1001), 'saved A');
});
```

- [ ] Implement scoped dirty snapshots and safe storage fallback, with a key formed from explicit identity:

```javascript
function draftStorageKey(scope) {
  if (!scope || !Number.isSafeInteger(scope.uid) || scope.uid <= 1 || typeof scope.domainId !== 'string') return null;
  return 'swpu-mistake-drafts:v1:' + scope.uid + ':' + encodeURIComponent(scope.domainId);
}
```

Native injection uses the existing JSON delimiter escaping pattern; page-local memory remains functional when key/storage unavailable. Input/change captures drafts; rendering overlays dirty values. Save compares current dirty snapshot with the submitted snapshot before cleanup; explicit successful remove deletes one key only.

- [ ] Implement fixed read snapshot and monotonically owned sequence. Abort old requests, always clear the matching timer, and update DOM only while `requestId === latestRequestId`. Render each accepted result as a single replacement, preserving draft state; never append old results.
- [ ] Run focused green, existing domain/handler/page tests, full train `npm test`, `npm run check:build` and root preview once final; self-review and explicit local commit.

### Task 2: Correct homepage next-action shortlist

**Files:** Modify `plugin-dfacm-train/workbench.cjs`, `landing/index.html`, existing `plugin-dfacm-train/tests/workbench.test.cjs`; create focused recent/home browser tests under train/tests or scripts; update existing handler/page/root assertions and README only when contracts change.

**Interfaces:** Existing buildRecentTrainings/buildWorkbench signatures remain. Recent DTO adds `currentNid,currentTitle,currentUrl,next` compatible with workbench, retaining `tid,title,url,done,total,percent,completed,lastActiveAt,source`. Next is null or visible `{pid,title,url}` with native training context. No changes to Task1 scope marker or POST APIs.

- [ ] Write literal joined A/B/C complete plus older D incomplete regressions, all-complete review mode, no-enrolment old activity fallback, next visibility/deleted/locked cases, system/poj URLs and one batched status call.
- [ ] Execute shipped landing recent IIFE with fixture DOM/cache/fetch and assert card/welcome hrefs/labels, cached old DTO, malicious links, guest/empty/failure; red before modifying core or homepage.

```bash
node --test plugin-dfacm-train/tests/workbench.test.cjs scripts/landing.test.cjs
```

- [ ] Share a named shortlist helper with the current workbench rule:

```javascript
function selectTrainingShortlist(summaries, limit) {
  return [...summaries.filter(item => !item.completed), ...summaries.filter(item => item.completed)].slice(0, limit);
}
```

Build recent candidates from joined routes with real activity rank; preserve activity-derived fallback for no joins. Compute all statuses with one union query, then shortlist; resolve visible next PIDs in one batch and reuse trainingUrl/trainingProblemUrl.

- [ ] Normalize additive local URLs in homepage as data. For incomplete routes, prefer valid next.url then currentUrl then route URL; completed routes always link to route with review text. Both cards and welcome use one target helper. No html concatenation with untrusted title/username/URLs.
- [ ] Run focused green/full train/build/root landing+preview+repository/deployment checks appropriate to additive DTO; docs, self-review and explicit local commit.

### Task 3: Integration and independent review

- [ ] Verify no new runtime file is omitted from delivery or preview; existing actual installed-addon check remains useful.
- [ ] Run final train/full root affected suites once and source/HTML syntax/whitespace; preserve Node22 evidence and deterministic red/green logs under ignored QA.
- [ ] Independent task reviews and a final scoped branch review check drafts/save-inflight/request races and domain/next-link safety; fix findings with covering checks.
- [ ] Update current completion status and concise report while keeping unperformed live browser/production deployment distinct. Keep the new branch local until integration authorization; no production/remote actions implied by this UI implementation request.

## Plan Self-Review

All7 acceptance requirements map to Task1 or Task2. Task1 source/index/preview and tests own draft scope; Task2 core/home/test source does not change that marker or POST APIs. Both consume existing native URLs and preserve domain/CSRF. No locked dependency changes or new service. Full preview/build/delivery is integration-only and may need sequencing because existing deployment tests temporarily mutate source fixture files.

## Execution

The user authorized the first batch. Use the recommended subagent-driven implementation in this session, with task review gates; choosing this execution mechanism is routine delegated judgment, so no additional user approval question is required.
