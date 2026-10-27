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
statement was not re-verified on 2026-10-22. Requests for paths that match no asset do reach the
Worker, as described under "Unknown paths" below.

## Per-minute rate limits

Values are read from `apps/api/wrangler.toml`. Each binding uses a 60-second window and is
approximate per Cloudflare location. A denied request returns 429 `rate_limited`. A missing binding
outside development returns 503.

| Binding               | Namespace id | Limit per 60 s | Key                                 | Applied to                                                                    |
| --------------------- | ------------ | -------------: | ----------------------------------- | ----------------------------------------------------------------------------- |
| `API_RATE_LIMITER`    | 27101        |          1,200 | `ip:` plus the Cloudflare client IP | Every `/api/*` request (`publicRateLimit`, `src/rateLimit.ts`)                |
| `AUTH_RATE_LIMITER`   | 27102        |             30 | `auth:` plus the client IP          | `/api/auth/*` except logout (`publicRateLimit`)                               |
| `WRITE_RATE_LIMITER`  | 27103        |            600 | `user:` plus the user id            | Authenticated requests other than GET, HEAD and OPTIONS (`accountWriteLimit`) |
| `HEALTH_RATE_LIMITER` | 27104        |              1 | `health:` plus the client IP        | `GET /api/health/deep` (`healthRateLimit`, used in `src/routes/health.ts`)    |

## Daily budgets

Each budget counts one kind of request per user per UTC day. The count is one row per user, day
and action. It is incremented by an upsert with `WHERE used < limit`, so concurrent requests cannot
exceed the limit. Over-budget requests return **429 `daily_limit`** with `Retry-After` set to the
seconds until the next 00:00 UTC. The per-minute limiter still returns `rate_limited`. The values are
exported as `DAILY_LIMITS` from `@rca/contract`.

| Action                                   | Limit per user per UTC day  | Notes                                                                                                     |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| File downloads                           | 50                          | Refunded if R2 refuses the read before it starts.                                                         |
| Profile writes                           | 50                          | Includes keepFiles toggles.                                                                               |
| Activity deletions                       | 50                          |                                                                                                           |
| Activity creates                         | **5,000**                   | Deliberate deviation, see below. Only inserts count; a retry that returns the existing activity does not. |
| Original-file uploads                    | **2,000**                   | Deliberate deviation, see below. Refunded when the byte quota or the R2 budget refuses.                   |
| Library listings (`GET /api/activities`) | 100                         | First page of each listing. Continuation pages are free once; see Read charging.                          |
| Original-file bytes uploaded             | 1 GiB (1,073,741,824 bytes) | Summed over the declared length of each upload. Refunded when the upload is refused before R2 is called.  |

**Deviation from the owner's default of 50.** A first Strava export import is hundreds to thousands
of activities, so activity creates and uploads need a higher daily allowance. Creates are capped at the
library limit itself (`MAX_ACTIVITIES_PER_USER`, 5,000), so one day admits a whole library. Uploads are
capped at 2,000. Use these figures only for those two actions.

Daily rows older than seven UTC days are pruned by the scheduled job.

## Read charging

- A listing (`GET /api/activities`) charges one `read` unit for its first page. Only the continuation
  cursor the server issued last is free, and only once: a page that presents it is not charged, and
  presenting it again is charged as a fresh read. A malformed cursor returns 400 before any unit is taken.
  Only same-origin requests are charged or rotate the cursor. A request whose `Sec-Fetch-Site` is
  `cross-site`, `same-site` or any other value returns 403 `csrf_rejected` before anything is taken.
  The same check guards file downloads. A request without `Sec-Fetch-Site` (old browsers, curl) is allowed.
- `GET /api/me` is not charged: it reads a constant one or two rows, so the edge rate limiter bounds it.
  Charging it would lock out someone who simply reloads the page often.
- The read limit is **100 per UTC day** (`DAILY_LIMITS.read`), lowered from 1,000. A library of 5,000 rows
  listed 100 times reads at most 500,000 D1 rows for one user in a day. At 1,000 the same user could read
  about 5,000,000 rows, which is the whole free daily D1 allowance.

## Activity list

- A page holds at most 90 activities (`MAX_PAGE_SIZE`) and at most 512 KiB of digest JSON
  (`MAX_PAGE_DIGEST_BYTES`). The page read binds the user id plus one id per row, so 90 rows is 91 of the 100
  bound parameters D1 allows a statement; a test pins `MAX_PAGE_SIZE + 1 <= 100`.
