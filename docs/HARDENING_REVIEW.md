# Interrupted hardening review

Reviewed the interrupted `hardening` branch at `01e38e2` against the deployed baseline on
22 October 2026. Three Luna reviewers independently checked operations, API integrity and the
new FIT codec; the coordinator checked client integration and combined verification.

The handoff's build/crash warning was stale: initial type-checking and 135 focused client tests
passed before this cleanup. That did not establish release readiness. The branch combined several
large changes without completing the release gate, and the operational defects below were serious.

| Priority | Finding                                                                         | Correction                                                                                                              |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| High     | A restore preview inherited the production R2 bucket and maintenance cron.      | Require a separate scratch bucket and remove cron from the preview configuration.                                       |
| High     | GitHub's implicit success condition skipped rollback after a failed smoke test. | Explicit failure-aware rollback condition.                                                                              |
| High     | Orphan cleanup could delete unrelated keys outside the application's namespace. | List only the `users/` prefix; preserve unrelated objects in a regression test.                                         |
| High     | A 45-second unpaused standstill invalidated long running best efforts.          | Exempt stationary samples from unknown-grade masking while retaining sensor-error masks and resting energy cost.        |
| High     | Changed digest semantics still identified themselves as model revision 2.       | Revision 3 distinguishes rebuilt results from previously saved estimates.                                               |
| Medium   | Direct deploy skipped the documented clean-main safety check.                   | Run the release guard before verification and include operations tests in the release gate.                             |
| Medium   | Maintenance could exceed D1 Free's query allowance.                             | Bound account deletion work to two accounts per invocation.                                                             |
| Medium   | Public deep-health probes could consume the shared monthly R2 allowance.        | Atomic probe ceilings of 300/day and 9,300/month, plus one request/minute/address.                                      |
| Medium   | FIT output omitted the endian-ability bit on multibyte field types.             | Emit canonical field definitions and check them independently of tolerant SDK decoding.                                 |
| Medium   | New API failures had generic or misleading client recovery instructions.        | Separate daily-limit, upload-in-progress and account-deletion messages.                                                 |
| Medium   | Library-full guidance promised deletion without a UI.                           | Paginated saved-library management, including outdated entries, with explicit confirmation and owner-scoped server IDs. |
| Medium   | Import completion was not wired to the page.                                    | Per-import outcomes and one persistent drop zone across landing/results transitions.                                    |

The decoder replacement reduces the shipped dependency surface and has differential and fuzz
coverage. Its reported speedup measures decoding on a synthetic input, not complete import time
or real-device compatibility. Likewise, new budgets and signed cookies improve specific invariants;
they do not make the system universally reliable.

Outdoor runs with missing altitude remain excluded from grade-dependent estimates and explicitly
flagged. Assuming flat terrain would produce an unsupported numerical result. Real device testing
and independent physiological validation remain necessary.

This branch has not been deployed during cleanup. Before release, provision the new random
`SESSION_SIGNING_KEY` (existing sessions will expire), apply migration 0003, and use the gated
release workflow. Backup and monitoring workflow files are implementation, not evidence that their
secrets, encryption recipient, schedules or recovery have been configured and exercised remotely.
Repository publication and production configuration are separate actions from this review.

## Cleanup validation

The check stages passed: formatting, lint, workspace types, 1,534 unit tests with coverage,
12 deployment/restore tests, 23 operations tests, and the production build. The browser rerun
passed 77 main tests (one intentional skip) and both Worker-served tests across Chromium and
mobile WebKit. Stale headline expectations and an ambiguous rejection-text selector were corrected
before that rerun. The complete dependency audit reported zero vulnerabilities.
