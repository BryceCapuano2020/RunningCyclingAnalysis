# Continuation review

Reviewed the full-stack handoff at `a5e03b9` from the perspective of a staff engineer evaluating
mid-level ownership. The continuation now includes a live deployment and a synthetic production
smoke on 22 October 2026. D1, private R2 and Google sign-in are configured; live persistence,
original-file recovery and rollback were exercised. Real device and model validation remain
separate open questions.

## Assessment

The separation between a browser analysis core, versioned per-activity summaries, a shared API
contract, and a small storage backend is a reasonable design for this project. Keeping analysis
on the device makes the backend's role clear. Owner-scoped queries, hashed sessions, explicit
upload limits, and browser tests against a real local API are good foundations.

The handoff's implication that repeated reviews had established readiness was too strong.
Passing isolated tests did not cover concurrency across D1 and R2, imports during account
hydration, queued profile edits, or the propagation of invalid sensor data through derived
streams. The original headline also claimed sporting ability and maximal effort more strongly
than the model justified. These are engineering judgment issues, not missing cosmetic features.

For a mid-level hiring decision, I would advance the creator to an interview, with particular
attention to independent ownership of the failure paths below. The architecture and delivery
show useful implementation ability. I would still want the creator to explain the concurrency
invariants, distinguish model assumptions from validation, and demonstrate ownership on real
input files before trusting the analytical conclusions in production. Adding a backend and more
tests does not by itself resolve those concerns.

## Findings addressed in this continuation

| Priority | Finding                                                                                                                                                        | Correction                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Files dropped while `/api/me` was loading were analyzed locally and then replaced by server hydration; they were never uploaded.                               | Queue imports until account lookup resolves and place them after hydration.                                                          |
| High     | StrictMode could terminate the initial worker after its hydration request, while the transition ref prevented the replacement worker from loading the library. | Reset the transition baseline on worker cleanup; test StrictMode setup/cleanup/setup.                                                |
| High     | A late worker response could repopulate the visible library after sign-out.                                                                                    | Clear visible state immediately and suppress replies belonging to queued prior-account work.                                         |
| High     | Rapid full-profile writes could overwrite one another or restore an old snapshot after failure.                                                                | Merge intended edits, serialize writes, wait for them before sign-out/deletion, and roll back to the latest saved profile.           |
| High     | Activity-count and stored-byte limits used separate reads and writes, so concurrent requests could exceed them.                                                | Enforce admission with atomic conditional D1 statements; reserve bytes before writing R2.                                            |
| High     | An upload completing after deletion or file-storage opt-out could leave an original in R2.                                                                     | Recheck owner and storage permission during finalization, clean up late objects, and test both deletion paths.                       |
| High     | Concurrent Google callbacks could link competing subjects to the same verified email.                                                                          | Perform identity admission in one conditional SQLite statement and resolve concurrent user creation.                                 |
| High     | Grade smoothing spread an altitude discontinuity beyond the excluded sensor span, allowing inflated running estimates into accepted windows.                   | Mask the complete smoothing footprint wherever grade-derived quantities are consumed.                                                |
| High     | A GPS fault invalidated otherwise clean measured cycling power through a shared validity mask.                                                                 | Separate power, motion, and grade masks; intersect only the inputs each calculation requires.                                        |
| High     | FIT pauses were inferred from missing records rather than timer events, so short pauses were interpolated as effort.                                           | Use explicit timer state where available and retain gap inference only as a fallback.                                                |
| Medium   | Incompatible heart-rate evidence could underflow every weight or concentrate an interval on a few draws.                                                       | Share sampling code, normalize log weights, report effective sample size, and use the unadjusted prior when support is insufficient. |
| Medium   | “Stronger” and “all-out” language implied conclusions the uploaded data could not establish.                                                                   | Describe estimated energy use and model ranges, qualify the effort context, and state omitted uncertainty.                           |
| Medium   | The cycling-higher percentage used the wrong denominator, and mean absolute percentage error was displayed as a ± bound.                                       | Use the reciprocal ratio for cycling relative to running and label the error statistic directly.                                     |
| Medium   | Handoff CI failed when a mobile period label was covered by another control.                                                                                   | Prevent labels from shrinking over their contents, wrap segments, and test narrow viewports with enlarged text.                      |
| Medium   | Direct API deploys assumed an existing web build; deployment docs described obsolete architecture.                                                             | Build assets through the deploy command, block placeholder remote configuration, and align the guide with the single Worker.         |

