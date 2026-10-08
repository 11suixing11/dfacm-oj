# Library health audit

Read-only audit of the whole `system` domain behind the 2026-10-08 report
(`docs/audit-2026-10-08.md`). Every script here only reads Mongo and fetches
pages; none of them mutate the database.

## Running them

```bash
export PATH=/root/.nix-profile/bin:/usr/local/bin:/usr/bin:/bin
export NODE_PATH=/usr/local/share/.config/yarn/global/node_modules
node /root/audit-statement.cjs      # statement metadata, 14 defect classes
node /root/audit-testdata.cjs       # testdata structure from data[] metadata
node /root/audit-coverage.cjs       # editorial coverage, plan integrity, near-dupes
node /root/audit-figures.cjs        # figure audit, data[]/additional_file[] is truth
node /root/audit-authoritative.cjs  # recount from Mongo alone (no HTTP)
node /root/audit-samples-fixed.cjs  # sample census, handles 样例说明-style samples
node /root/status-summary.cjs       # one-page aggregate of all of the above
```

Artifacts land in `/root/audit-*.json`; keep them, they are the evidence behind
the report's numbers.

## Two rules learned the hard way

**Prefer Mongo over HTTP.** The site answers 403 under burst, so a page-fetch
scan silently misses pages (44 of them on the first pass). Anything decidable
from stored data - whether a figure exists, whether a sample exists, whether the
`html` flag bypasses KaTeX, whether a statement is Chinese - is decidable from
Mongo with no rate limit. `audit-authoritative.cjs` is the fallback for exactly
that; `audit-missed.cjs` audits the specific pages a fetch pass could not reach.

**Enumerate every variant of a structure before calling it missing.** The first
sample check matched `input1` fences only, so it flagged the two 样例说明-style
samples as absent and reported 18 missing instead of 5. A structure you can
write in more than one way has more than one way to satisfy the check.

## Files

| file | reads | answers |
|---|---|---|
| `audit-statement.cjs` | Mongo | stub/empty statements, missing samples, `[pic]` placeholders, katex residue, `html:"true"`, unrated difficulty, missing tags, English statements, missing images, title defects |
| `audit-testdata.cjs` | Mongo (`data[]` metadata) | orphan `.in`/`.out`, no complete pair, single testpoint, 0-byte input, size outliers, missing `config.yaml`, checker declared but absent |
| `audit-coverage.cjs` | Mongo | editorial coverage per plan and overall, chapter/difficulty banding, cross-plan overlap, shingle-Jaccard near-duplicates |
| `audit-figures.cjs` | Mongo | figure refs resolved against the real file store; classifies dead vs third-party |
| `audit-figcause.cjs` | Mongo | which import batch the dead figures came from, and why each died |
| `audit-authoritative.cjs` | Mongo | HTTP-free recount of dead figures / external hosts / `html:"true"` / no-sample / English |
| `audit-missed.cjs` | Mongo + prior scan | defect census for the pages a fetch pass could not reach |
| `audit-samples-fixed.cjs` | Mongo | sample census that recognises both block samples and 样例说明-style ones |
| `audit-served.cjs` | HTTP | what the browser actually gets: literal `$`, `katex-error`, `&#92;`, broken images, external hosts, missing samples. **Throttled - 16 concurrent trips the 403 guard.** |
| `audit-served2.cjs` | HTTP | 4-concurrent retry of whatever pass one got 403 on |
| `audit-union.cjs` | artifacts | unions the per-class flag sets and breaks them down per training plan |
| `audit-infra.cjs` | pm2 / Mongo / curl | process uptime, judge queue, error log, remote source health, cron, disk, route smoke, backup freshness |
| `status-summary.cjs` | artifacts + Mongo | the one-page table used to answer "how is the library doing" |
| `scope.cjs` | Mongo | per-batch matrix: size, in-plan, editorials, usage, English, dead figures, math, `html:true` |
| `cf-scope.cjs` | Mongo | translation workload for the Codeforces batch: which problems need it and how many prose chars that is |

## Caveats

- `audit-served*.cjs` will report a page as failing when it actually 403'd; the
  retry pass exists because of that. Read `err` in the artifact before trusting
  a count.
- An `<img>` counted as live by `audit-figures.cjs` can still fail in a browser
  if the storage layer 302s to a signed URL that rejects re-probes. That is why
  the figure audit trusts `data[]`/`additional_file[]` over HTTP status.
- `record.pid` is a **number**. Filtering with `{pid: {$in: ids.map(String)}}`
  silently matches nothing.