- **Pages for a library.** A library of 1,915 activities lists in 22 pages (it was 77 at 25 a page). That holds
  while every page of 90 digests fits the 512 KiB budget, which needs an average under about 5.7 KiB (5,825
  bytes). A page whose digests are larger reaches the byte budget first, holds fewer than 90 rows, and so the
  library takes more pages. The owner's 1,915 digests average about 5.0 KiB (9.85 MB listed in total), so the
  pages are about 430 KB at 90 rows and only outlier pages are cut short.
- **Why the digest budget is 512 KiB.** The server's work on a page is one `JSON.parse` per digest, and the
  budget is the only bound on it. Workers Free allows 10 ms of CPU a request, so the budget is kept small.
  A single digest is at most 256 KiB (`MAX_DIGEST_BYTES`), so a page always holds at least one.
- **Response body cap.** `MAX_PAGE_BODY_BYTES` is the most the web client reads from a page. It is the digest
  budget plus `MAX_PAGE_SIZE` times `MAX_RECORD_ENVELOPE_BYTES` (2,022 bytes) plus the page's own cursor and
  count, 707,862 bytes in all. The record figure is the worst-case JSON of the record schema's limits: a
  64-character id and a 255-character file name made of control characters, which JSON writes as `\u0001`
  at six bytes each, the largest safe integer for the file size and for a negative created time, and the keys.
  A page of 90 such records adds about 182 KB to the digests; the earlier flat 64 KiB of room would have
  made the client refuse that page and fail the whole library load. The activity name sits in the digest, so
  the digest budget counts it. The server cannot go over the cap: it stops a page at the digest budget and at
  90 rows, and it leaves out, as unreadable, a row whose id, file name or numbers are past the schema's limits.
- The server does not validate a stored digest or serialise it again. It parses each row's `digest_json` with
  `JSON.parse` only to see that it is JSON, then builds the response body with the row's envelope (id, file
  name and so on) serialised on its own and the stored digest text spliced in unchanged. Only text that
  parsed is spliced, so the body is always valid JSON, and a stored value cannot close its record or add keys.
- A stored row whose digest is not JSON, or whose id or file name is past the record schema's limits, is
  skipped, not returned. The response counts skipped rows in
  `unreadable`, which is absent when the count is zero. Each skip is logged with the activity id, never the
  content. A skipped row still moves the cursor on.
- The web client validates each item's digest with `StoredActivityDigestSchema`. An item that fails is left
  out and added to the `unreadable` count the client reports, and the rest of the page loads. The client logs
  each one to the browser console as `activity_digest_unreadable` with the activity id and the first failing
  path, never the content. The envelope is still checked as a whole: one malformed envelope fails the page.
- One request scans at most 8 database pages, which keeps it inside D1 Free's 50 queries per invocation
  even when many stored rows are unreadable. A request that hits the cap returns the rows it found, possibly
  none, with a cursor after the last row it examined; clients follow that cursor like any other.
- Stored digests are read with a lenient schema, `StoredActivityDigestSchema`, by the client. It keeps the
  field types but not the create-time rules (for example a null duration or a curve off the grid, which older
  revisions may carry), and it bounds array lengths at four times the create limits. Creates still use the
  strict schema.

## Creates, replace and the database guard

- `POST /api/activities?replace=<id>` updates the named activity and never inserts. An id that is missing or
  owned by another user returns **404 `not_found`**. An activity that starts at a different time returns
  **409 `activity_conflict`**, and so does a request whose file hash differs from the stored one.
- **Order of checks.** A create that would insert a new row reads the account's counters first. A full
  library (403 `activity_quota`), the digest quota (403 `digest_quota`) or a full database (503
  `database_full`) refuses it before a daily unit is taken, so a refused create writes nothing. The
  insert holds the same limits for a request that races that read; it then gives its daily unit back.
  When both a limit and the day are spent, the limit is the answer. The insert returns the stored row
  (`RETURNING`), so the answer needs no read-back.
- **Digest quota.** Each user may store 64 MiB of digest JSON (`MAX_DIGEST_BYTES_PER_USER`). A create past
  it returns **403 `digest_quota`** and stores nothing. An upgrade to a newer model revision is refused the
  same way unless it shrinks the digest. A request for a revision the row already has is answered with the
  stored digest and never needs quota.