The FIT timer handling was checked against Garmin's official
[activity encoding guide](https://developer.garmin.com/fit/articles/cookbook/encoding_activity_files.html).
The pause regression uses independently encoded boundaries, not only a round trip through our
own encoder.

The handoff commit's GitHub Actions run was **failed**, not pending, when checked:
[CI run 39706535015](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/actions/runs/39706535015).
Unit/build and dependency-audit jobs passed; mobile period selection timed out because another
label or the toolbar intercepted the click. Newer runs belonged to dependency-update branches,
not a newer version of `main`.

## Further hardening completed

The next pass addressed the operational gaps identified above:

- Added a separate model revision, atomic same-file summary upgrades, and browser rebuilding
  from retained originals. Legacy and future revisions are excluded with distinct recovery notices.
- Bound queued writes to the initiating account, including cross-tab session changes. Account
  changes terminate the previous worker; failed workers restart once with a manual recovery path.
- Bounded archive extraction, FIT parsing, response bodies, pagination and request time. Large
  activity tables render 20 entries per page. Failed or oversized originals produce a partial-save
  notice rather than a false success.
- Added production rate-limit bindings, strict static/API security headers, sanitized diagnostics
  and request ids. A Worker-served browser test verifies the actual CSP, assets and API together.
- Gated normal deployment on the complete release suite and real configuration. CI actions are
  pinned, flaky retries fail the build, and deployment consumes verified assets from the same run.
- Removed the vulnerable transitive esbuild version used by development tooling and verified a
  fresh dependency install. Added a reproducible five-year core benchmark and documented its limits.
- Added persistent deployment-wide R2 budgets: 4 GiB of lifetime write-attempt charges (at least
  64 KiB per attempt), 90,000 ordinary monthly operations and 100,000 total monthly operations
  including cleanup lists. Failed attempts remain charged; account deletion cannot reset the
  ledger. Delayed month-boundary and concurrent near-cap regressions verify admission behavior.
  These constrain this application's traffic, not another client using the bucket or account.
- Made original-file retention opt-in and added explicit unavailable-storage and exhausted-budget
  behavior. Imports keep saving summaries when originals cannot be uploaded, without repeatedly
  attempting more uploads in the same exhausted batch.

## Findings from the live acceptance path

- Enabling original-file retention and re-importing an already-saved activity skipped the sync
  sink, so no original was uploaded. Re-imports now use the idempotent, hash-guarded API when
  retention is enabled, preserving the activity id and avoiding an extra PUT for an existing file.
- A file selected immediately after a profile edit could capture the old retention or weight
  settings. Signed-in imports now await submitted profile writes and use their authoritative
  snapshot. Failed writes, account changes and Stop cancel preparation with recovery guidance.
  The retention choice is also available before the first import, with accurate upload wording.
- The empty-database backup drill missed a real restore failure: a populated export inserted child
  rows before creating the users table. The offline restore helper validates the snapshot and emits
  schema-first, parent-first SQL. Its output was then restored through Wrangler and the recovered
  original read through the app. This is why empty or isolated success cases cannot establish
  operational readiness.

## Important remaining work

1. **Independent model validation.** The deterministic simulator shares assumptions with the
   implementation. It is useful for implementation consistency, but does not establish accuracy,
   uncertainty coverage, or fair sporting comparisons on real athletes. Real device-file
   validation remains outstanding.
2. **Large-library and free-tier measurements.** The five-year synthetic Node benchmark is a
   baseline, not evidence of target-phone memory or production Worker CPU. Measure real exports
   on target devices and Cloudflare. Aggregate account/storage costs still require monitoring.
3. **Broader release evidence.** The live synthetic smoke now covers Google callbacks, cookie
   flags, persistence, original uploads/downloads and deletion, a populated isolated restore, and
   rollback across the retention hotfix. It exposed missing acceptance paths despite the earlier
   green suites. Broader device coverage, coordinated multi-user recovery, larger exports and future
   migration compatibility still require evidence. Google Auth remains in Testing and verified
   public branding is not complete; see [PRODUCTION.md](PRODUCTION.md).
4. **Model changes require evidence.** Running drag, different efficiency priors, and a larger
   heart-rate discrepancy term need independent sources and validation. In particular, reconcile
   gross versus net efficiency before adding resting energy to the cycling conversion. Treat the
   old roadmap formula as a proposal, not an approved correction.
5. **Resource ceilings are not strict allocation bounds.** The FIT SDK decodes a whole message
   collection before the record-count check, and decompressor callbacks may allocate before output
   limits are enforced. See [PERFORMANCE.md](PERFORMANCE.md) for the precise remaining limits.

Population scoring, more formats, labels, swimming, and strength are product extensions. They
should follow reliable ingestion, persistence, model communication, and independent validation.

## Verification

- `npm run verify:release`: passed, including 1,162 unit tests across 82 files, coverage thresholds,
  eleven deployment/restore tests, formatting, lint, all workspace typechecks, production build,
  and both browser suites.
- Main browser suite: 74 passed, one intentionally skipped desktop-only duplicate of the phone
  overflow check. Tests cover desktop/mobile Chromium and mobile WebKit, accessibility, account
  persistence and isolation, file retention/deletion, imports during account lookup, legacy-library
  rebuilding, opt-in file retention, and enlarged text. Upload retries that could conceal dropped
  files were removed.
- Worker browser suite: two passed, on Chromium and mobile WebKit, with the actual static CSP,
  module worker, API security headers and immutable assets.
- Full production and development dependency audit: no vulnerabilities reported after removing
  the vulnerable development-tooling transitive dependency.
- Wrangler bundle dry-run and live deployment: passed. Production sign-in and synthetic D1/R2
  persistence, file recovery, deletion and rollback were checked; see [PRODUCTION.md](PRODUCTION.md).
- README screenshots regenerated and visually inspected.

The browser run with these results used a stable build directory. An earlier run overlapped with
screenshot rebuilding and was discarded after two asset-loading failures.

The R2 budget implementation passed independent Linux CI at commit `0c2530c`, including the full
dependency audit, code/build checks and both browser suites, in
[run 39734938177](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/actions/runs/39734938177).
Later documentation-only updates clarify reuse of existing resources and record the empty-database
restore; recheck the current PR head before release. Installation and auditing are separate, and
audit network waits are bounded without bypassing the required check. See
[PRODUCTION.md](PRODUCTION.md) for operational behavior and the remaining launch evidence.
