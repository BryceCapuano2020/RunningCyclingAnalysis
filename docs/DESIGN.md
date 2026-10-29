# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | The answer and meter, a card per sport with its grade, the grade by duration for both sports, evidence and cross-sport cards, one fitness trend for both sports on one scale with weekly training hours by sport under it, share sheet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `#/run`, `#/ride`  | Run, Ride         | Threshold with its level ladder and the age grade of its best 20 min, the best 20 min's heart-rate share, a line of recent form, records in native units with the age grade of each, the distance a run's grade is taken at, how long ago each was set and the change on the period before (runs also at 1 km, 1 mi, 5 km, 10 km and a half marathon), a link to the sport's activities, the best-effort curve in pace or watts under the records (previous period dashed) with where the bests stand out as its caption, race predictions (runs), a weekly trend for 5, 20 or 60 minutes, output at the same heart rate, late in long sessions, time in zones, and one "Not enough yet" list for any section with nothing to show                                                                                                                                                                       |
| `#/activities`     | Activities        | Every activity in the library, with its own sport and period filters, a sort (newest, oldest, distance, time or climb), month headings in date order and a count of the activities shown; a row opens its activity page, and a kept activity can be deleted from its row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `#/activities/:id` | Activity          | Moving time and the figures beside it (beside the route shape from 761 px, under it on a phone), In detail (timelines, laps, intervals and how your reps held up, and time in zones), a Walking pace chip for a run at walking pace, splits (runs), all-time records across the library, best efforts set here, skipped readings, the activities either side, and Delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `#/method`         | How sure is this? | Three-line answer, an on-page contents list, the energy view (a cross-check of the age-grade gap), age grades and levels, heart-rate check with the 20 minute effort under it, virtual-power accuracy, what is calculated and how this works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `#/profile`        | Profile           | About you (year of birth, sex), body and bike (units, then weights; the two side by side from 900 px), one save status line under them, which offers See your levels after a save once year of birth and sex are known and a result is on screen, and not while a save is pending or one was refused, Settings over time (dated weight, max heart rate and thresholds: a form and a table of entries, latest date first within each setting), Training zones (a table for each sport and measure, with where its reference came from), account (email, download, delete), the export guides, original files (signed in), the saved library (signed in) or the activities kept in this browser (signed out), each a count by sport and the months it spans with a link to Activities, where an activity is opened and deleted, then Remove activities, which says Clear the analysis when nothing is kept |

Without a result every route except Profile and How sure is this? shows the landing page. How sure is this? shows its method, its age grades and its topics, with one plain line under the energy view, where the charts would be. On a reload of a visit that kept
results, every page except Profile and How sure is this? shows a restoring state in its place, with an
**Add files** button, until the library has replied. A returning visitor is not asked to add their files again and is never left without a control. The
header holds the wordmark, the four tabs (once there is a result, and while results restore), one
**Add files** button (not on the landing page, whose drop zone has its own, nor while they restore, except on Profile and How sure is this?), a **Profile** link (a person glyph with its word at every width, outlined as an account) and the
account control. The guides are not in the header: they are reached from Profile, the landing and an empty Run or Ride page. While the account is still loading, the account control reads "Checking sign-in…",
and "Sign-in is unavailable right now" when accounts cannot be reached. Both hold the sign-in
button's width, so the header does not move. The busy strip is fixed to the bottom of the window and
appears only once a run has lasted about 400 ms, so a quick change never moves the page. Its count reads "Reading 214 of 1,032 activity files": the total is the files an export lists as activities, so it
differs from the summary's count of all the files, which also holds the ones an export does not list. A screen reader
is told "Adding your files" once at the start and is not read the strip. The reason
the sample is off waits the same time. While a rate limit holds an import's saves back, the strip reads
"Too many saves at once. Saving resumes in about a minute." in place of its file count, once in its live region. On a phone the strip sits above the tab bar. Nothing is held
for the account: a file is analysed at once and saved once the account is known.

The header stays at
the top of the screen while the page scrolls. On a phone (760 px and below) the tabs move to a bar
fixed to the foot of the screen, 48 px tall, with four equal tabs of 15 px labels. Where they do not
all fit, the bar scrolls and fades at its edge. On a phone the brand and actions share one row. On a wide screen the tabs take a second row under
the brand and the actions, since one row would need more width than the 1,080 px page holds. Every tab has a glyph from 561 px: a balance
beam for Balance, the runner, the rider and a list for Activities. The current tab is marked by a flat
bar along its foot (its top edge on a phone) and by its colour. An activity's section tab (Run, Ride or Activities) is marked the same way and carries `aria-current="true"`, since the activity is a page of that section; only the page's own tab carries `aria-current="page"`. The method page marks Balance by its class alone, so a screen reader is not told that Balance is the page. Sign-in stays
one tap away on a phone as the Google mark alone, 44 px square, named **Sign in with Google** for
screen readers. Below 420 px **Add files** shows its plus only; its name is kept for screen readers and
is its title, so a pointer shows it on hover. The account menu holds the email and Sign out; downloading data and deleting the account
are on the Profile page. A file dropped anywhere on the page is imported. A drop with no file the import can read, such as a
.txt, asks nothing: its files go straight to the skipped list. On a short page the footer
sits at the foot of the window, sized to the small viewport so the phone's toolbar does not move it, and the brand mark's two sport strokes are 4 px, so the crossing reads at 32 px.

The header's sizes are custom properties in `tokens.css`, and the header measures its own height into
`--header-height` as it resizes, so the scroll padding and the skip link follow the real height at any
text size. A control that focus or Back brings into view is not hidden under the header. At 840 px and
below the wordmark is hidden, so the brand mark and the actions keep one row. The breakpoints are named once,
in `apps/web/src/ui/layoutBreakpoints.ts`: 760 px for the phone layout, 840 px for the wordmark, 560 px
for the compact one (the tab glyphs and the account name), 420 px for the narrow one, 700 px in height for
a short phone's spacing, and 900 px for Profile's two columns. The short-phone spacing needs a finger or a
window 760 px wide or less, so a short desktop window keeps the tall layout.

**Touch targets.** A control is 40 px tall. On a phone, or where the pointer is a finger, every
control is 44 px (`--control-height` in `tokens.css`): the header's controls, buttons, the account
menu, the sign-in button, the link arrows, the disclosure summaries, the form fields, and the small
links in a records list, the cross-sport idea, the standards link under a grade and the two footer
links, which are padded to that height on a finger. A footer link is 24 px tall with a mouse, the
smallest target WCAG allows. At 360 px and below the tab labels and the sex choices shrink a step,
so "ACTIVITIES" keeps its line in a four-tab bar and "Prefer not to say" keeps two. Where the tabs
overflow, the bar scrolls from the left and fades at its edge until it is scrolled to the end.

Each page sets the tab title to its name and the app name, such as "Run · RunningCyclingAnalysis",
and an activity by its own name. The first control on a page is **Skip to content**, which moves
focus to the page heading past the header, and appears under the header when a keyboard user reaches it. The heading is underlined only when keyboard focus reaches it, so a click that moves focus leaves the
title plain. The app's routes are hashes, so it is a button, not a
fragment link.

Back and Forward return to the page the visitor left, where they left it. A page opened by a link
starts at the top. **Back to activities** on an activity goes Back when the list was the page before; an activity opened
from Run or Ride reads **Back to Run** (or **Back to Ride**), keeps that tab lit and goes back there.
Run and Ride link to **How sure is this?** from a grade's **How is this graded?** link and, for a ride
with estimated watts, from its power note; the footer links to it too. How sure is this? links back to
**Back to Balance**, and the Balance tab stays lit there, since its answer is Balance's.

A deep link to a page that needs a result, with none on this device, stays where it is and says
"Add your files to see this page." A file import that then brings a result moves to Balance, the
home page. A deep link opened while the results kept on this device restore stays where it is, and shows
them. A file import made during that restore moves to Balance, as any import from a deep link does: the
visitor's own files are not held back by the restore. An unknown hash becomes Balance's hash, so the
address names the page shown.

**Period.** Balance and the sport pages show one period, picked with the control under the answer: 6
weeks, 12 weeks (the default), 12 months, All time or Custom, in that order. Each segment takes its
natural width, so the five wrap onto a second row at 390 px rather than overflow, and a segment alone on
that row is not stretched. Custom shows From and To date fields, prefilled with the period on screen,
and an Apply button on a row of its own. The fields are a control tall (`--control-height`, 44 px on a
finger) with 16 px text, side by side when two fit and stacked below that. The range applies on Apply,
not on each change. A reversed range is swapped, and the caption then says "Swapped so From comes
first." The control's dates sit beneath it, with the count of activities in the period when some are
left out, and a note under them when there is one. The Activities page has its own period, sport and sort, which start with the whole library. Its view is kept in the address (for
example `#/activities?sport=run&sort=distance&page=2`), so Back returns to the same page of it. A
period only narrows what is analysed: an activity outside it still opens from the list or a link.
The control shows the pick the athlete made last. Each pick is answered by the worker in turn, and
the control follows only the answer to the latest pick; while an import runs, it says the pick
applies when the import finishes. How sure is this? names the dated period on one line, with no
control. The period is a view preference: it is kept on this device, across Start over and sign-out.
A period is counted back from the newest activity, not from today, so when that activity is more
than six weeks old the note under the dates reads "Latest activity 17 months ago", and the dates
above end on that day. The note says why the default is all time too, when it is and the library
holds both sports, and an empty note takes no line. A stored pick the control no longer offers, such
as the 3 months of an earlier version, reads as the default.

**The sample athlete** is a 37-year-old man at 75 kg. It is analysed with that body and bike mass and that age and sex, whatever the visitor has entered, and it is never kept. While it is loaded, a banner above every page says so once. Its rides carry their running equivalents, so the age-grade trend shows them for a visitor with no age or sex. The landing example is drawn from the same sample, labelled illustrative: the balance meter, then each sport's level and grade with its band. A test pins its numbers to the sample's own analysis.

