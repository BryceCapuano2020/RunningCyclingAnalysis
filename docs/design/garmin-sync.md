# Garmin sync: new activities without a file

Status: designed, revised 10 Nov 2026 for server-side parsing ([server-compute.md](server-compute.md) decision 14);
no code. First written 9 Nov 2026 against main 34de84bc. Garmin's mechanics are not yet confirmed (section 9); the
parts that depend on them are marked. The build waits on server compute's S1, S3 and S4 (section 10).

## Why

Every activity reaches RCA today as a file the athlete exports and drops in. That works once, for
history. It fails for last week's runs, which the coaching loop needs (ROADMAP, 30 Oct decisions). The
watched folder ([watched-folder.md](../archive/watched-folder.md)) only reaches Chromium desktop users, and Garmin
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

Garmin pushes a new activity to the Worker. The Worker answers fast and leaves the work to a queue. The queue
consumer reads the file with the same core parser the browser uses, saves the summary through the same create path,
and deletes the file. The athlete's next open shows the activity from the server snapshot. No tab needs to be open.

```
Garmin --push--> Worker /api/garmin/push
                   checks: link known, size, FIT header, budget
                   R2 users/{userId}/inbox/{itemId} + D1 inbox_items row (pending)
                   Queue "ingest" {itemId}  --> 200

Queue consumer "ingest"
   read the object (5 MiB at most)
   parseActivityFile(bytes, "garmin-{id}.fit", GARMIN_PARSE_LIMITS)   (core, import/index.ts)
   digestActivity(activity)                                            (core, digest/digestActivity.ts)
   minimisedForUpload(digest, fileName, account's title choice)        (core, import/minimise.ts)
   saveDigest(...)  same function as POST /api/activities              (dedupe on workoutKey)
   keep the original under the account's keep_files choice, else delete it
   inbox row done; library_version + 1 queues the "state" recompute    (server-compute.md section 1)
```

The 9 Nov draft had the browser pick files up from an inbox, because the free plan's 10 ms of CPU could not run the
parser. On Workers Paid a queue consumer gets 30 s of CPU by default (server-compute.md section 2), and decision 8 measures the
parser's memory in workerd before the flag goes on. One parser and one place where figures are made still
hold: the code is the same `packages/core` code, now run in two places.

## 3. Decisions

1. **Connecting needs a signed-in account.** The link and the summaries are per account, and the sign-up allowlist
   (`signupGate.ts`) still decides who has one. Signed-out use stays file only.
2. **Two new D1 tables and one column, additive.**
   - `provider_links(user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)`, unique
     `(provider, provider_user_id)` so one Garmin account links to one RCA account, cascade on user delete. Kept
     apart from `oauth_accounts`, which means sign-in; a Garmin link never signs anyone in.
   - `inbox_items(id, user_id, provider, provider_activity_id, file_key, file_size, attempts, state, reason,
received_at)`, unique `(user_id, provider, provider_activity_id)` so a repeated push is a no-op, cascade on user
     delete. `state` is `pending`, `done` or `failed`. It is the ingest ledger: it says what arrived and what
     happened to it, and the file is gone once the row is `done`.
   - `activities.source`, `file` or `garmin`, default `file`, in the contract types. It is set on create and never
     changed by a later duplicate. It is a D1 column, not a digest field, so no model revision.
3. **Tokens are encrypted at rest** with AES-GCM under a new secret `PROVIDER_TOKEN_KEY` (WebCrypto), with the user
   id and provider as associated data and a `key_id` so the key can be rotated. Tokens never reach the browser.
4. **Inbox files live under `users/{userId}/inbox/`,** so the existing account sweep and the nightly orphan scan
   (`maintenance.ts`, prefix `users/`) cover them. `finishAccountDeletion` must also sweep when a user has inbox
   items and no kept files; today it skips the sweep when no activity row has a `file_key`.
5. **The push handler does the least work, in this order:**
   1. Look up the link by Garmin user id. Unknown ids get 200 and nothing stored, so Garmin stops retrying.
   2. Refuse a body over 5 MiB or with no `Content-Length`. Check the FIT header bytes.
   3. Charge the R2 ledger (LIMITS.md) and refuse when it is spent, so a flood of pushes cannot use the budget that
      kept files need.
   4. Insert the row as `pending`, only if the user's `deleting_at` is null and the inbox is under its cap (one
      statement, as `upload.ts` guards uploads). A refused insert stores nothing.
   5. Put the object, send the queue message, answer 200. A put or send that fails leaves a `pending` row that the
      nightly maintenance retries or deletes.
      It has its own rate-limit binding. (Payload format and how Garmin authenticates a push: section 9.)
6. **One create path.** The consumer and `POST /api/activities` call one `saveDigest` function, extracted from
   `routes/activities/create.ts`: the digest size and text checks, the quotas, the revision check, the dedupe on
   `workoutKey(sport, startMs)` and the stored-label rule. A Garmin activity that is already in the library from an
   export is a duplicate, and the row is `done` with no new activity. A file import that arrives after a Garmin
   activity is a duplicate the same way. The same workout from a different file (another copy of it) is refused 409
   `activity_conflict`, as a second browser copy is; the consumer counts that as held: the row is `done`, nothing is
   retried or shown.
7. **The server minimises as the browser does.** The id and file name are hashed and the title is kept
   (`minimisedForUpload`). There is no title setting: a Garmin activity is saved with its own name. A FIT file carries no name, so the digest's
   name is the generated one unless the push's summary gives one, passed as the parser's `activityName` (G4, section 9).
