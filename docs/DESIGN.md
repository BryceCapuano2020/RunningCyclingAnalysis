# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | The answer and meter, a card per sport with its grade, evidence and cross-sport cards, one fitness trend for both sports on one scale, share sheet                                                                                                                                                                                                                                                                                                                                                                                                    |
| `#/run`, `#/ride`  | Run, Ride         | Threshold with its level ladder and the age grade of its best 20 min, the best 20 min's heart-rate share, a line of recent form, records in native units with the age grade of each, the distance a run's grade is taken at, how long ago each was set and the change on the period before (runs also at 1 km, 1 mi, 5 km, 10 km and a half marathon), a link to the sport's activities, a weekly trend for 5, 20 or 60 minutes, the best-effort curve in pace or watts with the previous period dashed                                               |
| `#/activities`     | Activities        | Every activity in the library, with its own sport and period filters, a sort (newest, oldest, distance, time or climb), month headings in date order and a count of the activities shown; a row opens its activity page, and a kept activity can be deleted from its row                                                                                                                                                                                                                                                                              |
| `#/activities/:id` | Activity          | Moving time and the figures beside it, route shape, splits (runs), all-time records across the library, best efforts set here, skipped readings, the activities either side, and Delete                                                                                                                                                                                                                                                                                                                                                               |
| `#/method`         | How sure is this? | Three-line answer, an on-page contents list, the energy view (a cross-check of the age-grade gap), age grades and levels, heart-rate check with the 20 minute effort under it, virtual-power accuracy and how this works                                                                                                                                                                                                                                                                                                                              |
| `#/profile`        | Profile           | About you (year of birth, sex), body and bike (units, then weights; the two side by side from 900 px), one save status line under them, which offers See your levels after a save once year of birth and sex are known and a result is on screen, and not while a save is pending or one was refused, account (email, download, delete), the export guides, original files (signed in), the saved library (signed in) or the activities kept in this browser (signed out), then Remove activities, which says Clear the analysis when nothing is kept |

