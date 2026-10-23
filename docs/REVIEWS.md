# Reviews

Past reviews, newest first, and the findings that are still open. The full text of the earlier
review records (`docs/REVIEW.md`, `docs/HARDENING_REVIEW.md` and `docs/STACK_REVIEW.md`) was removed
in this change; git history keeps it on `main` up to `1a4148f`.

## Past reviews

- **23 Oct 2026, whole-stack review of PR #18.** Four parallel reviews of security and cost,
  analysis, accessibility and docs. Fixed in [PR #19](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/19) (`37a54b4`).
- **23 Oct 2026, review of PRs 12 to 20 at `00374fe`.** Migration journal order, hidden CI
  artifacts, backup recipient check and research status. Fixed in [PR #20](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/20) (`1a4148f`).
- **23 Oct 2026, four post-release verification reviews.** Adversarial API, client UI, ops
  checklist and mutation testing. Fixed in [PR #12](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/12) (`73d3449`).
- **22 Oct 2026, interrupted hardening branch at `01e38e2`.** Operations, API integrity, FIT codec
  and client; 12 findings. Fixed before merge in [PR #10](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/10) (`deaf6ba`).
- **22 Oct 2026, engineering review of `a5e03b9`.** Architecture, concurrency across browser,
  Worker, D1 and R2, analysis correctness, security and a live smoke test; 15 findings plus 3 from
  the live path. Fixed in [PR #9](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/9) (`310264a`).
- **Oct 2026, eight-area review.** Analysis, import fuzzing, API abuse, client concurrency, UI,
  mutation testing, operations and live headers. Addressed on the hardening branch and in
  [PR #10](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/10) and [PR #12](https://github.com/BryceCapuano2020/RunningCyclingAnalysis/pull/12).

## Open findings

Each finding below was checked against the code and docs on `main` after the real-file validation
landed. Fixed findings are not listed; the PR links above show where
each fix landed. Backlog items are in
[ROADMAP.md](ROADMAP.md).

- **Real device files (partly closed).** 25 FIT files and GPX/TCX files from three open-source
  projects now pass against independent decoders and the devices' own summaries
  ([validation/devices.md](validation/devices.md), [validation/gpx-tcx.md](validation/gpx-tcx.md)).
  Still open: files from the owner's own devices, and indoor rides that declare no sub-sport.
- **Headline running-versus-cycling bias.** Flat running reads about 13% below the ACSM equation.
  Matched-effort running comes out at 0.79 to 0.86 of cycling, so parity falls outside the 90%
  range at 3, 4 and 5 m/s. The cause is not settled. Source:
  [validation/physiology.md](validation/physiology.md). Tracked in ROADMAP, model accuracy.
- **Model changes need evidence.** The running air-drag term, the gross-efficiency prior (0.215,
  sd 0.012) and the heart-rate discrepancy (0.05) are unchanged. The research notes are provisional,
  and some citations are unverified. Sources: engineering and stack reviews. Tracked in ROADMAP,
  model accuracy.
- **Backups and restore.** `ops/backup-recipient.txt` is still a placeholder, so backup and uptime
  schedules are off. No drill has restored a populated database, and there is no deletion log.
  Sources: engineering, hardening and stack reviews. Tracked in ROADMAP, operations.
- **Production deploys.** Production is still deployed with Wrangler, not the gated Deploy
  workflow, which needs the `production` environment and its secrets. Source: hardening review,
  which left production configuration separate.
  Tracked in [PRODUCTION.md](PRODUCTION.md).
- **Digest-quota counters after migration 0004.** Writes from the previous Worker during rollout can
  leave `digest_bytes` inaccurate. The reconciliation SQL is documented, but nothing records that it
  has run. Source: stack review. Tracked in ROADMAP, operations.
- **Resource ceilings are not strict.** Decompressor callbacks can allocate a slice before the
  output limit applies, and accepted FIT records are kept for processing. The earlier problem of
  decoding the whole file before the record count check is fixed. Source: engineering review.
  Limits are in [PERFORMANCE.md](PERFORMANCE.md).
- **Target-device and free-tier measurements.** Large exports on phones and production Worker CPU
  are unmeasured; the Node benchmark is only a baseline. Source: engineering review. Tracked in
  ROADMAP, operations.
- **Broader release evidence.** Multi-user recovery, larger exports, migration and model-rollback
  compatibility, and Google's public-brand requirements remain open. Google sign-in is still
  External and Testing. Source: engineering review. Tracked in [PRODUCTION.md](PRODUCTION.md).
