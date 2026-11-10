# Garmin sync: new activities without a file

Status: designed (research and design only, no code), waiting on the owner's go and Garmin's answers. Written 9 Nov 2026 against main
34de84bc. Garmin's mechanics are not yet confirmed (section 9); the parts that depend on them are marked.

## Why

Every activity reaches RCA today as a file the athlete exports and drops in. That works once, for
history. It fails for last week's runs, which the coaching loop needs (ROADMAP, 30 Oct decisions). The
watched folder ([watched-folder.md](watched-folder.md)) only reaches Chromium desktop users, and Garmin
Connect mobile leaves no file on any computer.

## 1. Which provider

| Provider     | Verdict | Reason                                                                                                                                                                           |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strava API   | Out     | Its API Policy (1 June 2026) bars analytics on Strava data, keeping it or derived data past seven days, and AI or MCP use. RCA is analytics over years. ROADMAP, 30 Oct.         |
| Garmin       | First   | Relaunched October 2026. The Starter tier is push only, sends activities as JSON and FIT, has no history and a limited user count. Free per DC Rainmaker; Garmin lists no price. |
| Polar, Coros | Later   | Only after Garmin works, and only if testers record on them.                                                                                                                     |
| Aggregators  | Out     | Paid, and Garmin's terms reportedly bar passing data downstream.                                                                                                                 |

Garmin's Personal tier (own data, pull only, a personal API key) is not a product path: it serves one
account. It is the tool for the real-data check in section 8.

## 2. The shape

Garmin pushes a new activity to the Worker. The Worker keeps the FIT file in an inbox until the
athlete's browser picks it up, then deletes it. The browser runs the file through the import it already
has. The server still parses no file, and analysis still runs in the browser.

```
Garmin --push--> Worker /api/garmin/push --> R2 users/{userId}/inbox/{itemId} + D1 inbox row
                                                       |
browser tab holding the writer lock <-- /api/me inboxRevision (new field)
   GET  /api/inbox            list waiting items
   GET  /api/inbox/:id/file   FIT bytes  --> addFiles([File]) (existing pipeline)
   POST /api/inbox/:id/ack    after the activity is saved or found held --> Worker deletes object and row
   POST /api/inbox/:id/fail   after a parse failure --> attempts + 1
```

Why an inbox and not a server-side import: the server holds a digest only after the browser builds it
(`routes/activities/create.ts`), and moving parsing to the Worker would put the parser under the 10 ms
CPU limit (apps/api/LIMITS.md). The inbox keeps one parser and one place where figures are made.

## 3. Decisions

1. **Connecting needs a signed-in account.** The inbox is per account, and the sign-up allowlist
   (`signupGate.ts`) still decides who has one. Signed-out use stays file only.
2. **Two new D1 tables and one column, additive.**
   - `provider_links(user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)`,
     unique `(provider, provider_user_id)` so one Garmin account links to one RCA account, cascade on
     user delete. Kept apart from `oauth_accounts`, which means sign-in; a Garmin link never signs
     anyone in.
   - `inbox_items(id, user_id, provider, provider_activity_id, file_key, file_size, attempts, state,
received_at)`, unique `(user_id, provider, provider_activity_id)` so a repeated push is a no-op,
     cascade on user delete. `state` is `pending`, `ready` or `failed`.
   - `activities.source`, `file` or `garmin`, default `file`, in the contract types. It is set on
     create and never changed by a later duplicate. It is a D1 column, not a digest field, so no model
     revision.
3. **Tokens are encrypted at rest** with AES-GCM under a new secret `PROVIDER_TOKEN_KEY` (WebCrypto),
   with the user id and provider as associated data and a `key_id` so the key can be rotated. Tokens
   never reach the browser.
4. **Inbox files live under `users/{userId}/inbox/`,** so the existing account sweep and the nightly
   orphan scan (`maintenance.ts`, prefix `users/`) cover them. `finishAccountDeletion` must also sweep
   when a user has inbox items and no kept files; today it skips the sweep when no activity row has a
   `file_key`.
5. **The push handler does the least work, in this order:**
   1. Look up the link by Garmin user id. Unknown ids get 200 and nothing stored, so Garmin stops
      retrying.
   2. Refuse a body over 5 MiB or with no `Content-Length` (R2 needs a known length to stream within
      the CPU limit). Check the FIT header bytes.
   3. Charge the R2 ledger (LIMITS.md) and refuse when it is spent, so a flood of pushes cannot use
      the budget that kept files need.
   4. Insert the row as `pending`, only if the user's `deleting_at` is null and the inbox is under its
      cap (one statement, as `upload.ts` guards uploads). A refused insert stores nothing.
   5. Put the object, mark the row `ready`, answer 200. A put that fails leaves a `pending` row that the
      nightly maintenance deletes.
      It has its own rate-limit binding. (Payload format and how Garmin authenticates a push: section 9.)
6. **Pickup runs in the tab that holds the writer lock** (`rca-flush-<userId>`), so tabs on one device
   never pick up the same item. It starts when `inboxRevision` changes, on the existing check when a
   tab becomes visible and every 30 s while it stays visible (`libraryTabs.ts`). Nothing happens while
   no tab is open; items wait.
7. **Pickup reuses `addFiles`.** The browser fetches each `ready` file as a `File` named
   `garmin-{id}.fit` and imports it with the account's usual flags. The browser acks when the create
   succeeds, when the server answers with a duplicate, and when the held index skips the file before
   create. A parse failure calls `fail`; after 3 attempts the item is `failed` and waits for the athlete
   (section 4).
8. **Two devices may race for one item.** Both may parse it; the server's unique
   `(user_id, dedupe_key)` keeps one activity, and ack is idempotent. Only the device whose create made
   the row counts it as new.