8. **Parse limits are smaller on the server.** `GARMIN_PARSE_LIMITS` caps the file at the push limit (5 MiB) and the
   records and seconds at what one long activity needs, well under the browser's `DEFAULT_PARSE_LIMITS` (64 MiB). No
   archive is ever opened on the server: Garmin sends one FIT file per activity. The consumer's memory is measured in
   workerd with S4's harness (server-compute.md decision 11) on the largest synthetic FIT the limits allow, and the
   result goes in apps/api/LIMITS.md.
9. **Retries and failure.** A consumer error before the save retries with the queue's backoff; a parse that fails is
   not retried (the same bytes give the same answer) and the row is `failed` with the parser's reason. After three
   delivery attempts the message goes to a dead-letter queue and the row is `failed`. A message whose row is gone (expired as
   stale, or deleted by a disconnect) is acknowledged and dropped, never requeued. A failed item keeps its file
   for 30 days so the athlete can be shown it and a later parser can read it again.
10. **The digest carries the Worker's model revision.** The server makes digests with the `MODEL_REVISION` of the
    code it runs. The web and the Worker ship from one commit (docs/DEPLOY.md), so the revisions match. A digest
    made before a model change is stale in the usual way and rebuilds from its kept original, or from the export.
11. **The inbox is bounded.** At most 200 waiting items or 200 MiB per account; past that, pushes are refused and the
    page says so. The nightly maintenance deletes `done` and stale `pending` rows, and `failed` items older than 30
    days, within its operation budget (`MAX_MAINTENANCE_OPERATIONS`) and with a cursor across nights.
12. **Keep original files is unchanged.** If `keep_files` is on, the consumer moves the file to the account's kept
    files as an upload would; otherwise it deletes it once the summary is saved.
13. **Disconnect deletes the link, the token and every waiting item.** Activities already imported stay; they are the
    athlete's library now. Garmin's deregistration notice runs the same path, and account deletion deregisters with
    Garmin first.
14. **History still comes from the export zip.** Starter sends no history. The front door offers both: connect
    Garmin for what's new, add the export once for the past.

## 4. Screens

Rows, per [system.md](system.md). No new page.

- **Front door, first run:** two rows. "Garmin: new activities as you record them" with Connect, and "Your history,
  from an export" with Add files.
- **Account:** a Connections row. Garmin, Connected, Disconnect.
- **Import status:** a label over a number in the existing import notice: FROM GARMIN, 2 new. A failed item is a
  row, "1 from Garmin could not be read", with Dismiss.
- **Privacy page:** name Garmin as a source and say what changes for it: a Garmin file is read on the server, and the
  server keeps only the summary unless "Keep original files" is on. A file that could not be read is kept at most 30
  days. Disconnecting deletes waiting files. New entries in `privacyPage.test.ts` pin each sentence. The line
  "Analysis always runs in your browser: activity files are parsed and analysed on your device" changes with
  server-compute.md section 5.

## 5. Security

- OAuth with PKCE and a state bound to the RCA session, as in `auth/google.ts`. Garmin's exact flow:
  section 9.
- The push endpoint is public by nature. Defences: Garmin's request signature, checked in constant
  time, once its scheme is known (section 9); the size and length rules; the FIT header check; the
  ledger; a rate limit; the smaller parse limits of decision 8, and the queue, so a hostile file costs a consumer
  run and never the push request. A secret in the URL is not a defence: URLs reach logs.
- The browser reads no inbox route; a failed item reaches it as a row in `/api/me`, for the session's user only.
- The FIT parser is now reachable from the internet through a signed push. It is already fuzzed for the browser
  (`fit/parse.fuzz.test.ts`); the server adds the corpus of malformed synthetic files to the consumer's tests.
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
- End-to-end: push a synthetic FIT to the local Worker, run the consumer, open the app signed in, see the activity
  with no import step.
- Equivalence: for each synthetic FIT fixture, the digest the consumer saves equals the digest the browser import
  saves for the same file and title choice (the same check server-compute.md decision 12 makes for the snapshot).
- Named API cases: an unknown-user push stores nothing and answers 200; a push during deletion stores nothing;
  deletion of a user with inbox items and no kept files leaves no object; a file that will not parse is `failed`
  with its reason and is not retried; a consumer error retries and then dead-letters; a repeated push stores one
  item; a Garmin activity already imported from an export is `done` with no new activity; `keep_files` on keeps the
  original, off deletes it.
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

| Package | Work                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| G0      | This note. Owner applies for Starter and sends section 9's questions. Real-data check with the Personal key.               |
| G1      | `saveDigest` extracted from the create route, with no behaviour change; `GARMIN_PARSE_LIMITS` and the equivalence harness. |
| G2      | Migration (both tables, `activities.source`), contract types, maintenance expiry, the deletion sweep fix.                  |
| G3      | OAuth connect and disconnect, token encryption, deregistration, against a fake Garmin.                                     |
| G4      | The push receiver and the ingest consumer and its dead-letter queue, against a fake Garmin and section 9's answers.        |
| G5      | The screens in section 4 and the privacy page.                                                                             |
| G6      | Release: secrets set by the owner, the real-data check on his account, then the flag on.                                   |

G1 to G3 need nothing from Garmin and can start before approval. G4 needs server compute's S4 (the Queue binding and
the workerd memory harness) and answers 3 and 4 for the real payload; its fake-Garmin version can be built before.

## Sources

- [Strava API Policy](https://www.strava.com/legal/api_policy), effective 1 June 2026.
- [Garmin Connect Developer Program overview](https://developer.garmin.com/gc-developer-program/overview/):
  the tier table.
- [DC Rainmaker, 21 Oct 2026](https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html):
  prices, the 1,000-user figure, stripped FIT fields.
- [the5krunner, Garmin Personal API](https://the5krunner.com/2026/10/22/garmin-personal-api/).
