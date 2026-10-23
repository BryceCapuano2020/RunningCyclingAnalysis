# API limits, budgets and operations

## Cloudflare free-tier figures (verified 2026-10-22)

Each figure was read from Cloudflare's documentation on 2026-10-22. The "page dated" column is the
"last updated" date the page shows.

| Service      | Limit                              | Figure                                                                                                                                      | Source (page dated)                                                                                           |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Workers      | Requests per day                   | 100,000; counter resets 00:00 UTC; excess returns Error 1027                                                                                | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (Oct 12, 2026)                   |
| Workers      | CPU time                           | 10 ms per HTTP request; 10 ms per Cron Trigger invocation                                                                                   | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (Oct 12, 2026)                   |
| Workers      | Subrequests, memory, cron triggers | 50 per invocation; 128 MB per isolate; 5 cron triggers, 15-minute wall time                                                                 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (Oct 12, 2026)                   |
| Workers Logs | Log events                         | 200,000 per day; 3-day retention                                                                                                            | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (Oct 2, 2026)                  |
| D1           | Rows read                          | 5,000,000 per day                                                                                                                           | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (Apr 21, 2026)                           |
| D1           | Rows written                       | 100,000 per day                                                                                                                             | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (Apr 21, 2026)                           |
| D1           | Storage                            | 5 GB total for the account (pricing page)                                                                                                   | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (Apr 21, 2026)                           |
| D1           | Database size                      | 500 MB per database on Free (the stricter figure; the limits page and the pricing page both list storage, and this is the per-database cap) | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (Apr 21, 2026)                             |
| D1           | Queries per Worker invocation      | 50 on Free (1,000 on Paid). The limits page does not say how batches count; this code assumes each batched statement counts                 | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (Apr 21, 2026)                             |
| D1           | Bound parameters per query         | 100                                                                                                                                         | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (Apr 21, 2026)                             |
| R2           | Storage                            | 10 GB-month per month (Standard storage only)                                                                                               | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (Oct 1, 2026)                                     |
| R2           | Class A operations                 | 1,000,000 per month. Includes PutObject, ListObjects, CreateMultipartUpload                                                                 | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (Oct 1, 2026)                                     |
| R2           | Class B operations                 | 10,000,000 per month. Includes GetObject, HeadObject                                                                                        | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (Oct 1, 2026)                                     |
| R2           | DeleteObject                       | Not billed as Class A or B                                                                                                                  | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (Oct 1, 2026)                                     |
| Web Crypto   | Streaming digest                   | `crypto.DigestStream` exists as a non-standard Workers extension; `crypto.subtle.digest` takes a single buffer                              | [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) (checked 2026-10-22) |

Static assets are served without using the Worker request quota, as `docs/DEPLOY.md` states. That
statement was not re-verified on 2026-10-22.

## Daily budgets

Each budget counts one kind of request per user per UTC day. The count is one row per user, day
and action. It is incremented by an upsert with `WHERE used < limit`, so concurrent requests cannot
exceed the limit. Over-budget requests return **429 `daily_limit`** with `Retry-After` set to the
seconds until the next 00:00 UTC. The per-minute limiter still returns `rate_limited`. The values are
exported as `DAILY_LIMITS` from `@rca/contract`.

| Action                                                     | Limit per user per UTC day | Notes                                                                                                     |
| ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| File downloads                                             | 50                         | Refunded if R2 refuses the read before it starts.                                                         |
| Profile writes                                             | 50                         | Includes keepFiles toggles.                                                                               |
| Activity deletions                                         | 50                         |                                                                                                           |
| Activity creates                                           | **2,000**                  | Deliberate deviation, see below. Only inserts count; a retry that returns the existing activity does not. |
| Original-file uploads                                      | **2,000**                  | Deliberate deviation, see below. Refunded when the byte quota or the R2 budget refuses.                   |
| Authenticated reads (`GET /api/activities`, `GET /api/me`) | 1,000                      |                                                                                                           |

**Deviation from the owner's default of 50.** A first Strava export import is hundreds to thousands
of activities, so activity creates and uploads need a higher daily allowance. The lifetime cap of
5,000 activities still applies. Use the 2,000 figure only for those two actions.

Daily rows older than seven UTC days are pruned by the scheduled job.

## Other per-user limits

| Limit                       | Value                     | Enforcement                                                                                                                   |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Activities stored           | 5,000                     | `users.activity_count`, changed in the same D1 transaction that inserts or deletes the row.                                   |
| Original-file bytes stored  | 1 GiB                     | Reserved in the activity row before R2 is called.                                                                             |
| Concurrent original uploads | 2                         | `upload_slots`. A slot expires after 5 minutes, so a crashed request frees it. Expired slots are pruned by the scheduled job. |
| Request body                | 256 KB digest; 50 MB file | Checked before parsing and while streaming.                                                                                   |

## Deployment R2 ledger

The ledger counts ordinary R2 operations and PUT bytes per UTC calendar month. Deep-health HEAD
probes have a separate global budget, because unauthenticated monitoring must not consume the normal
application allowance. Counters reset at their UTC day or month boundary in `r2_storage_budget`.

- **Ordinary operations: 100,000 per month hard cap**, 90,000 for ordinary traffic. That is 10% of the free
  1,000,000 Class A, so it stays well below the free Class A and Class B allowances.
  Cleanup keeps 10,000 headroom.