9. **The inbox is bounded.** At most 200 items or 200 MiB per account; past that, pushes are refused
   and the page says so. The nightly maintenance deletes items older than 30 days and stale `pending`
   rows, within its operation budget (`MAX_MAINTENANCE_OPERATIONS`) and with a cursor across nights.
10. **Keep original files is unchanged.** If it is on, the import uploads the original as it does for a
    dropped file; the inbox copy is deleted either way.
11. **Disconnect deletes the link, the token and every waiting item.** Activities already imported
    stay; they are the athlete's library now. Garmin's deregistration notice runs the same path, and
    account deletion deregisters with Garmin first. Sign-out on a device abandons a half-done pickup;
    the server item stays for the next device.
12. **History still comes from the export zip.** Starter sends no history. The front door offers both:
    connect Garmin for what's new, add the export once for the past.

## 4. Screens

Rows, per [system.md](system.md). No new page.

- **Front door, first run:** two rows. "Garmin: new activities as you record them" with Connect, and
  "Your history, from an export" with Add files.
- **Account:** a Connections row. Garmin, Connected, Disconnect.
- **Import status:** the inbox reports in the existing import notice, not under the Balance answer:
  "2 new from Garmin". A failed item is a row, "1 from Garmin could not be read", with Dismiss.
- **Privacy page:** name Garmin as a source, say the Worker holds a file only until the browser picks
  it up (at most 30 days), and say disconnecting deletes waiting files. New entries in
  `privacyPage.test.ts` pin each sentence.

## 5. Security

- OAuth with PKCE and a state bound to the RCA session, as in `auth/google.ts`. Garmin's exact flow:
  section 9.
- The push endpoint is public by nature. Defences: Garmin's request signature, checked in constant
  time, once its scheme is known (section 9); the size and length rules; the FIT header check; the
  ledger; a rate limit; no parsing on the server. A secret in the URL is not a defence: URLs reach logs.
- Inbox routes check that the item belongs to the session's user and answer 404 otherwise.
- The token key lives in Worker secrets, apart from D1, so a D1 leak alone exposes no token. The
  scopes requested are the narrowest that read activities (named once Garmin's list is known).

## 6. Garmin's attribution

Garmin's API brand guidelines require attribution on displays, exported data and derived data. The
exact wording is in a PDF we could not read. Plan: a "Garmin" attribution in the activity's source row
and on the Method page; confirm against the guidelines before the screens PR.

## 7. The connector and Garmin's terms

Stage E's MCP connector serves the athlete's evidence to their own assistant. A third party quotes the
agreement barring use of Garmin data to "create or maintain any AI model, AI system or AI generated
knowledge base" and passing content downstream. Until the signed agreement is read, the connector
leaves out activities whose source is `garmin`, and any figure built on them. That rule is why
`activities.source` exists (decision 2).

## 8. Tests and the real-data check

- A fake Garmin in the API test harness: push, deregistration, OAuth token exchange. Synthetic FIT
  fixtures only.
- End-to-end: push a synthetic FIT, open the app signed in, see the activity, see the inbox empty.
- Named API cases: an unknown-user push stores nothing and answers 200; a push during deletion stores
  nothing; deletion of a user with inbox items and no kept files leaves no object; a parse failure
  stops after 3 attempts; two tabs pick up an item once; a duplicate acks.
- Real-data check (local, never committed): with the Personal key, fetch a few of the owner's
  activities through the API and compare their digests with the same activities from the export.
  Third parties report Garmin strips VO2 max and recovery fields from API FIT files; RCA uses neither,
  but heart rate, power, cadence, laps and device must match.

## 9. Not confirmed (ask Garmin before the build)

Garmin's own pages give the tiers and nothing else; the activity API and FAQ pages return 404.

1. Can an individual developer, with no company, get Starter? Garmin's page heads it "Business".
2. Starter's user limit (DC Rainmaker says 1,000; Garmin says "Limited").
3. The push payload: FIT bytes in the body, or a URL to fetch with the user's token, and how long it
   stays valid.
4. How Garmin authenticates a push, and its retry policy.
5. OAuth details: PKCE, token lifetimes, refresh, scopes, the deregistration notice.
6. Retention and deletion duties, and the attribution wording for derived data.
7. Whether showing derived evidence to the athlete's own AI assistant is allowed.
8. Rate limits.

## 10. Packages

Each its own PR under the size cap, behind `GARMIN_ENABLED` until the last.

| Package | Work                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0      | This note. Owner applies for Starter and sends section 9's questions. Real-data check.                                                                                        |
| G1      | Migration (both tables, `activities.source`), contract types, `inboxRevision` on `/api/me`, inbox routes (list, file, ack, fail), maintenance expiry, the deletion sweep fix. |
| G2      | OAuth connect and disconnect, token encryption, deregistration.                                                                                                               |
| G3      | The push receiver, against section 9's answers.                                                                                                                               |
| G4      | Browser pickup in the worker, the screens in section 4, the privacy page.                                                                                                     |
| G5      | Release: secrets set by the owner, the real-data check on his account, then the flag on.                                                                                      |

G1 and G2 need nothing from Garmin and can start before approval. G3 waits on questions 3 and 4.

## Sources

- [Strava API Policy](https://www.strava.com/legal/api_policy), effective 1 June 2026.
- [Garmin Connect Developer Program overview](https://developer.garmin.com/gc-developer-program/overview/):
  the tier table.
- [DC Rainmaker, 21 Oct 2026](https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html):
  prices, the 1,000-user figure, stripped FIT fields.
- [the5krunner, Garmin Personal API](https://the5krunner.com/2026/10/22/garmin-personal-api/).
