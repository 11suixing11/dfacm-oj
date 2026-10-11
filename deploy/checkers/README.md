# Checkers (custom judges)

Sources for `testlib` checkers that were written for this site because the
FPS importer silently drops `<spj>` blocks on import, turning "any optimal
answer is accepted" problems into byte-exact comparisons.

- `10003-spj.cc` — `#10003` 加工生产调度 (Johnson scheduling: verifies the
  claimed total time, per-job appearance, and that the schedule really
  finishes at the claimed time). Config: `10003-config.yaml`.

Deployment recap: upload the checker as `spj.cc` plus a `config.yaml`
carrying `checker_type: testlib` / `checker: spj.cc` through
`ProblemModel.addTestdata` (same-name replacement). Compile locally against
`@hydrooj/hydrojudge/vendor/testlib/testlib.h` and behavior-test before
going live (jury answer AC / alternative optimum AC / mutated answer WA).

The other seven testlib checkers shipped on 2026-10-06 (#1259 #1266 #1341
#1279 #2836 #3124 #3183, plus #4088 DravDe) live inside each problem's
testdata in storage and are covered by the daily backup; their sources can
be pulled the same way if ever needed.