- **Database guard.** `DATABASE_SOFT_LIMIT_BYTES` is 450 MiB, below D1 Free's 500 MB per database. While the
  last recorded size is above it, a new activity returns **503 `database_full`**, and so does an upgrade
  that would grow a stored digest. Upgrades that do not grow it still succeed, and each successful upgrade
  records the size it leaves behind.
- **Recovery.** The recorded size is `r2_storage_budget.d1_size_bytes`, taken from `meta.size_after` of a D1
  statement that has already run: after each create that writes a row, after each upgrade, after each successful
  `DELETE /api/activities/:id`, when an account deletion completes, and in every maintenance run. Creates
  are admitted again once one of those records a size at or under the limit. Creates do not measure the
  size themselves, so a refused create does not recover the guard. The daily maintenance run guarantees
  recovery within a day, even when no delete records a smaller size.

## Original-file uploads

`PUT /api/activities/:id/file`:

- Must send a `Content-Length` header. Without one it returns **411 `length_required`** before the body is
  read. The owner check (404) and the storage check (503) come first.
- A declared length over 50 MiB returns 413 `payload_too_large`; zero returns 400 `empty_file`.
- Each upload charges one `fileUpload` unit (2,000 a day) and its declared bytes against the
  **1 GiB daily upload-bytes budget** (`DAILY_UPLOAD_BYTES`). Over the budget it returns 429 `daily_limit`.
- Charges are refunded when the upload is refused before its body is read, or when the deployment's R2
  ledger refuses the write. Once reading the body has started, the charges stand, even when the read or the
  hash then fails. So a `422 hash_mismatch` upload still uses its allowance. The deployment's R2 ledgers are
  charged only after the hash check.
- The size reservation is restored after a failed upload only while the row still has the file key it
  started with, so a concurrent upload that completed keeps the size it stored.
- A repeat of a stored file with the same length returns 200 without reading the body or charging anything.

## Other per-user limits

| Limit                       | Value                       | Enforcement                                                                                                                   |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Activities stored           | 5,000                       | `users.activity_count`, changed in the same D1 transaction that inserts or deletes the row.                                   |
| Digest JSON bytes stored    | 64 MiB                      | `users.digest_bytes`, changed in the same statements that insert, replace or delete an activity. See Creates.                 |
| Original-file bytes stored  | 1 GiB                       | Reserved in the activity row before R2 is called. `users.file_bytes` is their sum, kept by triggers on `activities`.          |
| Concurrent original uploads | 2                           | `upload_slots`. A slot expires after 5 minutes, so a crashed request frees it. Expired slots are pruned by the scheduled job. |
| Request body                | 256 KiB digest; 50 MiB file | Checked before parsing and while streaming.                                                                                   |

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
- **PUT bytes: 2 GiB per month**, `MAX_MONTHLY_R2_PUT_BYTES`, and **4 GiB lifetime total**,
  `MAX_GLOBAL_R2_WRITE_BYTES`. Both count each PUT attempt by at least 64 KiB, including failures.
  The monthly counter resets automatically; the lifetime counter never resets or refunds. The
  lifetime ceiling limits cumulative retained data to below the free 10 GB-month storage allowance.

### Operator reset

The ledger resets itself at the start of each UTC month. To reopen uploads inside a month after
reviewing usage, generate the SQL and run it against production. It applies only when the stored
month matches `--period`, and it does not touch the lifetime PUT total. Reaching the lifetime cap
requires an operator review and an explicit decision to adjust `lifetime_put_bytes` before uploads
can resume:

```sh
npx wrangler d1 execute rca --remote --command "$(node apps/api/scripts/reset-r2-budget.mjs --period 2026-10 --put-bytes 0 --operations 0)"
```

## Estimated D1 writes (not measured)

D1 writes are charged per row, including index rows. The 100,000 rows written per day are shared by
all users. Rough per-request estimates from statement shape:

- A read counted against the daily budget: about 2 rows.
- An activity create: about 8 rows (activity row with its indexes, daily upsert, counter). A first
  import at the 5,000 cap writes about 40,000 rows, of the free 100,000 a day.
- An upload: about 6 rows, one of them the `users.file_bytes` row that the trigger moves.
- Turning keep files off writes one `users` row per stored file, through the trigger, on top of the
  activity rows it clears.

On Free, 100,000 writes a day supports only a small number of heavy users. Fifty users each at the
100-read cap would write about 10,000 rows a day, a tenth of the allowance. Measure
before launch, and plan for Workers Paid if usage grows.