Without a result every route except Profile and How sure is this? shows the landing page. How sure is this? shows its method, its age grades and its topics, with one plain line under the energy view, where the charts would be. On a reload of a visit that kept
results, every page except Profile and How sure is this? shows a restoring state in its place, with an
**Add files** button, until the library has replied. A returning visitor is not asked to add their files again and is never left without a control. The
header holds the wordmark, the four tabs (once there is a result, and while results restore), one
**Add files** button (not on the landing page, whose drop zone has its own, nor while they restore, except on Profile and How sure is this?), a **Profile** link (a person glyph with its word at every width, outlined as an account) and the
account control. The guides are not in the header: they are reached from Profile, the landing and an empty Run or Ride page. While the account is still loading, the account control reads "Checking sign-in…",
and "Sign-in is unavailable right now" when accounts cannot be reached. Both hold the sign-in
button's width, so the header does not move. The busy strip is fixed to the bottom of the window and
appears only once a run has lasted about 400 ms, so a quick change never moves the page. The reason
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
weeks, 12 weeks (the default), 12 months or All time, in that order, on one row at 390 px and in a 2
by 2 grid below 360 px. The control's dates sit beneath it, with the count of activities in the
period when some are left out, and a note under them when there is one. The Activities page has its
own period, sport and sort, which start with the whole library. Its view is kept in the address (for
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
then new bests at 1, 5, 20 and 60 minutes and at each run distance (1 km, 1 mi, 5 km, 10 km and a half marathon), counted only for workouts that were not on file before. A
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
  width, such as "Run 64%", since the title names the effort and window. On a sport trend the latest label
  is its value alone, such as "5:12 /km", beside its point: below it, above it where the line would run
  under it, or to its right where both of those would cross the line. At every width, a trend's run label keeps clear of the ride band, and 4 px where it can of the run's own
  line and markers, after the band. The band is drawn only where both of
  its weeks have a range, with a step at each week's x. The label's box stays inside the plot both
  ways and 2 px from the band. Its box sits on the left of its point unless that would cross the
  plot's left edge, when it sits on the right. Its spots are the baseline beside its point that the
  line's arrival prefers, the other baseline beside it, and the baselines just above or just below
  each edge of the band beneath it, each kept inside the plot. The two end labels are placed
  together. Of the combinations that keep both boxes inside the plot and off the band, the one with
  the fewest labels within 2 px of the band wins, then the one nearest their preferred places. A box
  that would cross the plot's edge moves along it to sit inside, which can bring it over its point.
  Where no combination keeps the run label off the band, the labels keep their preferred places,
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
- A sport page reads top to bottom: the threshold, with its likely range under the figure, the line on uneven bests when there are any, and a line on the best 20 minutes by heart rate
  under its meaning, on either sport when the library holds a 20 min best in both sports, then its grade and level ladder for the best 20 minutes
  (the same grade line as the card), then the period control, a line of recent form ("Last run 14 Jan · 9 runs · 42.10
  km"), the best efforts, with the Flat note under them on a run and **See your runs** under them, which
  opens Activities filtered to that sport, the week-by-week trend under the heading "Week by week", then the curve, headed "Pace curve"
  for running and "Power curve" for cycling. The threshold carries no count: the period control under
  the answer names the dates the efforts come from. A sport the library has no activities for has no
  period control and no curve, and asks for files: one section holds that prompt, with **Add runs** and
  **How to get your files** side by side.
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
- **The default period** is the 84 calendar days (`DEFAULT_PERIOD_WEEKS` of 7) ending on the newest
  activity's day, when they hold a run and a ride. A day is counted in the device's local zone and
  runs from its first millisecond to its last, so an activity at 06:00 and one at 12:00 on the same
  day give the same window, and an older window never hides recent activities. It is clipped to the
  first activity's day, so a library shorter than 12 weeks is dated from its start. When those 12
  weeks do not hold both sports, as with a 2015 run and a 2019 ride, the default is All time, and
  the control says why: "Your last 12 weeks don't hold both sports, so this shows all time." It says
  so only when the library holds both sports. The period is computed in
  `packages/core/src/period.ts`. Each fixed period is the same number of calendar days ending on the
  newest activity's day.
- A period's comparison is the same length before it, drawn as a thin dashed mid-grey line and named
  "Previous 6 weeks", "Previous 12 weeks" or "Previous 12 months". All time has none. The Balance trends
  have no period comparison: each already spans the selected period.
- A trend is the best effort of the chosen length (5, 20 or 60 minutes; Balance uses 20) in a
  trailing window that ends each week. The window is a third of the period, at most six weeks, so a
  six-week period uses two-week windows. Every point's window lies inside the period. The title
  names the effort as its segment labels it, such as "best 60 min", and the window. Each line steps from one Sunday to the next and breaks at a week
  with no value, and each Sunday has a marker. The latest value is labelled with its value alone, and the
  title names its effort and window, so it can differ from a card's best, which covers the whole period.
  When a sport's line stops before the window does, the note under the chart dates that sport's latest
  activity of any length, as long as it is before the last week: "No runs since 20 Jan 2025." (or "No rides
  since"), the activity's own local day. A short run counts, though it gives the trend no value. The note is
  left off while the line reaches the last week, and when the latest activity is in the last week.
- On the Balance age-grade trend, a run is solid with a dot, as recorded. A ride is an estimate: it
  is graded through its running equivalent, as the cards grade it, so it is dashed with a ring at
  each week, its model range is a band (a soft tint in the ride colour, with a ride-coloured outline), and the
  key says "estimated". Each grade is taken at the age
  on the day of its best effort. Without a weight, the Balance trend holds cycling: there is no ride
  line, ring, band, key or table column, and the chart says so. When only a ride has a value, the chart's
  empty message says that rides are held until a weight is added. On an energy trend and on the sport
  pages, cycling is drawn as measured: a solid line with dots.
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
  3 and 20 min". No threshold: the efforts are flat, the work capacity is below the least a rider or a
  runner has (3 kJ of cycling W′, or 15 m of running D′, which is 58.5 J per kg), or the threshold is
  not below the lowest of the efforts it was fitted to, since a threshold cannot be faster than an effort
  held; the place reads "Needs a harder effort between 3 and 20 min". The floors are far below the
  published work capacities, so they refuse only fits close to flat. A fit just above a floor is kept,
  and its threshold then sits close to the best 20 minutes, which is honest: about what was held. The
  ride's floor is the same at every body mass. The share card labels its threshold "Threshold flat pace, estimated from your best 3 to 20 min" for a run, and "Threshold power, estimated from your best 3 to 20 min" for a ride, printed in capitals, and every column reserves the rows of the tallest label, so the two figures line up even where one label wraps to a single line. Both labels share one size, which steps down from 30 px to 26 px only where a label would run past two lines in the square's narrow column. The line "About ... estimated from your best 3 to 20 min efforts" sits under
  a number only, and is left out with none.
- **A threshold has its likely range under it, in small text.** It reads "Likely 22:58 to 23:49 /km" for a
  run and "Likely 48 to 49 W" for a ride. The method is the standard error of the critical-power fit: one
  standard error either side of the critical power, a rough spread of the fit rather than a confidence
  interval. A range is left out when its low end is not above resting metabolic rate, which
  would be no estimate of a threshold; when a ride's fit draws on an effort whose watts are estimated from
  virtual power, since that range would be an estimate of an estimate; and for a refused threshold.
- **An uneven best sets only a floor, so the range runs up to a second threshold.** A best of 10 minutes
  or more is uneven when a shorter best from the same ride, at least 40% as long, lies inside its window
  and the rest of that window averages under 85% of the shorter best: a 15 or 20 minute effort held
  while the easier riding round it was all the rider could hold at the start. The threshold is then
  fitted without those bests, and it is the top of the range, from the main threshold to that one
  ("Likely 261 to 296 W"). Such a fit is kept only above the main one. Under the range, one muted
  line says why: "Your best 15 min and 20 min each held a shorter hard effort with easier riding around
  it, so they only set a floor. A steady all-out 20 min would narrow this." A run says "running". When
  the uneven fit draws on estimated watts, the line adds "The top end uses estimated watts." The range
  replaces the standard-error range for that sport. When the main threshold is refused, the range starts
  from the floor instead, the lowest of those bests, and the figure shown in place of the refusal is that
  floor, with the same line under it: a demonstrated effort the threshold sits above, not a threshold.
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
- **An activity page reads top to bottom:** the name, the sport, the day and start time (with an
  **Indoor** chip for a trainer ride), the route when it was kept, then the moving time as the hero, with
  the elapsed time under it when the file kept both. Distance, average pace or speed over the moving time,
  climb, average heart rate with the highest, and average power follow. An indoor ride reports no speed
  anywhere, since a trainer's speed is virtual rather than measured on a road. A ride without a power meter says so in a line beneath
  the figures: "Power here is estimated from speed and climbs. No power meter recorded it." Earlier and
  Later name the activities either side in the library, then a link to the sport's records. Then the all-time records as chips, each linking to its sport's page (underlined on hover, not at rest), the splits, the best efforts set here, the skipped
  readings, and Delete. A ride with no power curve says why in a line: an estimate is made only on
  climbs, and a ride with no power data has none. A ride's bests and chips wait for the weight. An
  activity from before moving time was kept shows its elapsed time, and says so.
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
- **On a phone, the two grades sit under the meter**, in the meter's own group so they keep its gap, in one line, "Run 64% Local / Ride 58% Recreational", with each sport's grade kept whole. The cards say the same, so the line is hidden from assistive technology, and it is hidden at wider widths, where the cards sit side by side.
- Phone first: every page is designed at 390 px, with a 16 px gutter and no sideways page scroll.
- **Tables that cannot fit become lists, without a scroll.** From 480 px a `<table>` with a caption
  and scoped headers. Below 480 px an `<ol>` with one `<dl>` per row, holding the same values. Both
  are in the page, and a media query shows exactly one at each width, so the accessibility tree
  holds one representation. Never set `display: block` on a table element, which drops its table
  semantics. A split's columns earn their place: Elevation gain shows only when some split climbs, and Flat
  pace only when some split has one that differs from its Pace, so a run with no altitude or no flat pace shows neither column. A partial last split, shorter than one unit, reads to
  two decimals, such as "0.97 mi", rounded down so it never reads as a whole unit. Below 480 px a split
  leads with its split and pace, then its other figures, which wrap as the width needs: two or three lines. The splits table on the activity page is the first use, and the efforts table on a Balance card
  is the second, whose list shows below 480 px with its labels once above the rows. The saved library on Profile is a third, switched in code rather than CSS: a table, which drops its sport column at 560 px and below, so the sport sits under the name, and at 420 px and below a list of blocks, each with a full-width Delete. Record any new one here.
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
  estimate is named and the range is given: "On the age-grade best estimate, running grades 4 points
  higher, but the range (−2 to +10 points) includes zero, so the two are in balance." When the best
  estimate is level: "On the age-grade best estimate, running and cycling grade the same, and the range
  (−2 to +2 points) includes zero, so the two are in balance." Never "ahead of". Without an age and
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
- **Grades read as whole percents, floored.** `formatGrade` in `apps/web/src/ui/gradeFormat.ts` writes
  every grade on the cards, the ladder and the balance gap, so 64.5% reads as 64%, and a grade never
  reads above its level band: 89.6% is 89%. The gap is the difference of these whole percents.
- **One vocabulary for the sports: Run and Ride.** Every title, label, legend, axis name, card heading,
  tab and table heading says Run or Ride, as "Run compared with Ride by duration", "Higher Ride energy rate",
  "Run against Ride, 90% range" and "Run, as recorded". Running and cycling stay in sentences, where they
  read naturally, such as "Running grades 6 points higher than cycling". A chart's accessible name is its
  title, so the two match. Chart descriptions and the reading cells of the ratio table are sentences, so they keep "running" and "cycling", as in "Running 8% higher than cycling"; so do the balance sentences. The Method energy curve names its energy rate once, as "energy rate (metabolic W/kg)", in its title and its
  table caption, with "Energy rate (metabolic W/kg)" on its axis. The shared energy trend and the heart-rate chart name their unit the same way, in their axes and column headings.
- **Effort checks say "your hardest".** A best effort below 90% of your reference heart rate is "probably not
  your hardest", never "all-out" or "heart-rate reference". How sure is this? defines the reference heart rate
  in one sentence, where it explains the heart-rate check. Each line that names it glosses it once, as "(set from your highest
  heart rates on file)", which holds for both sports: cycling's is derived from running's, so a ride is never
  called your highest heart rate. A sport page's line says "so it was hard" at 90% or more,
  judged on the percent it shows, so a share that rounds to 90% is hard.
- **Heart rate that cannot be right is set aside.** When a ride with a power meter, or an outdoor run, holds
  a best effort of 10 min or more at or above the sport's threshold and its heart rate stays under 70% of
  the reference heart rate, or was flagged as too low for the power through it, the sensor was wrong. That
  activity's heart rate is left out of the heart-rate check, the effort checks and the reference heart
  rates (`packages/core/src/hr/setAside.ts`). A too-low flag counts only where it covers that effort. The
  worst is set aside first and the references are retaken before the next is judged, so one activity's
  spike never sets aside a sound one. Its watts and pace still count. How sure is this? says how
  many runs and rides were set aside, and the activity's data notes say why. Estimated watts and treadmill
  pace are never the judge, since they can be what is wrong.
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
  "Readings skipped once" or "Readings skipped N times"; the page gives each kind's count in its own line
  and says no total. An altitude jump is a note, not a skipped reading: the climb and the slope-based figures near it
  are left out of the figures. A missing altitude is one note for the whole activity, so it has no count. Without any
  skipped reading the section reads "Data notes"; with one it reads "Skipped readings". The words are
  `flagKindSentence` and `flagSpanText` on the page, and the row's count is `skippedReadingsText`, all in
  `apps/web/src/ui/analysis/flagCopy.ts`. The activity page uses them, so the core's English is never
  shown. The words say what happened, never "impossible". An activity whose heart rate the analysis set
  aside gets one more note, last, even with no flags: `SET_ASIDE_ACTIVITY_TEXT` in
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
- **Each results page says what it is based on,** at its foot, in one line: "Based on 165 lb, age 37,
  man. Change on Profile". It names only the parts the athlete has set, in their units, and it links
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