The landing page is the promise, the drop zone with **Add files** (its one primary action) and
**See a sample athlete**, the example result, three steps, three sentences on how the result is worked
out with a **Full method** link, and the export guides. On a short phone (SHORT_PHONE_MAX_HEIGHT_PX, 700 px
tall, and a finger or a window 760 px wide or less) the pitch and the drop zone sit closer, so
**Add files** is on the first screen at 320 x 568; in landscape the pitch sits beside the drop zone, so
**Add files** is on the first screen at 844 x 390 and 667 x 375. The drop zone's **No files yet? How to get
them** link moves focus to the guides below the steps. The guides are one tile per service. Each tile
is `aria-expanded` and controls the one panel, which opens on Strava. Opening a tile moves focus to
the panel's heading, so its steps are read from the top. The Strava guide has **Try the sample while
you wait** right after its wait step, when the page offers the sample. Under the panel, the no-files
and phone-only path says what to do without an export. Every guide ends with a source line and a link
to its own service's help. Each guide was read on its service's own help page, so the source line
names that page: "Steps from Strava's help, checked 27 October 2026; menus can change.", and the same
for Garmin, Wahoo, COROS and Zwift. A guide whose steps came from anywhere else would read "Steps from
published guides, checked ..." instead.
`HowToGetFilesButton` opens the same guides in a dialog. It sits beside **Add rides** (or **Add runs**)
on an empty Run or Ride page or card, as a secondary action; Profile can wire it in the same way. The dialog has no sample button, since a sample would replace the visitor's data.
The notice region sits under the header and holds one summary per import, the sample banner while the
sample is loaded, then the sync, library and sample notices and any error. After an import, a dismissible summary says what it added, or "Nothing new"
when every activity was already in the library, and links to Balance, except on Balance itself. An
import made on Profile or Method moves to Balance, where its result is. Under that sentence it lists
what the import moved in the athlete's numbers: at most four items, thresholds first, then the balance,
then new bests at 1, 5, 20 and 60 minutes and at each run distance (1 km, 1 mi, 5 km, 10 km and a half marathon), counted only for workouts that were not on file before. An import that added exactly one run or ride
leads with the balance instead. The balance line is listed whenever both results have one and a weight is
entered (a ride's figures wait for the weight, as the balance does), and it states what changed in the
figures the Balance page shows: the lean, the centre and the range. A changed centre reads "Your balance
now leans less toward running (7 → 6 points)", or "(12% → 8%)" for energy, where an edge under 1% reads
"0.4%", never 0%. A changed range reads "Your balance's range was −5 to +16 points and is now −4 to +16 points", in the
page's own "A to B" wording, and a changed even centre reads "Your balance's best estimate moved from +6 to +7
points"; both read together when they change together ("..., and the range was ... and is now ..."). Only when every figure is the same does it say "Your balance did not
move.", adding ": this ride set no new best at 20 min" only when the activity set none there. An activity
outside the period on screen reads "This ride is outside the period on screen, so the balance there is
unchanged." A line that says a figure changed counts as a move; a line that says the balance held is listed
without that, so the announcement does not say the numbers moved for it. The summary names the day of that
one activity, such as "Added 1 ride, on 20 Oct.", not its month. Then the sport's 20 min age grade, when its
whole percent changed, such as "Ride 20 min grade: 54% → 57%", then the thresholds and bests, still at most
four in all. An import of more than one file reads the balance's figures the same way, with no held line. A
first import, or one that replaced the sample, lists nothing, and nor does an import that added no run
or ride. What happened to the import's files is one neutral headline that adds up to all of them, such as "3,018 files: 1,947 added, 2 need a look, 749 other sports left out on purpose, 320 not listed as activities." It counts files, not activities: a file of two sessions is one file, and "Added 1,801 runs and 146 rides" above it still counts the activities. A file is added only if one of its activities is in the library afterwards and shown, so "Nothing new" and no file added always agree. A file whose workouts were already held is already added, whether it is a copy, the same file added again, a richer copy that replaces a held one (a richer copy that replaces a held one is already added), or a new activity hidden as a copy of a held workout. A held activity whose save failed is not yet in the library for good, so a later import adds it only if that import saves it: a retry that fails again, or that a halting save keeps from being sent, leaves it already added. The parts run added, already added, need a look, other sports, not listed, and a part with no files is left out, so a re-import reads "1,205 files: 1,204 already added, 1 needs a look." The word is "added", not "saved": saving to the account, and what waits to be saved, is the sync status's to say. The headline opens the groups, in this order. The summary starts collapsed, and the files that need a look are open within it. Each group's title is a level-two heading, set in bold, heavier than the text round it, since the import notice sits above the page's main heading, which follows it. The line for the files the export does not list has no group under it, so it is plain text in the same bold, heavier than the text round it, not a heading. **Need a look** holds the real problems as one line per file: a file with no recorded points, one that does not say its sport, one too short or damaged, a format the app does not read. The first of those is under the headline, so when it is the group's only line the group has no title, and when nothing else is left to show the headline and that line are text with nothing to open. Each piece of advice is said once, in the first line that gives it: "Export it again." for a damaged file, "Export a shorter range." for one too large, "Check the recording on your device." for one too short, too sparse or with a date it cannot use, and "Check the recording on your device, or export a shorter range." for one too long or with too much data. An empty file gets none, since "It holds no recorded points, so there is nothing to read." is all there is to say, and export advice belongs to a damaged file. **Other sports, left out on purpose** is one line per sport with its count ("Training session: 412"), where a FIT name and a Strava type for one sport are one line. A Strava type the app has no word for is shown as Strava writes it ("Kayaking: 3"); a name only the file gives, such as an unmapped FIT sport or a number, reads "Another sport". The files sit behind a nested **Show the files**. **Already added** lists the files whose workouts the library already holds, with its one note: a copy, "Same workout as run.fit, so it was not counted twice.", or the same file again, "Already in your library, so it was not counted twice." **Not listed as activities, such as saved routes** is one line with its count and no action: they are the files in an export that its own list of activities does not name, and they are not read. When those are all that was left out, the headline stands alone as text, with nothing to open. The list ends with **How to get your files**, which opens the guides.
The first file that needs a look is shown under the headline, in both states, with its plain reason and its advice, and the summary is announced with the same headline. Two files that share a name are both listed, and a file read cleanly takes back a refusal only of its own zip, never that of a different file. Each import
is compared with the result the worker last reported when it was sent, except a file released from a
wait for the library, which keeps the result that wait ended with. After a Start over, the next import is
compared with nothing. Deleting an activity clears the summary, since its count has changed. Each change
is also read aloud in words. Signed in, the sync status's completion says "Your numbers moved." instead.
A limit stops an import's saves and not its analysis: a full library, the day's saves spent, or a rate limit
that held after one wait. The sync status then says how many were saved and how many are waiting
("1,915 saved, 1,103 waiting."), and what to do before adding the rest again.
On the Activities page, a quiet line says what is kept: "Kept in this browser." signed out,
or "Saved to your account." signed in. The subtitle gives the count.

A user's Stop is neutral news, never an alert. It cancels the import in progress and keeps the result on
screen: "Stopped. Add your files again when you're ready." The stop may replace the summary of the
previous import with that neutral line, since the import it summarised was the one stopped. The worker
is replaced and the kept library reloads behind it.

## Colour

**The page follows the system colour scheme.** There is no theme switch, so the `data-theme` hooks in
`tokens.css`, `base.css` and `GoogleSignInButton.css` are unused. They stay as the place a switch would
set the attribute, and no switch is planned.

Ink and volt are the brand. Sport colours mark a sport: its data, its glyph, and the edge of its
card. They never colour text, and never generic chrome such as buttons, links, tabs or focus rings.
A sport's figure is set in ink, and its shape carries the colour. A surface of one sport reads
`--sport-colour`, which `tokens.css` sets once for each `data-sport`, so a glyph, an edge, a ladder,
a chip or a route takes its own sport's colour. Status
colours always come with an icon and a label, so a warning never relies on red beside the run coral.

| Token                  | Light       | Dark        | Use                                                                        |
| ---------------------- | ----------- | ----------- | -------------------------------------------------------------------------- |
| `--surface-0`          | `#f5f6f8`   | `#0f1115`   | Page (paper)                                                               |
| `--surface-1`          | `#ffffff`   | `#171a20`   | Cards, inputs                                                              |
| `--surface-2`          | `#eceff3`   | `#1e232c`   | Hover, tiles, tracks                                                       |
| `--surface-pressed`    | `#dde2ea`   | `#101318`   | A button's fill while it is pressed                                        |
| `--border`             | `#e1e4ea`   | `#2a2f38`   | Card and table rules                                                       |
| `--grid`               | `#e9ecf1`   | `#232830`   | Chart gridlines                                                            |
| `--control-border`     | `#7f8694`   | `#6b7380`   | Input and button outlines (3:1 or better)                                  |
| `--text-primary`       | `#0e1116`   | `#eef0f3`   | Ink                                                                        |
| `--text-secondary`     | `#474f5c`   | `#b6bcc6`   | Supporting text                                                            |
| `--text-muted`         | `#5f6774`   | `#8d95a2`   | Captions, axis labels (4.5:1 or better)                                    |
| `--neutral-mark`       | `#474f5c`   | `#b6bcc6`   | Neutral data and reference marks                                           |
| `--neutral-band`       | `#474f5c24` | `#b6bcc629` | Neutral band fill                                                          |
| `--previous-mark`      | `#838a97`   | `#737b89`   | The previous period's line: a thin dashed mid grey, under the current line |
| `--brand`              | `#c8f03c`   | `#c8f03c`   | Volt: marks the one primary action per screen                              |
| `--accent`             | `#0e1116`   | `#c8f03c`   | Primary button background (dark: volt, from `--brand`)                     |
| `--accent-contrast`    | `#c8f03c`   | `#0e1116`   | Primary button label (light: volt, from `--brand`)                         |
| `--accent-hover`       | `#474f5c`   | `#a9d62c`   | Primary button fill on hover, a visible change in both schemes             |
| `--accent-pressed`     | `#000000`   | `#8fb81c`   | Primary button fill while it is pressed, with a 1 px drop                  |
| `--mark-tile`          | `#0e1116`   | `#0e1116`   | The brand mark's ink tile                                                  |
| `--mark-ring`          | `#0e1116`   | `#6b7380`   | The ring round the brand mark's tile, so the tile shows on the dark page   |
| `--selected`           | `#0e1116`   | `#eef0f3`   | Selected tab or segment                                                    |
| `--selected-contrast`  | `#ffffff`   | `#0e1116`   | Label on a selected tab or segment                                         |
| `--link`               | `#0e1116`   | `#eef0f3`   | Links, always underlined                                                   |
| `--focus`              | `#0e1116`   | `#c8f03c`   | Focus ring                                                                 |
| `--series-run`         | `#e5304f`   | `#f0435f`   | Running data                                                               |
| `--series-ride`        | `#2f56e8`   | `#4d6ef5`   | Cycling data                                                               |
| `--series-swim`        | `#0f9fb0`   | `#14a0b0`   | Swimming data (reserved)                                                   |
| `--series-run-soft`    | `#e5304f26` | `#f0435f33` | Running band and area fill                                                 |
| `--series-ride-soft`   | `#2f56e826` | `#4d6ef533` | Cycling band and area fill                                                 |
| `--series-swim-soft`   | `#0f9fb026` | `#14a0b033` | Swimming band and area fill (reserved)                                     |
| `--ladder-run-band`    | `#e5304f26` | `#f0435f26` | Run band behind the level ladder's range, low enough alpha for the outline |
| `--ladder-ride-band`   | `#2f56e826` | `#4d6ef526` | Ride band behind the level ladder's range, low enough alpha for the ring   |
| `--status-warning`     | `#8a5300`   | `#f2b544`   | Warning icon and label                                                     |
| `--status-warning-bg`  | `#fbf2d9`   | `#33290c`   | Warning chip background                                                    |
| `--status-critical`    | `#b3261e`   | `#ff8a80`   | Error icon and label; destructive button background                        |
| `--status-critical-bg` | `#fde8e6`   | `#3a1714`   | Error chip background                                                      |
| `--status-good`        | `#17753a`   | `#4ac26b`   | Success icon and label                                                     |
| `--status-good-bg`     | `#e3f4e8`   | `#10301b`   | Success chip background                                                    |

Spacing, radius, font and shadow tokens live in `apps/web/src/styles/tokens.css`, beside the colours.

`*-soft` variants are the same hue at 15% (light) or 20% (dark) alpha, for bands and area fills. A
record chip takes its sport's soft colour as its fill, with ink text, so it never relies on the hue.
The run, ride and swim colours were checked with a colour-vision simulator in the October 2026 UX
review. `apps/web/src/styles/tokens.test.ts` checks contrast, not colour vision.

## Type

- **Barlow** (400, 500, 600) for text, **Barlow Condensed** (700, 800) for numbers and headings.
  Both are self-hosted from `@fontsource` (OFL-1.1), so no third-party font request is made.
- Headings are condensed and upper case. The page title is 800 weight; the page title and the section
  headings, paragraphs, figure captions and list items are set with `text-wrap: pretty`, so a single
  word is not left alone on the last line. The Balance headline is balanced instead, and sets at
  1.7rem below 360 px, so at 320 px it takes two lines, and at 130% text LEANS is not left alone on a
  line. Section headings are 700.
- **Numbers are the hero.** The main number on a card is at least 48 px, condensed 800, with
  tabular figures (`.hero-number`). Supporting stats are 28 px or more (`.stat-number`).
- Small labels above a value use `.eyebrow`: condensed 700, upper case, wide tracking, muted.
- **The type scale is tokens:** `--text-xs` (12 px), `--text-sm` (14 px), `--text-md` (16 px),
  `--text-label` (15 px, the phone's tab labels and the chart and notice labels) and `--text-lead`
  (18 px, the one display size a step above the body, such as the lead paragraph, the small
  headings, the tabs, the phone's wordmark and the skip link). Eyebrows, chips, the tabs and the capitals of the
  header share `--tracking-caps`, and the phone's tab labels take `--tracking-tab`. Sizes above 18 px,
  such as the page headings and the figures, have no token: each is set where it is used, with a
  comment saying so. A unit inside a capitalised heading is set apart in `.unit`, so it stays in
  lower case, as in "/mi", and the space before it is a non-breaking space, so the unit never starts
  a line. Inline source links are set at `--text-md`, and on Balance and the sport pages so are the
  disclosure summaries, except a best efforts label, an eyebrow at `--text-sm`.
- **Cards only for things you can open or act on.** Sections are separated by space and a heading,
  not a border. A card has a 12 px radius, a 1 px border and no shadow.
- One primary action per screen, in `.btn-primary`: an ink button with a volt label in light, and
  a volt button with an ink label in dark, so it stands out on either page colour. Its hover moves
  the fill to `--accent-hover`, a visible change in both schemes. A press shows on every control: the
  control drops a pixel and takes its pressed fill (`--surface-pressed`, or `--accent-pressed` for the
  primary button) with an inset ring, so it reads in both schemes even where the fill barely changes.
  A tab's ring is an inset outline, since the tab bar's current mark is a flat bar, not an inset shadow.
  The current Activities page number keeps its selected look while pressed, and in forced colours it takes
  the system highlight. In forced colours a press is an outline, since the fill and the shadow are dropped,
  the primary button takes the system highlight with its label, the browser's own colour adjustment
  being off for it, and a chip is outlined.
  A button's hover also darkens its edge to `--text-secondary`, so the hover shows against the page.
  The one destructive button, a removal's confirm, keeps its red fill and white label on hover and
  press, and shows the state by brightness, so the generic hover never blanks it.
  A button is a sentence, so it is set in sentence case, not capitals. The header's Profile link is too.
- A sport glyph (`SportIcon`) sits next to every sport name. Its path data and stroke width are in
  `iconPaths.ts`, the one source for the icon and for the glyph on the share card. The ride is drawn at
  a 1.5 stroke with wheels of radius 3, and the runner at 2, since two wheels and a frame carry more ink
  than five strokes. Measured in the app at 16, 20, 24 and 30 px, the ride carries 1.15 to 1.3 times the
  runner's ink (it was 1.6 to 1.8 at a 3.8 radius and a 1.75 stroke); the runner is not moved.
  Each sport glyph is cropped to its ink (`inkBox` in `iconPaths.ts`), so its box starts where the ink
  starts. Its left edge is the icon's edge in the tabs, the headings and the meter, and the gap to its label
  is the same for both sports. The share card draws the same crop, with the ink at the inset; its label
  starts at a fixed x, so the gap there is wider for the narrower runner.
- Charts get a faint grid, 2.5 px lines with round joins, and an emphasised point: the latest value
  of a trend, or the 20-minute effort of a best-effort curve. The 20-minute effort is labelled with
  its value, such as "250 W". On the Balance trend, each end label names its sport and value at every
  width, such as "Run 64%", since the title names the effort and window; the note under the chart says that the latest point covers only the last window, so it can differ from a card's best over the period. On a sport trend the latest label
  is its value alone, such as "5:12 /km", beside its point: below it, above it where the line would run
  under it, or to its right where both of those would cross the line. At every width, a trend's run label keeps clear of the ride band, and 4 px where it can of the run's own
  line and markers, after the band. The band is drawn only where both of
  its weeks have a range, with a step at each week's x. The label's box stays inside the plot both
  ways and 2 px from the band. Its box sits on the left of its point unless that would cross the
  plot's left edge, when it sits on the right. Its spots are the baseline beside its point that the
  line's arrival prefers, the other baseline beside it, and the baselines just above or just below
  each edge of the band beneath it, each kept inside the plot and within four label heights of the point (`LABEL_REACH_EM`), since a label further from its point reads as the label of the line beside it. The two end labels are placed
  together. Of the combinations that keep both boxes inside the plot and off the band, the one with
  the fewest labels within 2 px of the band wins, then the one nearest their preferred places. A box
  that would cross the plot's edge moves along it to sit inside, which can bring it over its point.
  Where no combination within that reach keeps the run label off the band, the labels keep their preferred places,
  spread apart and inside the plot, so the run label sits over the band, where its halo keeps it
  readable. Where the plot is too short to hold both labels a gap apart, they stay inside it and may
  overlap one another. Where there is room, the two end labels never overlap one another, and
  neither reaches the y tick labels.
  A best-effort curve marks the 1, 5, 20 and
  60 minute efforts, the same ones its records list names, and labels its last point with its value
  where there is room beside the 20 minute label. Watts charts also fill the area under the line. Pace charts draw
  the line alone: pace has no zero to fill down to. Every chart has a visible title, which names
  the figure once; the plot is described by its tooltip and arrow-key hint, not named again, and a
  value's label sits clear of its own line. A week's marker is enlarged when the
  reader points at it, as well as the latest one. A tooltip names its week, as "Week ending Sun 12 Jan
  2025", since the card title names the effort and window. A dashed key is an estimate or a previous
  period. A chart's key keeps its row wherever the chart can have a key, so the plot does not move when
  a key appears. A sport curve keeps its key's row in any period that has a period before it, even when
  that period has nothing to draw, so the plot does not move as the dashed line appears or goes; All
  time has no period before it and no row. A chart with no plot shows only its message. Axis text is set in rem, so it follows the
  reader's text size. A data table with more than 12 rows keeps to a height of 24 rem and scrolls inside
  itself, and a keyboard reader can reach it. A table that overflows its region is a keyboard scroll region too, and a phone
  shows a trend's table without its run and ride counts. While the plot has focus, the arrow-key hint
  sits in its top corner, and a tooltip takes its place once a point is active.
- The energy view's ratio chart on How sure is this? tints running coral above its line and cycling
  blue below it, so the side that is higher reads before the numbers do. Its zero line is labelled
  "Even" on the axis, and its key names the bands "Before heart-rate check: 90% range" and "After
  heart-rate check: 90% range".
- **Evidence sits behind a disclosure.** On How sure is this? each chart is under a Show the evidence
  disclosure, which reads Hide the evidence while it is open, and the claim it supports is in words
  above it. The chart mounts when the disclosure is first opened, so a closed section draws nothing.
- **In-page jumps are buttons, not fragments.** The contents list on How sure is this? moves focus to
  a section's heading, because a fragment would change the hash route.
- A sport page reads top to bottom: the threshold, with its range under the figure, the line on uneven bests when there are any, and a line on the best 20 minutes by heart rate
  under its meaning, on either sport when the library holds a 20 min best in both sports, then its grade and level ladder for the best 20 minutes
  (the same grade line as the card), then the period control, then the sport's sections in the order its list
  gives (`SPORT_SECTIONS` in `apps/web/src/ui/pages/sportSections.tsx`, one list per sport, so a sport adds or
  drops a section there and the page maps it). The run's list is **Best efforts**, **Race predictions**,
  **Week by week**, **At the same heart rate**, **Late in long sessions** and **Time in zones**; the ride's is the same without the race predictions.
  - **Best efforts** holds a line of recent form ("Last run 14 Jan · 9 runs · 42.10 km"), the records, with the
    Flat note under them on a run, and then, directly under the list, the best-effort curve in the sport's unit. It has no
    section heading of its own, because it is the records' chart; the chart's own title ("Run flat pace per
    kilometre by duration") names it.
    Under the curve is the stand-out finding as its caption (below), then **See your runs**, which opens
    Activities filtered to that sport.
  - **Week by week** is the trend for 5, 20 or 60 minutes, with one muted line under the chart: "A step down
    can be a best leaving the 4-week window, not a change in you." The window is the one the chart uses.
  - **Late in long sessions** is the last section. It holds two readings, each with its own sentence, chart and
    note, and each shown only once 3 activities stand behind it (`LATE_IN_EFFORT` in
    `packages/core/src/constants.ts`). The first compares the best 5 and 20 min overall, from any point in an
    effort, with the best that starts after 60, 90 and 120 min of moving time (`periodDurability`). Its
    sentence takes the deepest level with 3 activities behind it, at the longest duration that has them, and
    does not count them: "After 90 min your best 20 min is 6% below your best 20 min overall." (or "above", or
    "is within 1% of" when it rounds to under 1%). The note gives the count ("Your best 20 min after 90 min
    rests on 4 rides."), says that a lower figure late on can also mean the run never asked for more, and for a
    ride that only a power meter counts. The chart is a row for the best overall and one for each level shown,
    in the sport's own unit (a pace for a run, which is the flat speed the late best costs, and watts for a
    ride), a mark on a track with better to the right and a stem back to a dashed line at the best overall. The
    track spans at least a fifth of the best overall, so a small fall stays a short stem. **View as table**
    lists each figure with its fall against the best overall and the activities behind it. The second reading
    is the drift of steady efforts over an hour (`driftTrend`): "On steady runs over an hour, your output per
    heartbeat fell 3% from the first half to the second (median of 12 runs)." (or "rose", or "held level" when
    it rounds to under 1%). The chart is a dot for each steady effort by date, its change in output per
    heartbeat in percent (a fall is below zero), with no line between them, and a dashed line at a 5% fall
    named in the key as "A fall of 5%: under this is usually read as well-built endurance". That is a coaching
    convention (`docs/research/durability.md`), a light reference and not a verdict, and the note says that
    heat, hydration and tiredness also move heart rate, so a change is not fitness. An activity whose heart
    rate is set aside has no drift. A half with too few activities is left out and named in the "Not enough
    yet" list, such as "Late in long sessions: add 3 runs longer than an hour." (a ride adds "with a power
    meter") or "Late in long sessions: needs 3 steady runs over an hour with heart rate to show how output per
    heartbeat changes." (a ride needs a power meter and heart rate). With neither, the section has no heading
    and the line names both needs. The copy never says limiter, weak, strength, "holding you back" or "ahead
    of".
  - **A section with nothing to show has no heading.** Its reason is one line of a muted list at the end of the
    page, headed "Not enough yet", before the footnote: "Race predictions: needs a best of a mile or more, or
    runs with heart rate." Each section names its need in the plain words it would have used under its own
    heading, lower-cased after the section's name, so a new athlete sees no dead headings and no jargon.
    The list is left out when every section has content, and on a page with no activities.
  - **A threshold the fit refused, shown as its floor, is labelled "Threshold pace, at least"** (or "power"),
    not "estimated", since the floor is a held best. A range whose two ends would print the same reads
    "About 48 W" in place of "Range 48 to 48 W".
    The threshold carries no count: the period control under
    the answer names the dates the efforts come from. A sport the library has no activities for has no
    period control and no curve, and asks for files: one section holds that prompt, with **Add runs** and
    **How to get your files** side by side.
- **"Where your bests stand out" compares an athlete with their own curve, never with anyone else's.** The
  finding is the caption of the curve under Best efforts on each sport page (it has no heading) and says, for each duration from 5 s to 60 min, how far
  the best sits above or below what the athlete's other durations predict (Morton's three-parameter
  critical-power model, fitted without that duration; the method is in
  [research/duration-profile.md](research/duration-profile.md)). A sentence leads: "Your 1 min best is 14%
  above what your other bests suggest. Your 2 min best is 9% below: it may be relatively low, or
  untested." It names at most the three that stand out most, shortest first, and only a duration whose
  range clears zero by 2% at its near end; one that stands out by less is on the chart only. A best below
  the rest is always said to be possibly untested, since a best is a lower bound. With none standing out it
  says "Your bests are in line with each other, compared from 5 s to 60 min." and offers no strip, and with some
  standing out by less than 2% it adds ", apart from small differences on the chart". The span names the first and last durations the profile compares (from 2 min when the short end is not anchored), which can start earlier than the curve above it, whose table begins at 1 min. Durations are named as every effort length is,
  in whole minutes ("60 min", never "1 h"). The words "limiter", "weak", "strength", "holding you back"
  and "ahead of" are never used, and "grade" means age grade only.
  Under the sentence, when something stands out, is a disclosure, "Show each best against the others" (it
  reads "Hide ..." while open, and starts closed; the strip mounts when first opened), that holds a lollipop strip: duration on a log x axis, 5 s to
  60 min; a heavy zero line, the best in line with the others, with the vertical axis in per cent either side
  of zero. The axis is one range for the chart, symmetric about zero and rounded up from the widest
  range, and the chart says it under the plot ("Scale: ±40%") and in its table's caption, since a run's and a
  ride's differ and two charts must not be read as alike. It has one point per duration at its residual, with a thin bar for its range (90%). A point whose range
  leaves zero is filled in the sport's colour and shape, a dot for running and a diamond for riding, and
  carries its duration as a label beside it, to the left where the right would leave the plot, so it reads
  at 320 px; any other is hollow and unlabelled, so the shape and the fill carry the meaning, and in forced colours the fill still tells them
  apart. The key reads "Stands out", "In line" and "Range". The chart has a tooltip and keyboard
  reading like the curve, and **View as table** lists duration, difference (with "above" or "below" when it
  stands out) and range. A ride reads measured power only, a run its metabolic W/kg, and each is read
  through a table keyed by sport. With fewer than five durations, no best at 1 min or under, none at
  12 min or more, or bests from fewer than two sessions, there is no caption and the finding is one line of
  the "Not enough yet" list naming what is missing, such as "Where your bests stand out: needs a best at 1
  min or under and one at 12 min or more, with a power meter.", and no strip. When nothing is missing but
  no curve can be fitted, that line says "a curve could not be fitted to your bests, so none is compared". Without a best at 15 s or under only 2 min and up are shown, and a muted line says so.
- **A record says how long ago it was set**, as quiet text after the name of the activity that set it,
  on the same line, such as "Morning run, 5 Jan · 12 days ago" or "Morning run, 5 Jan · today". The count
  runs in calendar days from today, read once when the page opens, so
  a later render does not move it. It reads in whole days to 13, then in weeks to 59 days, months to
  23 months, then years, each rounded to the nearest unit. When every record was set in one
  activity, the count moves to the source line: "All set on Morning run, 5 Jan · 5 months ago". A
  record's source is dated without its weekday, such as "5 Jan".
- **A duration's grade says the distance it is taken at.** A run's grade at 1, 5, 20 or 60 min is taken at
  the distance it covers at its flat pace, so its grade line reads "Local · 64% · 5.0 km in 20 min", written
  as any distance is. An effort's length reads the same in every record, trend and headline line, in whole minutes, so an hour is "60 min", never "1 h"; a length under a minute reads in seconds. A ride's grade is not given a distance, because it goes through its running equivalent.
- Sport pages use the athlete's units. Running is pace per km or mile, faster up; cycling is
  watts. Tooltips add the cycling W/kg. The Balance trend is the one chart that puts both sports on
  one scale: the age grade in per cent when the age and sex are known, else the energy rate in
  metabolic W/kg.
- **The weekly volume sits under the Balance trend.** A stacked bar chart, "Training hours per week", with
  one bar for each week of the trend above it: the moving time of the period's activities, in each sport's
  colour, stacked in the order of `SPORT_ORDER`. It shares the trend's weeks and x scale (`weekEndMs`, the
  UTC Sunday that ends each week), so a bar stands under the trend's point for that week; a week with no
  training is a gap, marked on the axis as the trend marks one. Its one line under the title is chosen in
  `volumeCaption.ts`: with more than one sport, the sport whose share of the hours moved most between the
  first and second half of the weeks, when it moved by 15 points or more ("Cycling rose from 22% of your
  running and riding hours in the first half to 82% in the second."), else the share of the sport with most hours; with one
  sport, how its weekly hours moved between the halves when they changed by a quarter from at least half an hour a week, else what they
  averaged. The chart has the shared frame's tooltip, arrow-key reading and table (week, hours of each
  sport, total). It is not shown when fewer than three of the weeks have training.
- **The default period** is the 84 calendar days (`DEFAULT_PERIOD_WEEKS` of 7) ending on the newest
  activity's day, when they hold a run and a ride. A day is counted in the device's local zone and
  runs from its first millisecond to its last, so an activity at 06:00 and one at 12:00 on the same
  day give the same window, and an older window never hides recent activities. It is clipped to the
  first activity's day, so a library shorter than 12 weeks is dated from its start. When those 12
  weeks do not hold both sports, as with a 2015 run and a 2019 ride, the default is All time, and
  the control says why: "Your last 12 weeks don't hold both sports, so this shows all time." It says
  so only when the library holds both sports. The period is computed in
  `packages/core/src/period.ts`. Each fixed period is the same number of calendar days ending on the
  newest activity's day. A custom range is the first to the last day the athlete picks, both counted,
  with `periodOf` in `packages/core/src/period.ts` dating it from the first millisecond of its first
  day to the last of its last. It may hold no activities, and the page then shows its empty state.
- A period's comparison is the same length before it, drawn as a thin dashed mid-grey line and named
  "Previous 6 weeks", "Previous 12 weeks", "Previous 12 months" or, for a custom range, "Previous N
  days" (or the word for its length when it is one of the named lengths). All time has none. The Balance trends
  have no period comparison: each already spans the selected period.
- A trend is the best effort of the chosen length (5, 20 or 60 minutes; Balance uses 20) in a
  trailing window that ends each week. The window is a third of the period, at most six weeks, so a
  six-week period uses two-week windows. Every point's window lies inside the period. The title
  names the effort as its segment labels it, such as "best 60 min", and the window. Each line steps from one Sunday to the next and breaks at a week
  with no value, and each Sunday has a marker. Past 13 months (400 days) a trend keeps the last week of each month, and its first and last
  week as its ends, so five years are sixty dots, not two hundred and sixty; its note says "Past 13 months, each point is the last week of its
  month." The first date of the axis carries its year, as the month ticks do. A sport's week-by-week chart also names its longest stretch
  of eight weeks or more with no value inside the trend ("No rides of 20 min or longer with power from 30 Oct 2022 to 24 Sep 2023."), naming the trend's effort length, since a gap at 60 min is not a gap in training. On a wide chart the
  Balance trend's end labels sit in a gutter right of the plot, level with each line's last point, and the volume strip under it keeps the
  same margin so the two time axes line up; a narrow chart sets them over the plot, clear of both lines. The latest value is labelled with its value alone, and the
  title names its effort and window, so it can differ from a card's best, which covers the whole period.
  When a sport's line stops before the window does, the note under the chart dates that sport's latest
  activity of any length, as long as it is before the last week: "No runs since 20 Jan 2025." (or "No rides
  since"), the activity's own local day. A short run counts, though it gives the trend no value. The note is
  left off while the line reaches the last week, and when the latest activity is in the last week.
- **"At the same heart rate"** follows "Week by week" on each sport page and reads the one signal built from
  easy and steady efforts (`docs/research/same-heart-rate.md`). A sentence sits above the chart and says one of
  three things. With a real change: "At 145 bpm you now run 5:52 /km, against 6:10 /km 8 weeks ago." (or
  "you now ride 214 W, against 198 W"). It says "now" only when the change reaches the period's last week; it
  otherwise names the week: "At 145 bpm in the week ending Sun 6 Apr 2025 you rode 214 W, against 198 W 5 weeks
  earlier." Without a real change, it quotes the first and last values: "At 145 bpm your pace went from 4:49 to
  5:01 /km: no clear change, within the error." (or "your power went from 204 to 207 W"), and with fewer than 4
  reporting weeks it says only "Too few weeks to show a change yet." in a muted line. With too little data
  to draw, the section has no heading, and a line of the "Not enough yet" list names what is missing, one of: too few steady 5-minute stretches, too few activities, activities in
  too few weeks, heart rate that hardly varies, no effort near the reference heart rate in the latest weeks, or
  less than 4 weeks of steady efforts in the period ("Needs 4 weeks of steady efforts with heart rate. Pick a
  longer period to see it."); the numbers in them come from `SAME_HEART_RATE`. The reference heart rate is the
  library's, not the period's, so choosing 6 or 12 weeks does not move it. A change is real only when the 90% ranges
  of the first and last reporting weeks do not overlap, and a fall is told as plainly as a rise. The words are
  "output at the same heart rate", never "fitness", "limiter", "weak", "strength", "holding you back" or "ahead
  of". The chart is titled with the heart rate and the sport's unit, "Your output at 145 bpm, flat pace per
  kilometre". It has one dot for each week that reports (a diamond for a ride, as in every chart) with its 90%
  range as a thin bar in the sport's colour, and no line across the weeks: a week that does not report has
  no dot and a mark on the date axis, as in the trend. The vertical axis is the sport's own number, pace
  with faster up or watts, and watts do not start at zero, since nothing is filled and a 5% change must
  show. The chart uses the shared frame: its key row is absent, its tooltip and arrow-key reading say the week,
  the value, the 90% range and the stretches and activities behind it, and **View as table** lists every
  week. The note under it says how a dot is made, that only outdoor runs and rides with a power meter count, and
  that fatigue can lower heart rate at a given effort, so a rise can come with fatigue as well as with
  training. The windows lie inside the period, as the trend's do, so a 6-week period reports about two
  weeks. The chart is drawn only with two or more reporting weeks.
- On the Balance age-grade trend, a run is solid with a dot, as recorded. A ride is an estimate: it
  is graded through its running equivalent, as the cards grade it, so it is dashed with a ring at
  each week, its model range is a band (a soft tint in the ride colour, with a ride-coloured outline), and the
  key says "estimated". Each grade is taken at the age
  on the day of its best effort. Without a weight, the Balance trend holds cycling: there is no ride
  line, ring, band, key or table column, and the chart says so. When only a ride has a value, the chart's
  empty message says that rides are held until a weight is added. On an energy trend and on the sport
  pages, cycling is drawn as measured: a solid line with dots.
- **Grade by duration** sits on Balance after the cards and the grading source line, and before the evidence
  and the trend. It answers one question the 20 minute balance cannot: is one sport better at every duration,
  or only at 20 minutes? Each sport's age grade is drawn at every best-curve duration from 3 minutes to 3 hours
  (3, 4, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120 and 180 minutes, `PROFILE_DURATIONS_S` in `constants.ts`, taken
  from `DURATIONS_S`) wherever its best effort and the age standards grade it, on a log duration axis and an
  age-grade axis in per cent. A ride is graded through its running equivalent. The analysis works those out at the six
  cross-sport durations (`EQUIVALENCE_DURATIONS_S`); the chart prices the rest itself, once for each result and
  body mass, wherever the ride curve has a best, so a combine does not pay for them. No point is invented: a duration where a sport has
  no best, or no standard (a run under a mile has none, so the shortest run grades are usually missing), has
  no point for that sport, and the finding counts only the durations both sports are graded at. Drawing follows the age-grade
  trend: a run is a solid line with a dot, a ride is estimated, so it is dashed with a ring and its 90% range
  is a band, and the key says "estimated". The 20 minute marks are larger, since the balance is taken there. The duration axis is titled "Duration (min, log scale)" and has a tick, in minutes alone, at each duration that has a grade. On a narrow chart the ticks are thinned, keeping the first, the last and the 20, so the labels read at 320 px; every duration stays in the tooltip and the table.
  The finding is the chart's lede, a sentence under its title, and the chart supports it. It is read from the
  grades the headline uses: the ride's heart-rate-adjusted equivalence, through the balance's own `balanceGap`,
  so at 20 minutes its lean is the headline's, and the chart never says "within their range" where the headline
  says it leans, or the reverse. A sport is higher at a duration only where its grade is outside the other's
  range, in whole percents; a duration inside the range is level. When no duration is outside it: "No duration
  separates your running and cycling: at every duration from 10 to 90 min the gap is within cycling's range."
  When one sport is outside the range at every shared duration it says by how much and how that changes:
  "Your running grades about 5 points higher than your cycling at every duration from 10 to 90 min, by a steady
  margin." The points are the median of the centre differences, in whole points. A shape clause is added when
  the gap changes by 4 points or more from the shortest shared duration to the longest: ", and the gap widens
  toward longer efforts" or ", and the gap narrows toward longer efforts"; below that it is ", by a steady
  margin". Otherwise it names only the stretches where a sport is higher, with the other durations said once:
  "Your running grades higher from 15 to 45 min, apart from 30 min; elsewhere the two are within range." A
  sport's leads that only level durations separate are one stretch, naming the level durations inside it, so a
  grade at the edge of a range does not break the sentence into pieces. When the higher sport changes: "Your
  cycling grades higher up to 7 min, your running from 10 min on."; with more than one change it walks through
  each. When no duration separates the sports the chart is folded behind **Show by duration** (**Hide by
  duration** while open), with the sentence visible above it; it mounts when first opened. When a duration
  separates them the chart is open, with the sentence as its lede. A ride's range is a band only over the
  durations both sports share: a duration where one sport has no grade shows its line and ring, not a band.
  The section is left out without a year of birth and sex,
  without a weight (a ride's grade waits for it), and with fewer than two durations graded in both sports,
  since a chart that would only repeat the 20 minute balance says nothing more. The chart's table lists each
  grade, with a ride's range in brackets, and its tooltip names the level.
- A previous period is a thin dashed mid-grey line (1.5 px, `--previous-mark`). It appears only when it
  has values, and otherwise its key row says there were none. A trend with one week of values keeps its title
  and says so in a line beneath it: "Only one week has a value: Run 60%, week ending Sun 12 Jan 2025. A trend
  needs two weeks with values."
- On a short screen (SHORT_PHONE_MAX_HEIGHT_PX, for a finger or a window 760 px wide or less) the page's
  header, notices and sections sit closer, the answer sits closer to its meter, and the meter's plot, ends and
  key sit closer still. At 320 x 568 the meter's scale and its key are above the section tabs, which are the
  bar at the foot of the screen there. The sample banner is two lines at that width, and its padding tightens on a
  short phone, which brings the key up. At 320 x 640 the key is above the bar too. In landscape the answer sits
  beside its meter: at 667 x 375 the meter is above the foot bar, and at 844 x 390 it is on the first screen,
  where the tabs sit in the header.
- The Balance headline runs the answer's full width, so on a wide screen it is one measure across the card row.
  The lede and the lines under it keep a 62 character measure. The balance meter spans the card row, so its centre
  is the gap between the two cards. Running is
  on the left and cycling on the right, in the order `SPORT_ORDER` gives (`apps/web/src/ui/sports.ts`):
  the cards, the meter, the landing example and the share card all follow it. The meter plots the
  age-grade gap in whole points, with the range as a band and the best estimate as a dot. Ticks sit at
  10, 20 and 30 points either side of the centre, and a lead past 30 is drawn at the end, marked "30+"
  ("30%+" in percent). The best estimate is printed over the dot as "6 pts". Its scale is the gap in
  points when both sports are graded, and the energy ratio in percent when they are not. The track has
  a 3:1 outline, the band a solid edge in its sport's colour, and the end labels name each sport with
  its glyph. The key under it gives the range in words and reads the same on both scales: "Dot: best estimate. Band: 90% range, 2 to 10 points. Scale: age-grade points.", or "Scale: energy per kilogram." when the scale is the energy ratio. When the heart-rate check adjusted the range, the key says so in place of the points scale: "Dot: best estimate. Band: 90% range, 2 to 10 points. Adjusted by heart rate."; on the energy ratio the note follows the scale: "Scale: energy per kilogram. Adjusted by heart rate.".
- The level ladder draws the age-grade bands on a 30% to 100% scale, with its labels as text beside
  the drawing and fills its column, with no fixed width. Its bar is the same height at every width,
  and its marker a fixed size, so the labels stay on the bar as the column narrows. A run's grade, read as recorded, is a solid dot. A ride's grade is estimated, so it is
  a ring over an outlined band for its model range. The bands the grade falls in are filled in its
  sport's soft colour and named in bold: the band of its centre, or every band from the low end of a
  ride's range to its high end. Band edges are ticks. A marker past either end of the scale stays
  inside the track, outline included, and a chevron stands just outside that end; the key says the
  grade is below or above the scale.
- **The key sits under every ladder**, as a paragraph, in words: "Solid dot: the grade of one
  recorded effort." for a run, and "Ring: estimated, with its 90% range in brackets." for a ride. The
  shape is never the only cue. The landing example has no key, since it is illustrative.
- **A Balance card reads top to bottom:** the sport's name, the threshold as the hero number (its
  unit set at about 40% of the numeral), the threshold in plain words ("About the pace you could
  hold for a long, steady effort, estimated from your best 3 to 20 min efforts."), the grade line,
  the ladder with its key, then the best efforts, with the Flat note under them on a run. A card
  names no age or standard: the source line under the cards does. On a phone, 560 px and below, the
  best efforts sit in a closed disclosure titled "Best efforts", so the answer and the ladder read
  first; from wider screens it is open. A visitor's own choice holds across a resize. The grade line
  gives the level and its percent. The effort it grades sits on a line of its own under it: "on your
  best 20 min, 6:37 /mi". A ride's line starts "Estimated", and its watts carry "estimated" when
  they did not come from a power meter. A run card that shows a Flat mark says what it means under
  its records, on every run card that has records, with or without a grade: "Flat pace: your pace
  allowing for hills, as if on level ground." On an activity page the note sits under its splits when they show a flat pace column.
  Otherwise, when the splits are not kept, too short, or show no flat pace, it sits under the best efforts,
  if one carries a Flat mark, and it waits for the splits to settle.
- **A threshold is checked before it is shown, and a refused one shows no number.** Two reasons, and
  each has its own words in the threshold's place. Missing efforts: fewer than four efforts from 3 to
  20 min, or none that reaches 1140 s (within 5% of 20 minutes); the place reads "Needs efforts between
  3 and 20 min", or, when efforts are held in that range and none reaches 1140 s, "Needs an effort of about
  20 min. Your longest so far is 5 min.", so the place never asks for efforts the card lists. No threshold: the efforts are flat, the work capacity is below the least a rider or a
  runner has (3 kJ of cycling W′, or 15 m of running D′, which is 58.5 J per kg), or the threshold is
  not below the lowest of the efforts it was fitted to, since a threshold cannot be faster than an effort
  held; the place reads "Needs a harder effort between 3 and 20 min". The floors are far below the
  published work capacities, so they refuse only fits close to flat. A fit just above a floor is kept,
  and its threshold then sits close to the best 20 minutes, which is honest: about what was held. The
  ride's floor is the same at every body mass. The share card labels its threshold "Threshold flat pace, estimated from your best 3 to 20 min" for a run, and "Threshold power, estimated from your best 3 to 20 min" for a ride, printed in capitals, and every column reserves the rows of the tallest label, so the two figures line up even where one label wraps to a single line. Both labels share one size, which steps down from 30 px to 26 px only where a label would run past two lines in the square's narrow column. The line "About ... estimated from your best 3 to 20 min efforts" sits under
  a number only, and is left out with none.
- **A threshold has its range under it, in small text.** It reads "Range 22:58 to 23:49 /km" for a
  run and "Range 48 to 49 W" for a ride, or "About 48 W" when both ends would print the same. The method is the standard error of the critical-power fit: one
  standard error either side of the critical power, a rough spread of the fit rather than a confidence
  interval. A range is left out when its low end is not above resting metabolic rate, which
  would be no estimate of a threshold; when a ride's fit draws on an effort whose watts are estimated from
  virtual power, since that range would be an estimate of an estimate; and for a refused threshold.
- **An uneven best sets only a floor, so the range runs up to a second threshold.** A best of 10 minutes
  or more is uneven when a shorter best from the same ride, at least 40% as long, lies inside its window
  and the rest of that window averages under 85% of the shorter best: a 15 or 20 minute effort held
  while the easier riding round it was all the rider could hold at the start. The threshold is then
  fitted without those bests, and it is the top of the range, from the main threshold to that one
  ("Range 261 to 296 W"). Such a fit is kept only above the main one. Under the range, one muted
  line says why: "Your best 15 min and 20 min were uneven: each held a hard burst inside easier riding, so
  the range stays wide. A steady all-out 20 min would narrow it." A run says "running". When
  the uneven fit draws on estimated watts, the line adds "The top end uses estimated watts." The range
  replaces the standard-error range for that sport. When the main threshold is refused, the range starts
  from the floor instead, the lowest of those bests, and the figure shown in place of the refusal is that
  floor, with the same line under it: a demonstrated effort the threshold sits above, not a threshold.
  The Balance card follows the same rule: it shows the floor as its hero under "Threshold power, at least" (or
  "pace"), with no meaning line, in place of "Needs a harder effort between 3 and 20 min". The share card does not:
  its threshold is an estimate it labels "estimated", so a card with only a floor is not offered.
- **A record's change on the period before** reads in words under its figure: "0:12 /mi faster than
  previous 6 weeks", or "8 W more than previous 6 weeks", or "Same as previous 6 weeks" when the
  figure has not moved. It is absent for All time, and for a ride when either best's watts are
  estimated, since two estimates moving is not a change in the rider. A record with no grade leaves
  its grade out, so every row keeps the same columns. A sport page's and an activity page's list
  says a ride's "Estimated through its running equivalent" and its no-standard note, such as a run's
  "No age standard under 1 mile" or a ride's "No age standard for this duration", once, under the
  list, and each row then reads only its level.
- **Power is said to be measured or estimated on the page.** When a ride's watts were not measured by
  a power meter, the best efforts say "Power meters measured 2 of 5 rides. Watts for the rest are
  estimated." The line links to How sure is this?. The pipeline writes an average power only from a
  power meter, so the **Estimated** mark on the activity page and in its list row guards a summary that
  carries estimated watts.
- **How your reps held up** sits in an activity's In detail section, under the lap buttons (a Laps row shows for two or more recorded laps, since one lap is the whole activity, and Suggested intervals show when none were recorded), when the activity
  has at least 3 laps (the device's, or the suggested intervals when it recorded none) of about one length:
  within 20% of the middle one's duration. Recoveries between reps are left out only where they alternate with
  the reps: where the sorted outputs part by 15% or more and the hard laps all sit at places of one parity, the
  laps at those places are the reps, so a rep that fell to the recoveries' pace stays in. With any other
  pattern every lap is a rep, so a rep that blew up is the fade shown. Laps that run straight into each other
  are splits of one effort, not reps, so they get no table. Every rep needs the measure it is read in, and none
  is dropped for want of one. A run is read as flat pace where its altitude gives a grade for each rep, so a hill
  does not pass for a fade, and as recorded pace otherwise. A ride is read by its power; without power, by speed
  on a trainer only, and an outdoor ride without power gets no table. One sentence leads, naming the rep that
  differs most from rep 1: "Rep 6 was 4% slower than rep 1." (a ride's power: "Rep 3 averaged 4% less power
  than rep 1."), or "Your reps stayed within 2%." when the widest unrounded gap is 2% or less. The table lists
  each rep with its time, average pace or power and average heart rate, and drops the heart-rate column when no
  rep has one. A rep's button selects its lap as the lap buttons do. The rules are in
  `apps/web/src/ui/pages/intervalFade.ts`.
- **An activity page reads top to bottom:** the name, the sport, the day and start time (with an
  **Indoor** chip for a trainer ride and a **Walking pace** chip for a run at walking pace), the route when
  it was kept, then the moving time as the hero, with the elapsed time under it when the file kept both.
  Distance, average pace or speed over the moving time, climb, average heart rate with the highest 30 s
  average (the stream's own highest reading is higher), and average power follow. An indoor ride reports no
  speed anywhere, since a trainer's speed is virtual rather than measured on a road. Then **In detail** (the
  time selection, the measures, the lap buttons, how your reps held up, the plots, the figures for the
  selection and time in zones), then, for a ride without a power meter, the line "Power here is estimated
  from speed and climbs. No power meter recorded it." Earlier and Later name the activities either side in
  the library, then the all-time records as chips, each linking to its sport's page (underlined on hover, not
  at rest), the splits (runs), the best efforts set here (a run at walking pace gives a line saying it is
  left out of the run analysis instead), the skipped readings, and Delete. A ride with no power curve says why in a line: an estimate is made only on
  climbs, and a ride with no power data has none. A ride's bests and chips wait for the weight. An
  activity from before moving time was kept shows its elapsed time, and says so.
  The best efforts set here do not follow a period the athlete picked elsewhere without saying so: a best that is an
  all-time record is marked "All-time record" exactly when it has a chip above (a ride's one-minute best has none), and
  one that is only the best of the period on screen says which, such as "Best in the last 12 months" (a custom range
  gives its dates, or "Best on 3 Aug 2025" for one day; all time names none). An activity outside that period has no
  period bests, so it lists its distance times and names its all-time records, with a link to the sport page for their
  figures ("Choose All time on the Run page to see their figures", or "See the Run page for their figures" when the
  period is already all time), and never says its bests are "not counted".
- **A list row reads the same figures.** The name, sport, day and start time, with the **Indoor**
  and skipped-readings chips, then the moving time, distance and climb, labelled, and the record
  chips. A ride's record chips wait for the weight, as its page's do. At the right sit the pace for
  a run, the speed for a ride, or the average power of an indoor ride with a power meter. The legs
  of one upload are a session: its bytes are hashed, so two uploads of one name are two sessions.
  Where the origin is not secure and there is no crypto.subtle, nothing is hashed, so the legs are
  not grouped and the import still reads. A session sits under one row that gives its total time,
  with the legs indented in the order they were ridden. This grouping applies only in a date sort,
  where a session's legs are next to each other. In a distance or time sort each leg is a row of its
  own. The time sort orders by the time each row shows, which is its moving time. Month headings
  group the rows when the list is in date order; another sort drops them, and at a page break a
  month heading repeats, so each page names its months. The page is counted over rows, so a session
  is never split across two pages, and the summary counts its activities. The pages are numbered
  beside Previous and Next: the first and last, and the pages either side of the one shown. A single
  page between two numbers is numbered too; a gap stands for two or more, and a screen reader hears
  "pages skipped" for it. Moving a page by a click moves the list to its top, and keeps focus on the
  control pressed while it can still be pressed and is on screen (a page number, or Next while a
  page follows); otherwise focus goes to the first row. The page status reads the new range. Legs of
  one session are listed in the order they were ridden, even in a newest-first list. A removal made
  on an activity's page goes to the list, which announces it once, and the list's address drops the
  marker that brought the visitor. A notice or error from a removal clears when the visitor moves to
  another page, so Profile shows no old "Deleted ...". The list's own outcome also clears when its
  sort, filter or page changes.
- **Best efforts share one list,** `SportRecords`, on the Balance card, the sport page and the activity
  page: one row per record with one source size, built by `recordRow`. A run's own distance times, such
  as its 5 km time, are graded at the day it was run, and the activity page links their level to How is
  this graded?. A run's pace is marked Flat, which the note spells out. Under a run's list a line says its distance
  times are as run, since the pace curve allows for hills: "Distance times are as run. The pace curve allows for
  hills, so they can differ."; a ride's watts are marked
  Estimated unless a power meter measured them. A record set by a run held indoors is marked
  Treadmill in the same chip, on its row, on a distance time and in the grade line's effort. When
  every record was set in one activity, that activity is named once under the list ("All set on Morning run,
  5 Jan · 5 months ago"), the link and its count on one line in the second column, the name wrapping
  so the date stays whole. Otherwise each record links to its own activity, with its own count on the
  link's line. A long activity name is cut short with an ellipsis, and its full name is the link's
  title and accessible name.
- **The cross-sport idea is a quiet section, not a card:** a glyph pair, its headline ("On foot, your
  ride is worth 4:10 /km", with a no-break space), and the ride's watts marked estimated when no power meter measured them.
  Its ride figures and its table wait for the weight, as the cards' do, and its needs-a-ride line names
  the dates the period is missing a ride between, or says that a long ride needs power when it has no power curve. The evidence card is a card
  only for a gap with an action, and its how-to links to the 20 minute effort under How sure is this?'s heart-rate
  check; good news is a quiet line with no heading.
- **Only the drop area is dashed.** On the landing page the example beside it is a solid frame, with
  its figures at the body size in each sport's line, so the two never read as two drop targets. The export guides
  are a tile grid that opens one service's panel, not a stack of full-width panels.
- **The Balance footer is one line** that names the age and the standard, "Graded for a 37-year-old man on the USATF road standards.", adds a sentence on rides only when a ride is graded, and ends "A level, not a ranking." The full credit, with the authors and licence, is on How sure is this?, not on Balance or the sport pages.
- **On a phone, the two grades sit under the meter**, in the meter's own group so they keep its gap, as "Run 64% Local / Ride est. 58% (52–63%) Recreational to Local": a ride is an estimate, so it says "est." and gives its range and levels as its card does. Each sport's name, mark and figures are kept whole and only its level wraps, so the line reads at 320 px. The cards say the same, so the line is hidden from assistive technology, and it is hidden at wider widths, where the cards sit side by side.
- Phone first: every page is designed at 390 px, with a 16 px gutter and no sideways page scroll.
- **Tables that cannot fit become lists, without a scroll.** From 480 px a `<table>` with a caption
  and scoped headers. Below 480 px an `<ol>` with one `<dl>` per row, holding the same values. Both
  are in the page, and a media query shows exactly one at each width, so the accessibility tree
  holds one representation. Never set `display: block` on a table element, which drops its table
  semantics. A split's columns earn their place: Elevation gain shows only when some split climbs, and Flat
  pace only when some split has one that differs from its Pace, so a run with no altitude or no flat pace shows neither column. A flat pace more than 1.5 times the time run (a descent past about 8.5%, where the energy model is least sure) is left out as a dash, and one note under the splits says so once, not per row. Only one split with a pace is never marked Fastest. Where the device recorded laps that are not its automatic mile or kilometre laps, as an interval session does, the splits open on the laps once the recorded detail has loaded (or after 1.5 s, whichever is first, showing the units meanwhile), with a Miles or Kilometres / Laps toggle to switch; after that the view never changes by itself, and the athlete's choice wins. Each lap shows its time, distance, pace and heart rate, the time being its seconds less its rests, as a split's is, and a lap timed for under 5 s or faster than any runner has no pace. The flat pace note follows the view that is open: with the laps open, it sits under the best efforts. A partial last split, shorter than one unit, is never marked Fastest and its bar stops at the full width, since a few metres' pace is too noisy to be the best; it reads to
  two decimals, such as "0.97 mi", rounded down so it never reads as a whole unit. Below 480 px a split
  leads with its split and pace, then its other figures, which wrap as the width needs: two or three lines. The splits table on the activity page is the first use, and the efforts table on a Balance card
  is the second, whose list shows below 480 px with its labels once above the rows. Record any new one here.
- **Bars start from zero.** A bar's length is the value relative to the best known one, so the best
  fills its track. A row with no known value has no bar and cannot be the best.
- **The best row says so in words.** A small `.chip` reads "Fastest" beside its value, and the value
  is bold, so the mark does not rest on colour or weight alone.
- **Missing values** show a dash, with words for a screen reader that say why: "Not measured" for a
  time the device did not record, or an implied speed over 12.5 m/s that no run reaches; "Not
  available" for a grade; "No altitude"; or "No heart rate".
- The share image is a dark canvas card on ink, as a square (1080 by 1080, "Square (feed)") or a tall
  story (1080 by 1920, "Tall (story)"). Share sits under the answer's lede, dimmed and inert while the analysis runs, and opens a sheet: a
  preview, the note that it is made on this device, an optional **Name on the card** field, the choice of
  shape, and one action. The name is 40 characters at most, empty by default, kept in this browser under
  `rca.card-name.v1`, drawn only on the card, and never sent to the server. The action reads "Share file" only
  when the device's share sheet can take this image; otherwise it reads "Save image" and downloads the
  PNG. The PNG is encoded once, for the preview, so the share starts within the tap. Until the chosen
  shape is drawn, the action reads "Preparing…" and is held: a tap does nothing, and the last picture
  stays, dimmed. A click on the backdrop closes the sheet. The sheet's action is outlined like the other
  buttons, so the page's one primary action stays Add files. The file is named by the period's dates,
  such as `balance-2025-05-12_2025-08-03-square.png`.
- The card holds the brand mark, in the two sport colours, and the app name in words, in volt. When the
  visitor has typed a name for the card, it sits small in secondary text at the right of that top row, before
  the sample badge, cut with an ellipsis where it would reach the app name. Under the
  headline sits the lead in one line, "Running grades 6 points higher than cycling", the same words
  the meter reads. Then the balance meter, each sport's threshold, "Threshold flat pace, estimated from your
  best 3 to 20 min" for a run, with its W/kg and its level, such as "Local · 64% on best 20 min", under
  the figure, and a glyph beside each label for its sport; the period; the heart-rate caveat as a starred line when there is one; the footnote; and the
  site's host when it is public.
- Figures are drawn in text colour. Sport colour appears only on the brand mark, the edge of each
  column, and the meter's band, dot and outline. It never colours text.
- The card is offered only once both sports have a threshold, a balance can be stated and a weight is
  entered. A card never asks the reader for anything, so there is no prompt on it: while a sport has no
  threshold, or no weight is entered, the share button is not shown.
- The site's host is named only when it is https and public. A local, private or carrier-grade address,
  a `.local`, `.lan`, `.home.arpa`, `.internal` or `.ts.net` name, and an http origin name no site.
  The port is dropped. Its tokens are copied in `apps/web/src/share/cardColors.ts`.

## Copy

- **Numbers are grouped in comma thousands, with a point for decimals, whatever the browser's
  locale.** "1,234 runs" and "10,234.5 km" read the same in every locale. Years, clock times and
  dates are not grouped.
- **Balance is neutral.** Say which way it leans ("Your balance leans toward running"), never
  that a sport is a limiter, a weakness or holding you back.
- **The balance is stated as a grade gap.** With both grades: "Your running grades 6 points higher
  than your cycling, on your best 20 min in each." When the gap's range spans zero, the best
  estimate is named and the range is given, under the title "Your running and cycling are in balance":
  "On your best 20 min in each, running's age grade is 4 points higher than cycling's, with a range of −2 to +10
  points for that lead, so the two are level." The range is read from the leading sport's side, so a cycling lead reads "cycling's
  age grade is 4 points higher than running's, with a range of −2 to +10 points for that lead". When the best estimate is level: "On your best 20 min in each, running and cycling have the same age grade, within −2 to +2 points, so the two are level." A lopsided range names its side: "within −1 to +3 points (running minus cycling)". Never "ahead of". Without an age and
  sex, the energy ratio stands in, as in "Over 20 min, your running is about 12% higher than your
  cycling, as energy per kilogram." The prompt says that adding them shows the balance in points and
  levels. The energy ratio's 90% range names the sport that leads, with the same figures as the sentence
  and the meter: "Ride against Run, 90% range: 11% to 33%." on How sure is this?, and "Run
  against Ride, 90% range: -2% to +4%." only when the two are even. The lede names no dates: the period control's caption under the meter gives them when the period is
  not All time, so the lede reads "Your running grades 2 to 10 points higher than your cycling, on your best
  20 min in each." on its own. The lede says a lead as its likely range, so the gap is never read as one
  exact number, and the meter's flag gives the best estimate; the energy ratio does the same: "Over 20 min,
  your running is 5% to 20% higher than your cycling, as energy per kilogram." A range that rounds to a
  single value is said as that value: "grades 6 points higher", "about 12% higher".
- **The level target says what would level the balance.** When the balance leans, one muted line under the
  meter, below the grades, names what the lower sport's best effort at the headline length would need to grade
  level with the higher sport's whole-percent grade, in its own unit, rounded toward the side that levels (watts up to the next 5 W, a pace to the faster 5 s), and a ride's range is the watts at the 5th and 95th percentile of its equivalence, rounded outward to 5 W: "To grade level
  with your running at 20 min, your best ride would need about 270 W (roughly 245 to 295 W; now 246 W)." The target inverts the age grade at the lower sport's
  age, and a ride's watts invert the same equivalence its page grade is read from, with its heart-rate weights, so the
  words say "would need", never a prediction. It is left off when the
  balance is even, when either grade is not on screen (a ride's waits for the weight), and when the rounded target
  does not beat the figure the page shows for the lower sport, in whole watts or whole seconds of pace. It sits under the meter rather than the lede, so the meter stays above the section
  tabs on a phone. The share card does not carry it, so the card keeps the layout it had.
- **Grades read as whole percents, floored.** `formatGrade` in `apps/web/src/ui/gradeFormat.ts` writes
  every grade on the cards, the ladder and the balance gap, so 64.5% reads as 64%, and a grade never
  reads above its level band: 89.6% is 89%. The gap is the difference of these whole percents.
- **One vocabulary for the sports: Run and Ride.** Every title, label, legend, axis name, card heading,
  tab and table heading says Run or Ride, as "Run compared with Ride by duration", "Higher Ride energy rate",
  "Run against Ride, 90% range" and "Run, as recorded". Running and cycling stay in sentences, where they
  read naturally, such as "Running grades 6 points higher than cycling". A chart's accessible name is its
  title, so the two match. Chart descriptions and the reading cells of the ratio table are sentences, so they keep "running" and "cycling", as in "Running 8% higher than cycling"; so do the balance sentences. The Method energy curve names its energy rate once, as "energy rate (metabolic W/kg)", in its title and its
  table caption, with "Energy rate (metabolic W/kg)" on its axis. The shared energy trend and the heart-rate chart name their unit the same way, in their axes and column headings.
- **Effort checks state the measured share and the action.** A best effort below 90% of your reference heart
  rate says the share it reached, then "A hard 20 min effort would raise this.", with no "probably" or
  "could be higher" (the cards are titled "Your best run was at an easy heart rate", and the like), never
  "all-out" or "heart-rate reference". How sure is this? defines the reference heart rate
  in one sentence, where it explains the heart-rate check. Each line that names it glosses it once, as "(set from your highest
  heart rates on file)", which holds for both sports: cycling's is derived from running's, so a ride is never
  called your highest heart rate. A sport page's line says "so it was hard" at 90% or more,
  judged on the percent it shows, so a share that rounds to 90% is hard.
- **Race predictions sit in the middle.** The Run page predicts the 5 km, 10 km, half marathon and
  marathon after Best efforts, in two columns that fit 320 px. The first column holds the race with its
  pace under it. The second holds the predicted time, "range" its 10th to 90th percentile, and the two
  estimates it sits between ("runs 20:25 · heart rate 18:13"). Each is the geometric mean of the runner's
  bests and the races their heart-rate VO2max would run, both carried by Riegel's law at 1.07 and, for the
  marathon, Vickers & Vertosick's mileage-corrected model. The note says how many hard runs the heart-rate
  side rests on, how many hilly runs it left out, and, when the two disagree, which points higher and
  why. In All time the note adds "In All time they reflect your best period. A shorter period shows your recent form." The evidence disclosure says which best each estimate was carried from. With no best from the mile up
  and no heart-rate VO2max, the section has no heading and says so in the "Not enough yet" list. The method and its sources
  are in `docs/research/race-prediction.md`. Predictors are keyed by sport in
  `apps/web/src/ui/racePredictions.ts`, so a sport adds one there and the page shows it.
- **Heart rate that cannot be right is set aside.** When a ride with a power meter, or an outdoor run, holds
  a best effort of 10 min or more at or above the sport's threshold and its heart rate stays under 70% of
  the reference heart rate, or was flagged as too low for the power through it, the sensor was wrong. That
  activity's heart rate is left out of the heart-rate check, the effort checks and the reference heart
  rates (`packages/core/src/hr/setAside.ts`). A too-low flag counts only where it covers that effort. The
  worst is set aside first and the references are retaken before the next is judged, so one activity's
  spike never sets aside a sound one. Its watts and pace still count. How sure is this? says how
  many runs and rides were set aside, and the activity's data notes say why. Estimated watts and treadmill
  pace are never the judge, since they can be what is wrong.
- **Heart rate too low for the power is judged against the athlete's own heart rate.** A stretch of at
  least half the ride's median power, 90 s or more, whose 5 min mean heart rate is under 75% of the athlete's
  median heart rate at about the same power (within 15%) elsewhere in the same activity, after the 10 min
  warm-up, is flagged and its heart rate is left out (`packages/core/src/quality/lowHeartRate.ts`). A fixed
  bpm floor mistook a fit athlete's easy ride for a fault. A whole activity read low has nothing of its own
  to fall below, so the library judges it, in two ways. The best-effort test above sees an effort at threshold.
  For an endurance ride whose strap failed from minute 25, the other is the whole-activity test
  (`packages/core/src/hr/lowForPower.ts`, `HR_LOW_FOR_POWER`): an outdoor run, or a ride with a power meter,
  of 20 min or more moving with at least three 5 min heart-rate blocks, is compared by its median heart rate at
  its median output with the library's heart rate at that output for its sport, a robust (Theil-Sen) line
  fitted over all of them and refitted without the ones it first set aside, and only an activity whose output lies
  within the 5th to 95th percentile of the fitted outputs is judged, so the line is never extrapolated. Under 75% of that sets it
  aside. A sport with fewer than 12 such activities has no line, so it gets no verdict.
- **Lead with the finding**, in the words an athlete uses: pace, watts, time, distance.
  "Energy rate" and "W/kg" belong on How sure is this?, not on the surface. A plain phrase such as
  "as energy per kilogram" may explain the balance. On How sure is this?, and in the axes, headings,
  tooltips, notes and end labels of the energy charts, the energy rate's unit is "metabolic W/kg", never
  plain W/kg; watts per kilogram of measured power stay "W/kg". A table cell under a heading that already
  names the unit gives the bare number, as the other tables do, so the energy tables read "17.0" under
  "Run energy rate (metabolic W/kg)".
- **How sure is this? opens with three lines**: what is recorded ("Running efforts, and ride power from
  a power meter, are recorded."), the balance in Balance's words with whether even is inside the range
  ("Your balance leans toward running. Even is outside its range."), and how far to trust it ("These
  checks show how far to trust them."). The estimates sentence follows the balance and names only what the
  library holds: "Thresholds, ride levels, the balance and ride power without a meter are estimates
  from N runs and M rides." With no weight or no ride it reads "Run thresholds are estimates from N
  runs with a usable effort." With no usable run it reads "No run has a usable effort yet.", or, with
  a weight and a ride, "Ride levels and ride power without a meter are estimates from M rides with a
  usable effort." It does
  not repeat the period, which "Counted over" names above it. Each chip is a button named with its
  word and its destination, and moves focus there. Recorded and Estimated both go to Age grades and
  levels, where a run's grade is read as recorded and a ride's grade is an estimate. Checks below
  goes to the heart-rate check.
- **Define a term once, in plain words, where it first appears** on How sure is this?: the energy
  rate, the 90% range and the median each get one plain sentence. Technical detail (efficiency
  constants, citations, the bike model, the ISA atmosphere) sits behind More detail.
- **Durations are written one way.** Effort lengths are numerals with min: "5 min, 20 min or 60 min".
  A total of an hour or more is hours, then minutes: "6 h 33 min". Seconds are numerals with s: "10 s". Periods are numerals with the unit in full: "6 weeks", and a
  trend window is "14 days". Inside a sentence a period is lower case: "last 6 weeks".
- **Spelling is British**: analyse, centred, summarises, colour, licence.
- **The share card speaks in one voice,** the reader's: "Your balance leans toward running", never
  "my". Its footnote names the standard and says what a level is, "Graded on the USATF road
  standards. A level, not a ranking.", or, with no grade on the card, "Estimated from your files. Not
  a ranking."
- **Caveats become chips and shapes.** Draw a range instead of writing it; a caveat is a chip with
  an icon that links to the detail.
- **Splits say what happened when they are missing**: "Splits were not kept when this run was added."
  for a run whose digest predates splits, "This run is too short to split." for one too short for a
  whole unit, and "Splits are kept for runs up to 500 km." for one past the limit. When the worker
  cannot answer, the page says "The splits could not be loaded. Open this activity again to retry."
- **Plain words for what went wrong.** A refused file's reason comes from its code in
  `apps/web/src/ui/analysis/rejectCopy.ts`, never the core's English: "Damaged, so it could not be
  read. Export it again.", "Too large to read (over 64 MB). Export a shorter range.", "Same workout as
  run.fit, so it was not counted twice." Sport names are words, from FIT's names and Strava's
  types alike: "A walk is not a run or a ride." Nothing says "worker", "deployment" or "re-import". The one place "UTC" is
  said is How sure is this?: its trend's weeks are UTC weeks (`digest/trend.ts`), so the page says so.
  The data notes are grouped by kind, one line for each kind with its true count and the times of the
  readings the digest kept. Only the kinds that remove readings are counted, on the row, as
  "Readings skipped once" or "Readings skipped N times", and only when the readings skipped cover at least
  1% of the activity's moving time (`SKIPPED_MATERIAL_SHARE`), since a blip of seconds leaves an average
  where it was; the page lists every kind in its own line, with its count, and says no total. An altitude jump is a note, not a skipped reading: the climb and the slope-based figures near it
  are left out of the figures. So is an implausible climb, altitude rising faster than anyone can climb: its
  slope-based figures are left out, and its line gives each stretch's times. So is a disagreement between a file's
  speed and its distance: there each second counts only the lower of the two. A missing altitude is one note for the whole activity, so it has no count. Without any
  skipped reading the section reads "Data notes"; with one it reads "Skipped readings". The words are
  `flagKindSentence` and `flagSpanText` on the page, and the row's count is `skippedReadingsText`, all in
  `apps/web/src/ui/analysis/flagCopy.ts`. The activity page uses them, so the core's English is never
  shown. The words say what happened, never "impossible". An activity whose heart rate the analysis set
  aside gets one more note, last, even with no flags: `setAsideActivityText(sport, judgement)` in
  `apps/web/src/ui/analysis/setAsideCopy.ts`.
- **Times are the viewer's own.** A limit's reset reads in local time: "It resets at 4:00 PM, your
  time.", never UTC.
- **Every number names its source**: the activity that set it, with a link to that activity.
- **Evidence gaps say what to do, on the card itself**: one plain paragraph under the gap, saying how to
  record a hard, steady 20-minute effort with heart rate on, or how to add heart rate to a file. Its
  links are "How sure is this?", to the method page, and, on the gap card, "How the 20 min effort is
  checked", to that section of it. Good news has no how-to.
- **Export guides cite their sources.** Each guide's steps name only what the sources cited beside
  them in `apps/web/src/ui/exportGuides.ts` support. The source line says where the steps came from,
  decided by the guide's `verified` flag, so a guide never claims a help page it did not read. Guides
  use curly quotes, and say "zip", never ".gz".
- Dates are friendly: "Tue 3 Jun", with the year only when it is not this year. A summary line, such as the latest activity or a sport's last run, dates its day without the weekday: "3 Jun 2025". The names of the days
  and months are the viewer's language, from the browser; the order stays day first. A distance has one
  decimal, as in "6.2 mi" or "10.0 km"; under a tenth of a unit it reads "<0.1 km". A range of months
  gives the year on both ends when the years differ, or when either is not this year: "from Mar to
  Oct", "from Mar 2023 to Oct 2026".
- **A period's dates always carry the year**, as in "12 May – 3 Aug 2025" or "3 Aug 2024 – 2 Nov
  2025", so a span reads without the current date. A single day is written once, as "14 Jun 2025".
  The period control, the Balance caption and the card's period line show the same dates.
- **Empty states name the period.** When a sport has nothing in the period on screen, the page says which dates it is missing it between and how many the library holds in All time, with one tap to show All time: "No rides between 12 May and 3 Aug 2025. You have 14 rides in All time." The same sentence heads the empty sport on Balance and the sport page, so the wording is one. A sport the files do not have says so, shows no period control, and offers the file chooser as a secondary button. A sport the files have, with none in the period, offers **Show all time** as its one button. The empty sport is a short prompt rather than a card, so it takes little room beside the sport that has activities. An activity list with nothing to show says the same way, with its dates. Empty sections and links to empty pages are left out, so a one-sport file shows no comparison slots. The one-sport answer says "Your run results are below."
  (or "Your ride results are below."), and the empty sport card beside it offers **Add rides** (or **Add runs**)
  as the secondary file chooser. The answer itself offers none, so there is one.
- **Not enough to compare yet.** When both sports are on file but no efforts of the same length can be
  compared, the answer reads "Not enough to compare yet", with "From 1 run and 2 rides. A hard 20 min run or
  ride would let them be compared." beneath it.
- **The headline needs evidence on both sides.** Each sport needs a fitted threshold or an effort as long as
  the headline's (20 min). A sport known only from shorter efforts, such as one estimated 5 min ride, is not set
  against the other: the answer reads "Not enough to compare yet" (`headlinePick`), on the page, the share card
  and the import summary alike. How sure is this? holds its energy view the same way: "The comparison is held until there is an effort
  of 20 min or more in each sport.", with no ratio chart and no energy-ratio copy.
- **A run at walking pace is not a run.** A run whose moving pace is slower than 15:00 a mile for 10 min or more
  is a hike recorded as a run, unless its cadence is a runner's (130 steps a minute or more) or, without
  cadence, a tenth of its moving time was at a jog (`WALKING_PACE`, `digest/walkingPace.ts`). Either signal
  keeps the run: a runner's median cadence over all its moving seconds or over just those faster than a walk,
  or the jogging share, so a run/walk session or a hilly ultra with a low median cadence is still a run. It
  stays in the library with a Walking pace mark on its row and its page, where a line takes the place of its
  best efforts, is left out of every run analysis, volume and best, and a line under the import notices counts
  them. Every count and date the pages give of what is analysed leaves them out (a library of hikes alone asks
  for a run and a ride), while the activity list and the activity pages keep them.
- **Few efforts are counted under the lede.** When either sport has fewer than three activities in the
  period at least as long as the headline effort (20 min), the answer says so beneath the lede: "From 1 run
  and 1 ride. Add more runs or rides for a steadier answer." It is left off once each sport has three.
- One "How sure is this?" link per card at most.
- **A level says how it is graded.** A level's grade line may link to its age grades with How is this
  graded?, which opens How sure is this? and focuses the grades heading, since a fragment would change
  the hash route. The request lasts for that one navigation only: any later route change drops it.
- The app grades, it never ranks: no percentiles, no "top X%", no composite score across sports.
- **Flat pace, and grade for age only.** Every running pace worked out as a flat pace is called
  "flat pace" in charts, axes, tables, records and copy. Its record mark is "Flat", and its note reads
  "Flat pace: your pace allowing for hills, as if on level ground." A run's threshold keeps its name,
  "Threshold pace, estimated" on the app's cards and pages, where the page's Flat note says that pace is a flat pace. The share card has no Flat note, so its run threshold reads "Threshold flat pace, estimated". "Grade" means an age grade and nothing else.
- **Run distance records.** A run keeps its time at 1 km, 1 mi, 5 km, 10 km and a half marathon. In each
  unit, the record at that unit's own distance shows its time alone, since its pace is that time: 1 mi in
  imperial, 1 km in metric. A run added before the half marathon was recorded gets it only when it is added again: the library
  is not re-digested, and the model revision does not change.
- **Levels, not ranks.** A grade names its band: Recreational, Local, Regional, National or World,
  written the same way in sentences, labels and this document. Never call a level weak, a limiter
  or a weakness, and never give a percentile.
- **Runs are read as recorded; rides and thresholds are estimates.** A run's grade is the grade of
  one recorded best effort, so its line reads "Local · 64%" with no estimate word, and its pace is
  marked Flat and noted: "Flat pace: your pace allowing for hills, as if on level ground." A ride's grade
  is estimated through its running equivalent, so its line starts "Estimated", it shows its 90% range in
  brackets, and a range that crosses a band names both levels ("Local to Regional"). The card's caption
  says the bracketed range is the 90% range. A ride's record list names "Estimated through its running
  equivalent" once, under the list, not on each row. Thresholds are always estimated. The Method page is
  the one place that explains the estimates.
- **Every grade names its standard.** Sport pages' captions and the ladder's label say "on the USATF road
  standards", and that name links to the age grades on How sure is this?. A sport page's caption then
  ends "A level, not a ranking.", so the page says what a grade is. A Balance card leaves the standard
  to the source line under the cards, and its footer carries the ranking line. The full credit, with
  the authors, licence and a link, is on How sure is this? alone.
- **How sure is this? lists what is calculated**, in its own section before How this works, in three states
  (`apps/web/src/ui/components/methodCalculated.ts`): _Calculated by this app_ (from the files: the balance
  and levels, thresholds and their ranges, best efforts and curves, race predictions, output at the same heart
  rate, the level target, grade by duration, bests that stand out, virtual power, splits, moving time and
  climb, the time at each pace in In detail, time in zones, late in long sessions, how your reps held up,
  weekly hours by sport, runs at walking pace, dated settings and estimated zones, the equivalence across
  sports, best effort week by week, and the heart-rate set-aside), _Read from your files_ (as the
  device recorded it: the sport, start time, distance and route, heart rate, power from a meter, and the
  timelines and laps) and _Not available from activity files_ (readiness and recovery scores,
  vendor tests such as 4DP, and lab measures, which need inputs a file does not hold). Each has one plain line.
- **How sure is this? says how Grade by duration is read**, in one sentence in the age grades section: each sport's best effort at each duration is graded, the ride with its range, and a sport is higher at a duration only where the run's grade leaves the ride's range; inside it the two are level.
- **Each effort is graded at its own date**: the age on the day of the activity that set it, counted
  from the birth year alone. A ride is dated by its own best ride at that duration. Sport pages say the
  age they used ("Graded at age 40"), and the Balance source line says the age its cards use, naming
  both ("aged 38 on runs and 39 on rides") when they differ. How sure is this? says in its first limit
  that only the birth year is used. A ride's caption says the bracketed range is the
  90% range, as its last sentence.
- **Removing data asks first.** Removing every kept activity and turning off kept original files
  each open an alert dialog that names what goes and what stays, with Cancel focused. Removing one
  saved activity opens its confirmation under its row, with a **Delete** button; a summary
  kept in this browser gets a neutral card, and an original kept in the account the red one. Every
  removal's confirm button is the one destructive button, from `ConfirmActions`. The button that starts a removal on Profile is outlined in the critical colour, so
  the one filled destructive button is the confirmation's. The account's
  deletion needs the typed email address.
- **A missing year of birth or sex asks once on each page that grades,** Balance, Run and Ride. On
  Balance a muted line says the balance in points and levels needs what is missing, and a secondary
  button, "Add your sex", opens Profile. The prompt names only the missing field, as "year of birth",
  "sex" or "year of birth and sex", in its line and on its button. On Run and Ride the best efforts
  say "Age grades need your sex." with that link. The cards show no grade and no prompt in that case. Sex is never preselected; "Prefer not to say" is
  stored as no sex. The sex choices use the grades' own words, woman and man.
- **Weight is never filled in for you.** Setup's Skip keeps the valid answers typed and leaves the rest
  unanswered, and Profile
  shows it as not entered. Without it, a ride's figures wait: the ride's threshold, its W/kg and
  watts, its grade, its records and its trend are held, and the card, the cross-sport idea and the
  Ride page say "Add your weight on Profile to see ride figures." with a link to Profile. A run's
  figures still show, and the balance waits, so the share sheet is not offered, while no weight is
  entered. The Balance cards, the Ride page, the cross-sport idea and How sure is this? show no ride
  figure worked out from the placeholder weight. How sure is this? holds its energy view and its
  virtual power check, and draws only the running blocks of its heart-rate chart, with the prompt
  beneath once a ride is on file. With no ride, its energy view says it needs one to compare with
  running, and asks for no weight. With a run and no ride, or a ride and no run, the energy view names
  the sport it needs and draws no ratio, so the ratio and its chart appear only with both. The request
  for a weight is written once, in weightCopy: the linked prompt Balance and
  Method show, the plain note a dialog shows, and the purpose a Profile field hint shows. The activity page holds a ride's bests and record chips the same way, and says "Add your weight on Profile to see ride figures." in their place.
- **A body weight outside 45 to 160 kg is confirmed before it is kept.** The API accepts a wider range,
  but a kilogram figure typed into a pound field would otherwise pass as a headline. Setup asks again
  when Analyse my files is pressed once more. Profile shows the question with a "Save 34.0 kg" control
  directly after the body weight. The question and its control appear when the field is left, so a
  figure still being typed never shows one. When Tab or a click leaves the field for another control in
  the settings bar, focus moves on to the control once it renders; focus that leaves the bar stays where
  it went. Leaving the field does not save it. A change of units clears the question. Skip
  and Escape never confirm: they keep a weight only when it is within 45 to 160 kg, and drop one that was
  asked about. A pound figure is quoted as typed, "75 lb is 34.0 kg, outside 45 to 160 kg."; a kilogram
  figure reads "That is 34.0 kg, outside 45 to 160 kg.". Kilograms show one decimal, rounded out of the
  range: the nearest tenth, or one tenth further out when that would sit on the edge.
- **Setup checks a field when it is left.** A weight that cannot be read, or a year outside its range,
  shows its error beside the field, and Analyse my files moves focus to the first field in error. A birth
  year before 1920 is refused as a typing slip. A year from 1920 that puts the athlete past the graded
  ages is kept, and their efforts are not graded: they read "Age grades cover ages 5 to 100."
- **A Skip whose kept answers cannot be stored still goes on.** The dialog closes and every file held
  then is imported, including one dropped while the Skip was saving, with setup not marked done, so the
  questions come back on the next import. Nothing is saved. A second Skip while one is saving does nothing.
- **Each results page says what it is based on,** at its foot, in one line: "Based on 165 lb, man and your
  age at each effort. Change on Profile". It gives no age of its own, since each grade states the age on the day
  of its effort and today's age would seem to contradict it. It names only the parts the athlete has set, in their units, and it links
  to Profile. A ride held for its weight, whose own note already links there, leaves out the link on
  "Your details are not set yet.". It is on the Balance, Run and Ride pages only, and the sample has its
  own persona and no such line. While the one prompt for the year of birth and sex is on the page, the unset
  line is left out of Balance, and of a run's page once that run has activities, where its age note asks the
  same. A held ride keeps its line, since its records give way to the weight note.
- **A figure's scope is named by the period control under the answer it changes,** which shows the dates of a
  window. The threshold carries no count under it, since a count of runs is not what it is fitted from.
  Under All time the control shows the span of the whole library.
  Method names its dated period on its "Counted over" line, as "Counted over 12 May – 3 Aug 2025.".
- **Units follow the browser's language:** imperial for en-US, en-LR and my-MM, metric elsewhere.
  A new account takes the language of its sign-in request the same way. The Units choice comes
  first in setup and on Profile, and a unit typed after a weight ("150 lb") is read as typed.
- **Setup's two buttons share one row on a short phone,** below 420 px wide and 700 px tall, and the spacing above the fields tightens so the sex options clear the sticky footer.
- **The export may hold a null body mass,** written as null, for a weight that was never entered.

## Accessibility

Unchanged by the redesign: every chart has a table view, colour is never the only cue, controls are
at least 40 px tall (44 px on a phone or for a finger), focus is always visible, live regions stay mounted, and motion respects
`prefers-reduced-motion`. In forced colours the chart marks keep their edges in the system's colours: the
ratio bands and median, the trend and curve markers, and the heart-rate dots.

## Settings over time and training zones

Profile's **Settings over time** section dates the numbers an athlete knows: a body weight, a max heart
rate for each sport, a threshold power for rides and a threshold pace for runs. Its form is a Setting
select, a Value field in the units the athlete uses (kg or lb, bpm, W, or a pace such as 5:30 per km or
per mile), a From date that starts on today, and Add. A refusal reads under the form in the critical
colour and keeps what was typed. The entries sit in a table headed **Your dated settings**, one setting
after another and the latest date first within each, each row with its own Delete (named with the setting
and date). Deleting asks nothing, since the entry is easy to add again.

**Policy.** An activity uses the entry in effect on its local date: the latest entry that starts on or
before that date. Before the first entry the earliest entry applies. With no entry the app's own figure
applies: the profile weight, or an estimate from the activities. The same sentence is on the Method page,
under Dated settings and zones, and in `packages/core/src/athlete/measurements.ts`.

**Current weight.** With dated weights, the weight today is the dated weight in effect today, whatever the
saved profile holds, so a weight dated for a later day takes effect on that day with no edit (the page
reads the day again at local midnight). The saved profile weight follows it: adding or deleting the latest
dated weight updates it. Setting the weight in Body and bike, once weights are dated, adds a dated weight
from today. A signed-in weight, including one answered in setup while the account loaded, waits for the account's
dated settings to load. A load that fails is tried once more by itself after two seconds, and then Settings
over time says so with a **Try again** button; until it loads, a weight is not saved and the download
refuses, each saying to use Try again. If the profile weight is saved and its dated copy is refused, the status line
says what was kept. A weight dated before a later entry leaves the weight today alone. Signed out, the
list is kept in this browser (`rca.measurements.v1`); signed in, it is the account's (`/api/measurements`).
The browser's list is not merged into the account, and Profile says so in one line when it still holds some.
Download my data waits for the dated settings too, rather than leave them out.

**Where it shows.** The best ride at a duration is the one with the best power-to-weight when weights are
dated, and every ride figure at that duration comes from that ride: its watts, W/kg, running equivalent,
age-grade date, record, threshold fit and heart-rate check. A ride's W/kg uses the weight on its day: in the
records, the best-effort curve table and tooltips, and the weekly trend, whose watts follow the ride that set
each week. The activity list carries the weight in effect for each activity (`ActivitySummary.massKg`) only
when weights are dated. The level targets are for today: a ride's watts are compared at today's weight.

**Training zones.** One table for each sport and measure, side by side from two columns of 22 rem and
stacked below that: run heart rate and pace, ride heart rate and power. The caption names the zone set and
where its reference came from, such as "Ride power zones. From your rides: threshold power 250 W." or "You
entered: max heart rate 188 bpm". Each table is a `ChartTable` of Zone, Name and Range, with the published
scheme in a muted line under it. Ranges are whole numbers that do not repeat a shared edge ("Under 138 W", "138–187 W", "375 W or more"); a run's range reads as a pace, the fast edge first, and a pace belongs to the zone it is slower than the next one's edge. A heart-rate estimate that rests on both sports says "From your runs and rides". Without a weight, estimated ride power zones are not shown and the section asks for one. While the sample is loaded, only the visitor's entered settings make zones. Without a reference
the section says zones appear once there are files or an entered setting. The schemes are in
[research/zones.md](research/zones.md). `zonesAt` in `packages/core/src/zones` is the one place they are
built, and `AnalysisSession.zonesAt(date, settings)` answers from the worker's analysis.

## Time in zones

How the time was spread across the training zones above, in one activity's selected interval and over a
sport's period. The maths is `packages/core/src/zones` (`timeInZones.ts`, `traceZones.ts`, `periodTime.ts`,
`zoneShares.ts`); the research notes are in [research/zones.md](research/zones.md#5-time-in-zones).

**Activity page, In detail: the plots.** A plot's axis holds the readings the run held, not the artifacts at its ends. A
pace (or a ride's speed) spans its 2nd to 99.5th percentile of moving readings, the slow end cut harder since a start, a stop or a dropout is slow and a stride or a descent is real (`readingBand` in
`packages/core/src/workbench/band.ts`), and so does its histogram, so a standing start or a stop leaves neither a crushed
axis nor empty bins. A cut removes nothing from a selection too short for it (under fifty readings at the slow end, two hundred at the fast end), and a band a cut would collapse to a single value is left whole.
What lies past each end is a dot on the plot's edge, a line under the plot ("Past the axis, marked at its edge: 24 s slower
than 6:39 /km, 28 s faster than 4:25 /km.") and a row at each end of the histogram's table, so the table still adds up to
the moving time; the interval summary keeps the true extremes. The summary's extremes read Fastest and Slowest for a pace
and Lowest and Highest otherwise, so a pace is a table of its own, which says it leaves out stops; beside the elapsed time and
distance it gives the average pace, or speed, as the header does: distance over moving time. The interval's two sliders are
the native range input with a track and thumb drawn from the tokens, a control tall, and in forced colours from system colours.

**Activity page, In detail.** Under the interval summary, a **Time in zones** block follows the interval the
athlete selects: one stacked bar for each of power (rides with a power meter), pace (runs) and heart rate that the interval
has readings for, a lede for the first of them in that order ("Most of this run was in pace zone 2 (64%).", or
"This run spent the most time in heart rate zone 3 (38%)." when no zone held half, or "All of this run was in pace zone 2 (100%)." when one holds it all), and **View as table** with
each zone's name, range, time and share. The zones are those in effect on the activity's day (`zonesAt`), so an
entered setting that changed since is not applied backwards. Each recorded moving second counts once, in the zone
of its reading, and a run's slow seconds count in the lowest pace zone, as in the digests behind the sport page, so a
whole-activity interval matches it. A reading the quality assessment left out (a flagged heart-rate spike and its margin) is left out of both, and pace is cut from the speed the digest reads (lowered where the file's speed and distance disagree). A recording kept before this carries no such masks until it is captured again, so its zones read every recorded second. A ride's estimated power zones wait for the body weight, as on Profile, and a heart rate the
analysis of the whole library set aside is not read, and the block says so ("Heart rate is set aside for this activity, so it
is left out of zones.") instead of asking for zones. With no zones the block says what they need and links to Profile.

**Sport pages.** A **Time in zones** section, last in each sport's list (`SPORT_SECTIONS`): a stacked horizontal bar for
each measure with enough time (3 activities and an hour, `MIN_ZONE_ACTIVITIES` and `MIN_ZONE_SECONDS`), under one
lede. The lede reads the measure with the most time. When a zone's share moved by at least 5 points against the
period before, it says so ("Heart rate zone 2 took 41% of your running time with heart rate, up from 28% in the previous 6 weeks."),
and otherwise it gives the easy and hard shares ("60% of your running time with heart rate was easy (zones 1 and 2),
and 10% was hard (zones 4 and up)."). The shares are of the time with a reading, so the sentence says "with heart rate",
"with measured power" or "with a pace reading". Easy is zones 1 and 2 and hard is zone 4 and up for every measure
(`EASY_THROUGH`, `HARD_FROM`). The period before is cut by the same estimated zones as the period on screen, so the two are
compared in the same zones. An entered setting that changed between the periods means the zones differ (an estimate is the same in both, and a
dated weight moving an estimated ride threshold does not stop the comparison), as would one period using an estimate for
some activities and the other not (a guard for a future back-fill policy; today the earliest entry applies before its own date, so a
sport's measure is all entered or all estimated); then no change is claimed: the lede falls back to easy and hard, the previous column is left
out (it is also left out when the period before has no label), and a line says "Heart rate zones changed since the previous period, so the two are not compared." View as table
adds a column with the previous period's share of each zone, headed by its label, where the periods can be compared.
Under the bars, a muted line for each measure that left activities out ("2 of 12 runs had no heart rate to count.": no
distribution in an older digest, no heart rate, no power meter; "had heart rate set aside": the analysis of the whole library
judged the sensor; or "had no heart rate zones for their date": data but no reference), and one line on where the zones came from.
Whose heart rate is set aside is a judgement of the data, not of a period: the session makes it once over every visible
activity, with the bike model fitted over all of them (`judgeHeartRate`, cached per library and masses by
`HeartRateJudge`), exposes it as `SessionState.heartRateJudgement` (the sorted ids, and the reference heart rate and
threshold of each sport it was judged against), and every reader takes that one list: each period's analysis (`combine`'s `heartRateSetAside` option, which lists
only its own activities), the same-heart-rate and late-effort sections, the zones, the left-out notes and the activity page.
The judgement also carries the library's heart-rate calibration of ride against run efficiency (`calibration`: the
slope ratio and its error), which every period's running equivalents and comparison read (`combine`'s `calibration`
option), so one ride is worth the same run pace whichever period is shown; a period's own `hr` stays its own evidence.
The grade chart's extra durations and the level target use it too, so the ride's grade and the "Ride X W" target
share one conversion. Because it is the library's, adding files can shift older equivalents (the calibration
refits over everything), where a period's own check moved only with that period. A ride without a power meter is
the exception to period independence: its watts come from a bike model fitted over the period's own
power-meter rides, so those watts, and the pace they are worth, can still differ by period.
Changing the period does not judge again. The reference it was judged against is the library's, which can differ from a
period's own figure, so the notes on a set-aside heart rate cite it ("under 70% of your reference heart rate across all your
activities (200 bpm running)", on How sure is this? and on the activity), and cannot seem to contradict the period's. With too
little to describe, the section has no heading and "Time in zones: needs 3 activities with heart rate, or a threshold
pace entered on Profile, and 1 hour of them." joins the "Not enough yet" list.

**Bars.** `ZoneTimeChart` is a `ChartFrame` with one band for each measure: its label, the bar across the full
width, and a zone number under each segment at least 20 px wide. A segment is the sport's colour (`--sport-colour`) mixed
with the page colour in equal steps from 80% (`MIN_ZONE_TINT`, the least that keeps 3:1 against the card in both schemes and for
both sports, pinned by `zoneTint.test.ts`) for the lowest zone to 100% for the highest, edged in the page colour; the order, the
numbers and the table say which zone is which, so the tint is not the only cue. In forced colours every segment is the
highlight colour. The figure is named by every bar read as text ("Heart rate: zone 1 12%, zone 2 64%").

**Period maths.** Each activity's digest distribution (seconds per 1 bpm, 5 W or 0.05 m/s bin) is cut by that
activity's own zones, so a period can hold activities with different zones (a threshold entered during it, or a
body weight that changed an estimated ride threshold). A heart rate or a power is a whole number, so
the reference is rounded to the number Profile shows (`zonesAt`: 187.6 bpm is 188 bpm) and its zones are cut on whole-number edges (`zonesFor`: the first whole number at or above the cut, so 0.6 of 219 bpm is 131.4 and
the zone above starts at 132), and a bin of it is shared by its whole numbers: 110 to 114 W with an edge at 111 W has one watt
below it, a fifth of its seconds, and a bin of one beat is never split. A reading is in the zone it is at or above the floor of
and below the ceiling of, as on the activity page, and the Profile ranges are written from the same edges, so they agree. A speed bin that straddles an edge is shared in proportion to the width each side. The session keeps the period's and the previous period's result (`ZoneTimeCache`) until a
digest, a dated setting, the masses or the analysis changes, and 2,000 activities take about 12 ms
(`periodTime.perf.test.ts`).