## Open risks and decisions

- **The guard assumes a delete lowers `meta.size_after`.** SQLite can keep freed pages in the file, so a
  delete may not lower the reported size. This is not verified on D1. If it does not fall, the guard stays
  tripped until an operator acts.
- **Legacy rows reach the web client.** Stored rows that are JSON are listed as they are, whatever their shape.
  The client reads each with the lenient schema (`StoredActivityDigestSchema`), so the analysis must cope with
  a null duration or an off-grid curve. A tab running an older web build still validates the whole page, so it
  fails to load while any stored row is JSON but not a digest.
- **CPU on Free (10 ms per request).** Hashing a 50 MiB upload with SHA-256 is likely to exceed
  10 ms of CPU. The `JSON.parse` check of a list page is bounded by the 512 KiB digest budget, which was
  lowered from 1 MiB to keep it small. Both are estimates and have not been measured. The app needs Workers
  Paid for production uploads, or a measured confirmation that the free plan can handle them.
- **Streaming the SHA-256.** `crypto.DigestStream` exists, but the hash must be verified before the
  object is written. The body is single-pass, so streaming would need a staging key and a copy,
  which doubles Class A operations. Bodies are still buffered, with at most 2 uploads per user.
  Nothing caps uploads across the whole isolate, and two 50 MiB buffers per user could pressure a
  128 MB isolate. A global upload cap is a decision for the owner.
- **Unknown paths outside `/api`.** The web app has no client-side routes, so `not_found_handling`
  is `none` and nothing falls back to `index.html`. A path that matches no asset falls through to the
  Worker, which returns a JSON 404 (plain text under `/assets/`). Those requests count toward the
  Worker's daily request quota. They are not counted by the per-minute API limiter, which applies
  only under `/api/*`.

## Session cookies

Cookies are `<token>.<HMAC-SHA256(token)>` with `SESSION_SIGNING_KEY`. A value without a valid
signature is refused before any D1 call. Production needs `wrangler secret put SESSION_SIGNING_KEY`.
The key must be at least 32 bytes, counted as the UTF-8 bytes of the secret string. The code checks only that length, so the key must be generated randomly, for example with `openssl rand -hex 32`, as [DEPLOY.md](../../docs/DEPLOY.md) recommends. A missing or shorter key fails closed: every request that needs a session returns 503 `service_unavailable`, and the key is never padded or replaced. Rotating it signs every user out. Before this change, unsigned
cookies were valid, so existing users must sign in again after the first deploy.

## Scheduled job

`[triggers] crons = ["17 3 * * *"]` runs `runMaintenance` (`src/maintenance.ts`), and each step is bounded:

- Deletes sessions that have expired or passed their 90-day end, up to 500 per run. Its statement also records the database size (see the database guard).
- Prunes expired upload slots and daily rows older than seven days.
- Finishes up to two interrupted account deletions. A deletion records a `pending_account_deletions` row before it starts.
- Sweeps two pages of 90 keys per run for R2 objects with no activity row, older than one hour.
  The listing cursor persists in `r2_storage_budget.orphan_sweep_cursor`.

Every D1 statement and R2 call in a run counts against `MAX_MAINTENANCE_OPERATIONS`, which is **45** per run, below the Workers Free limit of 50 subrequests per invocation. A step that reaches the cap stops, and the next run resumes from its saved state. CPU is not measured.

## Health

- `GET /api/health`: static, no storage.
- `GET /api/health/deep`: `SELECT 1` on D1 and a HEAD on a sentinel R2 key. Returns 200 when both pass,
  otherwise 503, with a JSON body of `{status, checks: {d1, r2}}` and per-check `ok` and `ms`. It sends
  `Cache-Control: no-store`. When the global probe budget is spent, R2 is not called, and the response is **200** with
  `{"status":"ok","deep":"skipped","reason":"deep health budget reached"}`. An exhausted budget is not reported
  as an outage, and a failing D1 check still returns 503. The budget is global to the deployment, so any caller can
  spend it. The uptime workflow reports a skipped check as a warning and neither opens nor closes an outage issue
  for it (see `docs/PRODUCTION.md`). It has its own limiter, `HEALTH_RATE_LIMITER`, at one request per minute per address. The
  limiter is bound in `wrangler.toml` with namespace id 27104, which must be unused in the account.

## Accepted platform risks

