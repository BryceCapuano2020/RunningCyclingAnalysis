# Lift logger (design)

Status: designed and reviewed once (all findings taken), building (stage X, Lift UI package 1). The owner has no
lift history yet. He will log here and in Hevy (9 Nov 2026), so a Hevy import is package 3, after the Lift card.
The record, store and sync it uses are on main ([lift-data.md](lift-data.md)). This package shows no estimate: the
Lift card and the e1RM figures come in package 2 ([e1rm.md](e1rm.md)). The
rules are [system.md](system.md): one primary button a screen, rows not cards, detail panels, no subtitle lines.
App text never says "strength".

## Where it lives

- The rail reads Balance, Run, Ride, Lift. `lift` joins `SIMPLE_PAGES` with `PAGE_RULES` `{ needsResult: false,
ownPage: 'lift', ownOverResult: true }`, so it stands with no files and over a result. `OwnPage`, the rail's
  sections, `sectionOf` and `documentTitle` gain it. The rail shows no periods on it.
- The address is `#/lift`, today's local date, or `#/lift?day=YYYY-MM-DD`. An invalid day, or one after today,
  shows today.
- The page title is "Lifting" (the owner's choice); the rail item is "Lift".

## The page

From the top:

1. **The day.** The title "Lifting", then the day as a section heading ("Today", "Yesterday", or the date), with
   small outlined "Earlier day" and "Later day" buttons. "Later day" is absent on today; when it disappears under
   focus, focus moves to the heading. "Today" comes from the app's `useNow`. Days step on the parsed parts with
   `Date.UTC`, never `new Date('YYYY-MM-DD')` or a fixed 86,400,000 ms.
2. **The primary button: "Log a set".** It opens the entry form under it. While the form is open, the form's Save
   is the solid button and "Log a set" is not drawn, so a screen keeps one primary.
3. **The lifts of that day,** grouped by lift and equipment, ordered by their earliest set time, then by name.
   Each lift is a section whose heading is the lift and its equipment ("Back squat, barbell"), with no meta line.
   Its sets are a `PropertyList`, one set a row, in set order:
   - the label is "Set 1", "Set 2"... by position in the list, not by the stored set order, so a deleted set
     leaves no gap. The label is a button inside the `dt`, named "Edit set 2";
   - the value is "100 kg × 5 · RPE 8", with "warm-up" when it is one, and "Bodyweight × 10" for a bodyweight set
     with no added load. Load is formatted in `ui/format` in the profile's unit.

   Activating a row opens the form in place of that row, filled, with Save and Delete. After a delete, focus moves
   to the next row, else the lift's heading.

4. **Status rows,** signed in only, each one row and only when it applies:
   - "Not sent yet" with the count;
   - "Refused" with the count, for sets the server refused (the athlete is told, as lift-data.md says);
   - "Account full" when sets wait for room under the 60,000 cap.
5. **Earlier sessions.** A numbered list of the 12 most recent days with sets before the day shown, newest first.
   Each row's title is the date and its meta line the lifts trained ("SQUAT, BENCH PRESS"). A row opens that day.
   "Show more" adds 12 more.

An empty day shows one row, "No sets", and the button.

## The entry form

One form, inline: under the button for a new set, in place of the row for an edit. No dialog.

- **Lift.** A combobox (`role="combobox"` with a listbox). Catalog names match first, then the account's 12 most
  recent lifts, which also lead the list before typing. When nothing matches, the last option is "Add ‘typed
  name’", which becomes a slug and is shown back de-slugged ("Bulgarian split squat"; a name the catalog spells
  with capitals keeps them). A name whose slug would be empty or over 48 characters is refused in place. Editing the
  text after a choice clears the choice; leaving the field commits an exact match or restores the chosen name.
- **Equipment.** A select with the eight names. It defaults to what this lift last used, else bodyweight for a
  catalog bodyweight lift, else barbell.
- **Reps** and **Load** are number fields, the load in the profile's unit (pounds become kilograms on save, at
  0.01 kg). For a bodyweight lift the load's label is "Added load", and an empty load saves as 0.