- **Deep-health probes: 300 per UTC day and 9,300 per UTC month.** The public endpoint is also
  limited to one request per minute per address. The global ceiling allows at most 9,300 extra
  R2 HEAD operations monthly, even when probes come from many addresses.
- **PUT bytes: 2 GiB per month**, `MAX_MONTHLY_R2_PUT_BYTES`. Each PUT attempt is charged at least
  64 KiB. The sizing is a judgement. Standing storage is what the free 10 GB-month allowance
  measures. At 2 GiB a month, stored data reaches 10 GB after about five months with no deletions,
  so review usage monthly.
- **`lifetime_put_bytes` is an audit total only and is never enforced.** The earlier lifetime cap
  disabled uploads permanently once reached. It was the bug this ledger replaces.
- **Known gap:** the ledger bounds monthly writes, not standing storage. A live stored-bytes counter
  would close that gap. It is not implemented.

### Operator reset

The ledger resets itself at the start of each UTC month. To reopen uploads inside a month after
reviewing usage, generate the SQL and run it against production. It applies only when the stored
month matches `--period`, and it never touches the audit total:

```sh
npx wrangler d1 execute rca --remote --command "$(node apps/api/scripts/reset-r2-budget.mjs --period 2026-10 --put-bytes 0 --operations 0)"
```

## Estimated D1 writes (not measured)

D1 writes are charged per row, including index rows. The 100,000 rows written per day are shared by
all users. Rough per-request estimates from statement shape:

- A read counted against the daily budget: about 2 rows.
- An activity create: about 8 rows (activity row with its indexes, daily upsert, counter).
- An upload: about 5 rows.

On Free, 100,000 writes a day supports only a small number of heavy users. Fifty users each reading
1,000 times a day would use the full write allowance, which is not sustainable on Free. Measure
before launch, and plan for Workers Paid if usage grows.

## Open risks and decisions

- **CPU on Free (10 ms per request).** Hashing a 50 MB upload with SHA-256 and parsing a 1 MB list
  page are both likely to exceed 10 ms of CPU. This is an estimate and has not been measured. The
  app needs Workers Paid for production uploads, or a measured confirmation that the free plan can
  handle them.
- **Streaming the SHA-256.** `crypto.DigestStream` exists, but the hash must be verified before the
  object is written. The body is single-pass, so streaming would need a staging key and a copy,
  which doubles Class A operations. Bodies are still buffered, with at most 2 uploads per user.
  Nothing caps uploads across the whole isolate, and two 50 MB buffers per user could pressure a
  128 MB isolate. A global upload cap is a decision for the owner.
- **Unknown paths outside `/api`.** The web app has no client-side routes, so `not_found_handling`
  is `none`. Unknown paths, including missing `/assets/` files, return a plain 404 from the asset
  platform. Missing `/assets/` files that reach the Worker get a plain-text 404 too.

## Session cookies

Cookies are `<token>.<HMAC-SHA256(token)>` with `SESSION_SIGNING_KEY`. A value without a valid
signature is refused before any D1 call. Production needs `wrangler secret put SESSION_SIGNING_KEY`.
The key is at least 32 random bytes. Rotating it signs every user out. Before this change, unsigned
cookies were valid, so existing users must sign in again after the first deploy.

## Scheduled job

`[triggers] crons = ["17 3 * * *"]` runs `runMaintenance` (`src/maintenance.ts`), and each step is bounded:

- Deletes sessions that have expired or passed their 90-day end, up to 500 per run.
- Prunes expired upload slots and daily rows older than seven days.
- Finishes up to two interrupted account deletions. A deletion records a `pending_account_deletions` row before it starts.
- Sweeps two pages of 90 keys per run for R2 objects with no activity row, older than one hour.
  The listing cursor persists in `r2_storage_budget.orphan_sweep_cursor`.

The run is designed to stay under the Workers Free limits. CPU is not measured. The D1 query count is estimated at up to about 47 in the worst case (two deletions with files, two orphan pages), against a limit of 50.

## Health

- `GET /api/health`: static, no storage.
- `GET /api/health/deep`: `SELECT 1` on D1 and a HEAD on a sentinel R2 key. Returns 200 when both pass,
  otherwise 503, with a JSON body of `{status, checks: {d1, r2}}` and per-check `ok` and `ms`. It sends
  `Cache-Control: no-store`. It returns 429 after the global probe budget is spent, before calling
  R2. It has its own limiter, `HEALTH_RATE_LIMITER`, at one request per minute per address. The
  limiter is bound in `wrangler.toml` with namespace id 27104, which must be unused in the account.

## Error codes

| Status | Code                       | Meaning                                                                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| 401    | `unauthenticated`          | No valid session. Also returned for an account being deleted, except for its own deletion. |
| 409    | `account_changed`          | The browser's expected account no longer matches the cookie.                               |
| 409    | `account_deleting`         | Sign-in or upload while the account is being deleted. New.                                 |
| 403    | `activity_quota`           | 5,000 activities reached.                                                                  |
| 403    | `storage_quota`            | 1 GiB of original files reached.                                                           |
| 429    | `rate_limited`             | Per-minute limiter.                                                                        |
| 429    | `daily_limit`              | Daily budget spent. New. `Retry-After` is set.                                             |
| 429    | `upload_in_progress`       | Two uploads already in progress. New. `Retry-After: 5`.                                    |
| 429    | `storage_budget_exhausted` | Deployment R2 ledger refused the call. Code unchanged.                                     |