- **Workers Free request quota.** Every request counts toward the 100,000-per-day Worker request quota,
  including requests that the per-minute limiters reject. A determined flood from many addresses can
  therefore exhaust the daily quota, after which requests fail with Error 1027 until 00:00 UTC. This risk is
  accepted for now. The mitigations are Workers Paid, or a custom domain with a WAF rate-limit rule, which can
  refuse requests before they reach the Worker.

## Error codes

| Status | Code                       | Meaning                                                                                                                            |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `unauthenticated`          | No valid session. Also returned for an account being deleted, except for its own deletion.                                         |
| 409    | `account_changed`          | The browser's expected account no longer matches the cookie.                                                                       |
| 409    | `account_deleting`         | Sign-in or upload while the account is being deleted. New.                                                                         |
| 403    | `activity_quota`           | 5,000 activities reached.                                                                                                          |
| 403    | `storage_quota`            | 1 GiB of original files reached.                                                                                                   |
| 429    | `rate_limited`             | Per-minute limiter.                                                                                                                |
| 429    | `daily_limit`              | Daily budget spent. New. `Retry-After` is set.                                                                                     |
| 429    | `upload_in_progress`       | Two uploads already in progress. New. `Retry-After: 5`.                                                                            |
| 429    | `storage_budget_exhausted` | Deployment R2 ledger refused the call. The message is generic; the cap is logged as `storage_budget_refused`.                      |
| 411    | `length_required`          | Original-file upload without a Content-Length header.                                                                              |
| 413    | `payload_too_large`        | Original file over 50 MiB.                                                                                                         |
| 422    | `hash_mismatch`            | The uploaded file does not match its digest's hash. Its daily charges stand.                                                       |
| 403    | `digest_quota`             | 64 MiB of stored digest JSON reached.                                                                                              |
| 503    | `database_full`            | Database over 450 MiB; new activities and growing upgrades are refused until the recorded size falls.                              |
| 404    | `not_found`                | Activity missing or owned by another user, including `replace=<id>` targets.                                                       |
| 409    | `activity_conflict`        | `replace=<id>` names an activity at another start time or with other file contents.                                                |
| 503    | `service_unavailable`      | Session signing key missing or shorter than 32 bytes.                                                                              |
| 400    | `bad_request`              | Malformed `Content-Length` header.                                                                                                 |
| 400    | `invalid_json`             | Request body is not valid JSON.                                                                                                    |
| 400    | `invalid_request`          | Body fails the contract schema, or a library cursor is malformed.                                                                  |
| 400    | `empty_file`               | Original-file upload with an empty body.                                                                                           |
| 400    | `length_mismatch`          | Body is shorter or longer than its `Content-Length`.                                                                               |
| 400    | `oauth_denied`             | Google sign-in was cancelled.                                                                                                      |
| 400    | `oauth_missing_code`       | Google returned no authorization code.                                                                                             |
| 400    | `oauth_state_mismatch`     | Sign-in state is missing or does not match, usually an expired sign-in attempt.                                                    |
| 400    | `oauth_token_expired`      | Google ID token has expired.                                                                                                       |
| 403    | `csrf_rejected`            | Non-GET `/api` request without `X-RCA-Client: web`.                                                                                |
| 403    | `email_not_verified`       | Google account email is not verified.                                                                                              |
| 404    | `no_file`                  | Activity has no stored original, or the stored file is missing.                                                                    |
| 408    | `body_timeout`             | Request body stopped arriving (15-second idle limit, two-minute total limit).                                                      |
| 409    | `account_conflict`         | Google sign-in: the email is already linked to a different Google account.                                                         |
| 409    | `files_disabled`           | Original-file upload or download while 'Keep original files' is off.                                                               |
| 413    | `digest_too_large`         | Activity digest over 256 KiB.                                                                                                      |
| 429    | `health_probe_limit`       | Deep health probe budget spent. The deep-health route turns this into a 200 `skipped` response, so clients do not normally see it. |
| 500    | `internal_error`           | Unexpected error. The response carries the request id; the log carries only the id and the exception class.                        |
| 502    | `oauth_exchange_failed`    | Google code exchange failed.                                                                                                       |
| 502    | `oauth_bad_id_token`       | Google returned an ID token that failed validation.                                                                                |
| 503    | `file_storage_unavailable` | The deployment has no file storage binding, or R2 is unavailable.                                                                  |
| other  | `http_error`               | Other framework HTTP errors that are not 400.                                                                                      |