- **Effort (RPE).** A select right after Load, never folded: "Not rated", then 6 to 10 in halves, plus a stored
  value outside that range when editing one. Its first value is the last set's, so logging effort costs no extra choice
  when it has not changed.
- **Warm-up.** A checkbox.
- **Save** writes the set:
  - **New set:** the date is the day shown when the form opened, so a session past midnight stays one day. The
    set order is one more than the highest stored for that date, lift and equipment, counting `put`, `synced` and
    `delete` rows. The time is the local time with `timePrecision: 'set'`, only when that day is today; a set
    logged on an earlier day has no time. The form stays open with the same values for the next set. **Done**
    closes it.
  - **Edit:** the original time and precision are kept. A change of lift, equipment or day changes the key, so it is
    a remove plus a save. Save closes the form.
- Values outside the record's bounds are refused field by field, with the bound in the error (`readLiftSet`).

Saving writes to the browser store first and shows the set at once. The sync engine sends it in the background.

## State and sync (`useLiftLog`)

One hook, on the main thread. The analysis worker never touches `rca-lifts`, so a visitor who only lifts does
not start it, and a set never waits behind an import.

- **Scope.** The user id when signed in. While the account is not known yet (loading, or no signal), the last
  signed-in id, kept from sign-in until sign-out, so a lifter at a gym with no signal logs into their own scope.
  Nothing is sent until the account is confirmed. `device` only when signed out. The store is closed on a change
  of scope (`LiftStore.close()`, added here).
- **Reads.** The store's rows for the scope, grouped as above. `put` and `synced` rows show; `delete` rows do not.
- **Writes.** `save`, `update` and `remove` call the store, tell other tabs (`{ type: 'lifts' }` in `TabMessage`),
  then ask the engine to flush.
- **When it syncs,** signed in and confirmed only:
  - after each write;
  - on `online`;
  - at `retryInMs` after a held flush;
  - when the tab becomes visible: the hook refreshes `/api/me` (at most every 30 s) and passes its `liftRevision`
    as `seen`. A lifter with no activity library still sees another device's sets. `libraryTabs.ts` is not
    touched.
- **Flush results.** `refused` and a held cap feed the status rows. `unauthorized` marks the session expired, as
  other 401s do.
- **Sign-out.** The store's `signOut` runs under the flush lock, from `forgetAccountDetails`, so sign-out, expiry,
  an account switch and another tab's sign-out all take the same path. Account deletion drops the whole account
  scope. The existing sign-out warning (`useSignOutWarning`) adds the unsent count to its one dialog: "3 lifting
  sets are not sent yet. They are kept here for your next sign-in; another account signing in here removes them."
  `sweepLifts(null)`, run when the lookup finds nobody signed in (a session that ended elsewhere), removes every
  account's synced rows and keeps each account's unsent ones; `sweepLifts(userId)` removes every other account's
  rows, unsent ones included.
- **Device sets.** The hook reports the device scope's set count. `DeviceOffer` takes it beside the worker's
  activity counts and shows when either is above 0 ("12 lifting sets" on its own). Its dismissal key and copy
  include the lift count:
  - **Add** runs the worker's adoption for activities and the engine's `adopt` for the device store side by side
    (separate stores, separate requests), and reports sets skipped or held at the cap. The offer waits for the
    worker's activity counts (zeros included) and the lift count before it asks;
  - **Remove** also clears the device scope (`clearScope('device')`, added to the store). `clearLifts` stays for
    Remove all, signed out.

## Packages

1. **L1** `useLiftLog` with its sync lifecycle, and the sign-in, sign-out, deletion, tab and device-offer wiring.
   No page.
2. **L2** the form parts: the lift picker and the set form, as components with their own tests.
3. **L3a** the Lift page from plain props: route, rules, rail, day view, earlier sessions, status rows.
4. **L3b** the wiring: L3a's page on L1's hook with L2's form, with an e2e test that logs, edits and deletes a set
   at 1280 and 320 px.

L1, L2 and L3a are built in parallel; L3b stacks on them. Each is at most 600 lines. Before any deploy, the owner
sees it in a signed-in local preview at desktop and phone widths.
