# Lift logger (design)

Status: designed, building (stage X, Lift UI package 1). The owner has no lift history yet. He will log here and in Hevy
(9 Nov 2026), so a Hevy import is package 3, after the Lift card. The record, store and sync it uses are on main ([lift-data.md](lift-data.md)). This
package shows no estimate: the Lift card and the e1RM figures come in package 2, after the own-data check in
[e1rm.md](e1rm.md), section 10. The rules are [system.md](system.md): one primary button a screen, rows not
cards, detail panels, no subtitle lines. App text never says "strength".

## Where it lives

- The rail reads Balance, Run, Ride, Lift. `lift` joins `SIMPLE_PAGES` as an own page (`PAGE_RULES`: needs no
  result, stands with no files), so a visitor with no runs or rides can log. The rail shows no periods on it.
- The address is `#/lift`, which opens on today's local date, or `#/lift?day=YYYY-MM-DD` for another day.
- The page title is "Lifting".

## The page

From the top:

1. **The day.** The title "Lifting", then the day as a serif section heading ("Today", "Yesterday", or the date),
   with small outlined "Earlier day" and "Later day" buttons. "Later day" is absent on today.
2. **The primary button: "Log a set".** It opens the entry form under it (below). It is the only solid button.
3. **The lifts of that day,** in the order first logged. Each lift is a section:
   - its heading is the lift's name at `--heading`, with the equipment as its one meta line ("BARBELL");
   - its sets are a detail panel (`PropertyList`), one set a row: label "Set 3" (serif), value "100 kg × 5 · RPE 8"
     (mono), with "warm-up" in the value for a warm-up set. Load is in the profile's unit;
   - a row is a button. Activating it opens the same form, filled, with Save and Delete.
4. **Not sent.** While the account has unsent sets, one status row reads "Not sent yet" with the count. It is
   absent signed out, where sets live only in this browser.
5. **Earlier sessions.** A numbered list of the last 12 days with sets, newest first. Each row's title is the date,
   and its meta line is the lifts trained ("SQUAT, BENCH PRESS"). A row opens that day.

An empty day shows one row, "No sets", and the button. A visitor with no sets at all sees the same.

## The entry form

One form, inline under the button. No dialog, so a phone keeps its place.

- **Lift.** A search field over the catalog's names, with the account's recent lifts listed first (the last 8, by
  last used). Typing filters the list. When no name matches, the last option is "Add ‘typed name’", which
  becomes a slug and is shown back de-slugged ("Bulgarian split squat"). Once a lift is chosen, the form keeps it
  for the next set.
- **Equipment.** A select with the eight equipment names. It defaults to what this lift last used, else bodyweight
  for a catalog bodyweight lift, else barbell.
- **Reps** and **Load** are number fields (`NumberField`), the load in the profile's unit (pounds are converted to
  kilograms on save, rounded to 0.01 kg). For a bodyweight lift the load's label is "Added load".
- **Effort (RPE).** A select: "Not rated", then 6 to 10 in halves. Optional, but kept one choice away and
  remembered from the last set: the own-data check in e1rm.md section 10 counts sets at RPE 9.5 or 10, and until a
  Hevy import exists every one of them comes from this form.
- **Warm-up.** A checkbox.
- **Save** (outlined, since "Log a set" is the primary) saves the set at the next set order for that day and lift,
  with `timePrecision: 'set'` and the local time. The form then stays open, with the same values ready for the next
  set ("add set copies the last one"). **Done** closes it.
- Values outside the record's bounds are refused field by field, with the bound in the error (`readLiftSet`).

Saving writes to the browser store first and shows the set at once. The sync engine sends it in the background.

## State and sync (`useLiftLog`)

One hook, on the main thread (the analysis worker is not involved):

- **Scope.** `device` signed out; the user id signed in. It reopens on a change of account.
- **Reads.** The store's rows for the scope, grouped by date and lift. `put` and `synced` rows show; `delete`
  rows do not.
- **Writes.** `save` and `remove` call the store, then ask the engine to flush.
- **When it syncs,** signed in only:
  - after each write;
  - on `online`;
  - when the tab becomes visible;
  - when `/api/me`'s `liftRevision` differs from the last one pulled. The library's own revision check
    (`libraryTabs.ts`) is not touched.
- **Sign-in.** `sweepLifts(userId)` joins `sweepAccountDetails`. Device sets are offered with the existing offer
  to add this browser's activities (`DeviceOffer`): the offer counts lift sets too, and accepting runs `adopt`.
  An offer that holds only lift sets says so ("12 lifting sets").
- **Sign-out.** The store's `signOut` runs, and the account menu's sign-out names the unsent count first when there
  is one ("3 sets not sent yet will wait for your next sign-in").
- **Remove all** (signed out) also clears `rca-lifts`.

## Packages

1. **L1** `useLiftLog` with its sync lifecycle and the sign-in, sign-out and adoption wiring. No page.
2. **L2** the form parts: the lift picker and the set form, as components with their own tests. Not on a page.
3. **L3** the Lift page: route, rail, day view, earlier sessions, the not-sent row, and the form, wired to L1.

L1 and L2 are built in parallel; L3 stacks on both. Each is at most 600 lines, with an e2e test in L3 that logs,
edits and deletes a set at 1280 and 320 px. Before any deploy, the owner sees it in a signed-in local preview at
desktop and phone widths.
