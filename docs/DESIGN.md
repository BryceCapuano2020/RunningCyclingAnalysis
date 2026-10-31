# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | Your fitness first (each sport's status at the same heart rate, run then ride, as a card above the balance), then the answer as one line (a headline, one plain sentence and the meter, with the gap and its range written at the dot), each sport's level as one line under it, the period control, what changed since the previous period, three tiles at most (each sport's threshold, the ride on foot), evidence, the grade by duration at the page's width, weekly training hours by sport, share sheet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `#/run`, `#/ride`  | Run, Ride         | The sport's fitness card first (its own status at the same heart rate; the ride's is in watts), threshold with its level ladder and the age grade of its best 20 min, the best 20 min's heart-rate share, a line of recent form, records in native units with the age grade of each, the distance a run's grade is taken at, how long ago each was set and the change on the period before (runs also at 1 km, 1 mi, 5 km, 10 km and a half marathon), a link to the sport's activities, a hero row (threshold with its fit spread, effort chip and period; the level of the best 20 min on the level bands), the annotated best-effort curve in pace or watts (previous period a solid mid-grey line) with record tiles under it, race predictions as range bars (runs) beside time in zones, the best efforts of 5, 20 or 60 minutes as dated dots, then closed sections that each state their finding (output at the same heart rate, late in long sessions, where the bests stand out, all best efforts), and one "Not enough yet" list for any section with nothing to show |
| `#/activities`     | Activities        | Every activity in the library, with its own sport and period filters, a volume strip over the period and sport (hours by week, or by month beyond 26 weeks, stacked by sport, with the period's counts and hours as its heading), a sort (newest, oldest, distance, time or climb), month headings in date order with that month's counts, distance and hours, and a count of the activities shown; a row opens its activity page, and a kept activity can be deleted from its row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `#/activities/:id` | Activity          | Moving time and the figures as tiles beside the route shape (the route and figures stand in a column beside the timeline from 1100 px), In detail (one aligned timeline of the measures with a crosshair, laps, intervals and how your reps held up, and time in zones), a Walking pace chip for a run at walking pace, splits (runs), all-time records across the library, best efforts set here, skipped readings, the activities either side, and Delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `#/method`         | How sure is this? | Three-line answer, an on-page contents list, the energy view (a cross-check of the age-grade gap), age grades and levels, heart-rate check with the 20 minute effort under it, virtual-power accuracy, what is calculated and how this works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `#/profile`        | Profile           | About you (year of birth, sex), body and bike (units, then weights; the two side by side from 900 px), one save status line under them, which offers See your levels after a save once year of birth and sex are known and a result is on screen, and not while a save is pending or one was refused, Settings over time (dated weight, max heart rate and thresholds: a form and a table of entries, latest date first within each setting), Training zones (a table for each sport and measure, with where its reference came from), account (email, download, delete), the export guides, original files (signed in), the saved library (signed in) or the activities kept in this browser (signed out), each a count by sport and the months it spans with a link to Activities, where an activity is opened and deleted, then Remove activities, which says Clear the analysis when nothing is kept                                                                                                                                                                         |

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
one tap away on a phone as the Google mark and the visible words **Sign in**, 44 px tall, named **Sign in with Google**
for screen readers (the tail "with Google" is visually hidden, so the name is the same at every width). Below 420 px **Add files** shows its plus only; its name is kept for screen readers and
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
above end on that day. The note says why the default is all time too, when it is, and an empty note
takes no line. A stored pick the control no longer offers, such
as the 3 months of an earlier version, reads as the default.

**The sample athlete** is a 37-year-old man at 75 kg. It is analysed with that body and bike mass and that age and sex, whatever the visitor has entered, and it is never kept. Its season is drawn relative to the day it is loaded (`sampleSeason` in `packages/core/src/synthetic`): a full training week for the last 12 weeks (the full ride week for the last 9: a runner who took up riding this autumn), a lighter one before that, and one session a week back past a year, so 12 weeks, 12 months and All time each show something different. It is drawn from the generator's `measured` sensor and behaviour model (a wrist watch's heart rate and GPS, hard efforts that vary, an easy week that wanders) and holds what a real library holds: two treadmill runs, a run with no heart rate, a stretch the watch did not record, a 5K that is 5.0 km, a watch's own session names with a title now and then, and hard efforts (tests, tempo, intervals, a race, a time trial) that reach the top of the heart-rate range in both sports, so the effort gate passes. Its one honest "not enough" state is the ride's fitness card, which has too few steady rides from before the last 8 weeks. The seed is the first of `SAMPLE_SEEDS`, the draws on which that whole story holds. The season ends on the most recent Sunday on or before yesterday and every draw is keyed to the days before that Sunday, so the plan and every figure from it are the same on every day of a week and in every week, and only the dates move; the newest activity is up to a week old. (The grades count age from the birth year against each effort's calendar year, so across New Year the figures differ by up to a week's worth of efforts' ages; a test notes it.) Start times vary through the day (weekday mornings, lunchtimes and evenings, weekend long sessions), in the visitor's own zone, and the ride threshold, bike efficiency and running economy rise through the season, so the trend, volume, same-heart-rate, durability, drift and stand-out sections all have something to show. It is deterministic for a clock and a seed: tests use the fixed reference clock (`SAMPLE_CLOCK`) and the small fixed `sampleDataset` fixture, and the app passes the device's clock. The birth year follows the year of the newest effort, so he is 37 on it. While it is loaded, a banner above every page says so once. Its rides carry their running equivalents, so the grade by duration shows them for a visitor with no age or sex. The landing example is drawn from the same sample, labelled illustrative: the answer's headline over Balance's own meter and levels line (`BalanceMeter`, `BalanceLevels`), made from the sample's figures with the same components, so it cannot drift from the screen it stands for. A test pins its numbers to the sample's own analysis.

The landing page asks "Are you a better runner or a better cyclist?" and answers in one sentence that
ends on the privacy promise ("nothing leaves your device", or, signed in, "your files are analysed on your device"). The example result is the hero visual and the drop zone sits beside it from 900 px; below that they stack,
the example first. On a touch screen (`(pointer: coarse), (hover: none)`) the sample leads: **See a sample athlete** is the first
button and the primary one, **Add files** follows as a secondary action, and nothing says to drag. On a pointer **Add files** is the one
primary action, then **See a sample athlete**. Below them come three steps, three sentences on how the result is worked
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
The notice region is the top of the main area, so its notices are inside the main landmark. It holds one
summary per import, then one live region that is always mounted and announces each notice as it is added to it
(sync, library, sample and neutral stops), then the alerts, each its own region since an alert announces when it
mounts. A notice renders only while it has text, so there are no empty live regions to count. The library
notices (not kept, missing originals, updates, newer app) are one line with a Details disclosure. The
notes that need no action (the runs left out at walking pace, copies not counted twice) sit under one
**About your data** disclosure, and a note a visitor has seen on an earlier visit is not shown again until its
text changes. The sample banner shows in full on the first page the sample is seen on, then is a small
Sample athlete pill that opens the sentence again. Where the library is kept is the footer's to say once. After an import, a dismissible summary says what it added, or "Nothing new"
when every activity was already in the library, and links to Balance, except on Balance itself. An
import made on Profile or Method moves to Balance, where its result is. Under that sentence it lists
what the import moved in the athlete's numbers: at most four items, thresholds first, then the balance,
then new bests at 1, 5, 20 and 60 minutes and at each run distance (1 km, 1 mi, 5 km, 10 km and a half marathon), counted only for workouts that were not on file before. An import that added exactly one run or ride
leads with the balance instead. The balance line is listed whenever both results have one and a weight is
entered (a ride's figures wait for the weight, as the balance does), and it states what changed in the
figures the Balance page shows: the lean, the centre and the range. A changed centre reads "Your balance
now leans less toward running (7 → 6 points)", or "(12% → 8%)" for energy, where an edge under 1% reads
"0.4%", never 0%. A changed range reads "Your balance's range was −5 to +16 points and is now −4 to +16 points", in the
page's own "A to B" wording, and a changed even centre names the sport it favours: "Your balance's best estimate moved from 2 points toward
cycling to 1 point toward running"; both read together when they change together ("..., and the range was ... and is now ..."). Only when every figure is the same does it say "Your balance did not
move.", adding ": this ride set no new best at 20 min" only when the activity set none there. An activity
outside the period on screen reads "This ride is outside the period on screen, so the balance there is
unchanged." A line that says a figure changed counts as a move; a line that says the balance held is listed
without that, so the announcement does not say the numbers moved for it. The summary names the day of that
one activity, such as "Added 1 ride, on 20 Oct.", not its month. Then the sport's 20 min age grade, when its
whole percent changed, such as "Ride 20 min grade: 54% → 57%", then the thresholds and bests, still at most
four in all. An import of more than one file reads the balance's figures the same way, with no held line. A
first import, or one that replaced the sample, lists nothing, and nor does an import that added no run
or ride. What happened to the import's files is one neutral headline that adds up to all of them, such as "3,018 files, 2,698 of them activity files: 1,947 added, 2 need a look, 749 other sports left out on purpose, 320 not listed as activities." The activity files are the count the import's progress line shows. It counts files, not activities: a file of two sessions is one file, and "Added 1,801 runs and 146 rides" above it still counts the activities. A file is added only if one of its activities is in the library afterwards and shown, so "Nothing new" and no file added always agree. A file whose workouts were already held is already added, whether it is a copy, the same file added again, a richer copy that replaces a held one (a richer copy that replaces a held one is already added), or a new activity hidden as a copy of a held workout. A held activity whose save failed is not yet in the library for good, so a later import adds it only if that import saves it: a retry that fails again, or that a halting save keeps from being sent, leaves it already added. The parts run added, already added, need a look, other sports, not listed, and a part with no files is left out, so a re-import reads "1,205 files: 1,204 already added, 1 needs a look." The word is "added", not "saved": saving to the account, and what waits to be saved, is the sync status's to say. The summary is one line, "2 files need a look" (or what was left out, when nothing needs a look), that opens the headline and the groups, in this order. The disclosure holds nothing while it is shut, so copying the page does not paste a column of empty bullets, and the same is true of **Show the files**. A line on where detailed readings stop ("Detail kept for the newest 572", with the sentence and its month under Details) follows the summary sentence when the readings kept are the newest of more activities. Each group's title is a level-two heading, set in bold, heavier than the text round it, since the import notice sits above the page's main heading, which follows it. The line for the files the export does not list has no group under it, so it is plain text in the same bold, heavier than the text round it, not a heading. **Need a look** holds the real problems as one line per file: a file with no recorded points, one that does not say its sport, one too short or damaged, a format the app does not read. Every file is listed once, in the group, whether it is the first or the last. When nothing but unlisted files was left out, the headline is text with nothing to open. Each piece of advice is said once, in the first line that gives it: "Export it again." for a damaged file, "Export a shorter range." for one too large, "Check the recording on your device." for one too short, too sparse or with a date it cannot use, and "Check the recording on your device, or export a shorter range." for one too long or with too much data. An empty file gets none, since "It holds no recorded points, so there is nothing to read." is all there is to say, and export advice belongs to a damaged file. **Other sports, left out on purpose** is one line per sport with its count ("Training session: 412"), where a FIT name and a Strava type for one sport are one line. A Strava type the app has no word for is shown as Strava writes it ("Kayaking: 3"); a name only the file gives, such as an unmapped FIT sport or a number, reads "Another sport". The files sit behind a nested **Show the files**. **Already added** lists the files whose workouts the library already holds, with its one note: a copy, "Same workout as run.fit, so it was not counted twice.", or the same file again, "Already in your library, so it was not counted twice." **Not listed as activities, such as saved routes** is one line with its count and no action: they are the files in an export that its own list of activities does not name, and they are not read. When those are all that was left out, the headline stands alone as text, with nothing to open. The disclosure ends with **How to get your files**, which opens the guides.
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

## Colour and type

The visual system (the colour roles and the full colour table, the type and display scales, the shell width, gaps, radius and shadow,
the panel and band surfaces, and the accessibility checks) is [design/system.md](design/system.md). `tokens.css` holds the values
and the tests named at the foot of that page keep the two in step. A display size with no type token is one of the sizes
`typeScale.test.ts` counts and lets only fall. The level bands table stays here, under Level bands.

## Components, charts and pages

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
- Charts share one set of defaults: a visible but recessive grid (`--grid`, about 1.5:1 on the card in both schemes), 3 px lines
  with round caps and joins, an optional wash of the sport's colour at 12% under a line, markers that are a fill ringed in the
  card colour, bars with rounded data ends and 2 px gaps, and axis text of 12 px or more in `--text-muted` (4.5:1 on the card).
  A chart also has an emphasised point: the latest value
  of a series, or the 20-minute effort of a best-effort curve. On a best-effort curve the 20-minute effort is called out
  with its value, such as "250 W". End labels are annotations of the annotation primitive (below): in the gutter right of
  the plot, or beside the line's own end where it stops early, moved off one another and off the lines and markers,
  which the layout takes as its obstacles. An end label may carry a `glyph`, which leads its text in its tone's colour.
  A best-effort curve marks the 1, 5, 20 and
  60 minute efforts, the same ones its records list names, and calls out the 5, 20 and 60 minute bests with an eyebrow
  ("5 min"), the value at display size and a caption (a ride's W/kg, a run's "flat pace"; a phone has no caption), on a leader line to the point.
  The threshold is a labelled rule across the plot with its range as a quiet band, named in the right margin of a chart 800 px
  wide or more and along the rule on a narrower one; a threshold that rests on estimated watts is named "Threshold (estimated)",
  drawn lighter and ended in a hollow ring, never dashed. A best that sits within 20 px of the threshold line goes above it
  without its caption. The last point is named at its end with its value and its duration. Both
  sports' curves are on a 12% wash of the sport's colour to the foot of the axis, and the period before is a thinner (2 px) solid
  grey line, never dashed. The curve's title is its finding (`curveTakeaway`): with a period before, how far the best
  20 minutes (or the longest effort both periods have measured) moved ("20 min is 11 s/km faster than the previous 12 weeks", "20 min is 12 W higher than ...", or in power per kilogram, "20 min is 5% more power per kilogram than ...", where a change of weight moves the watts the other way from the call,
  with the seconds set tight to the unit), or "No clear change in 20 min from the previous 12 weeks; changes under 7% can't be told apart here" (the smallest change the test could have called, from its band, up to 25%; a wider band says "the efforts vary too much to show a change" instead); without one, the best with its level
  ("Best 20 min: 4:11 /km, Local"). One test decides, for every curve and every page, so the same data always gets the same verdict: the change test
  (`packages/core/src/change`, [design/change-test.md](design/change-test.md)), which calls a change only when the real difference between the two periods' bests is outside the middle 90% of
  the differences the athlete's own efforts make when dealt out at random between the two periods. A length the periods hold too few efforts of to test gets no comparison, and the title names the best instead. A title and Balance's strip hold a call to the stricter 95% band, since they state several claims at once; a record row keeps the 90% band. A ride is tested on its power-meter rides, or on estimated against estimated, and a mix that differs between the periods is not tested. A carried value (below) is never read as a finding, in either period: the
  comparison and the best skip carried rows and take the longest measured effort. The chart's name stays as the small caption above the finding.
  Where the curve's points are a longer effort's value copied down by the envelope (`windowS` longer than `durationS`), the
  line there is that longer effort's value, not a measured one at its own length: the stretch is drawn lighter, from the measured
  point before it to the one after, and described by its shape under a bracket, "No separate 20–60 min effort: this stretch uses your 60 min best" (the effort named is the one the carried points say they came from)
  (the widest such stretch, which the table's caption repeats). It never says an effort is missing from the file, which a longer window always
  contains. A carried point is a hollow ring, not a solid dot, is not called out as a best, and its tooltip and table row say "from your 60 min effort". On a phone,
  annotations that would overlap another mark are left out (`optional`), keeping the 20 minute callout and the threshold. Every chart has a visible title, which names
  the figure once; the plot is described by its tooltip and arrow-key hint, not named again, and a
  value's label sits clear of its own line. A week's marker is enlarged when the
  reader points at it, as well as the latest one. A tooltip names its week, as "Week ending Sun 12 Jan
  2025", since the card title names the effort and window. A ring and band in a key is an estimate; a solid mid-grey line is the previous
  period. A chart's key keeps its row wherever the chart can have a key, so the plot does not move when
  a key appears. A sport curve keeps its key's row in any period that has a period before it, even when
  that period has nothing to draw, so the plot does not move as the previous period's line appears or goes; All
  time has no period before it and no row. A chart with no plot shows only its message. Axis text is set in rem, so it follows the
  reader's text size. A data table with more than 12 rows keeps to a height of 24 rem and scrolls inside
  itself, and a keyboard reader can reach it. A table that overflows its region is a keyboard scroll region too, and a phone
  shows a trend's table without its run and ride counts. While the plot has focus, the arrow-key hint
  sits in its top corner, and a tooltip takes its place once a point is active.
  A chart narrower than 480 px takes phone geometry (`PHONE_CHART_WIDTH`): a 40 px y gutter and a 44 px x band, a chart
  height of 262 px so the plot is about 190 px tall (where the chart sets no height of its own), y tick labels set inside the plot
  above their gridlines where the widest would not fit the gutter, and a readout row above the plot in place of
  a floating tooltip, which a finger would cover. ChartFrame's row is one 2 rem line at rest, saying the chart's latest or headline value
  (`idleReadout`, such as "Latest · Week ending 25 Oct: Run 64%, Ride 58%") or, without one, "Select a point to read its value"; a point's
  full reading (a title, a value with its note and the previous period's row) draws over the row, growing upward over the lines above the plot, so
  the plot never moves under a finger, and the height eases open only where motion is welcome. The tooltip draws into that row and a screen
  reader still hears the values as the status element. A chart that hosts its own row (the activity timeline) keeps the base row, which reserves the room of its fullest reading. A chart can state its finding: a `ChartFrame` with a `takeaway` sets the sentence
  large under the title, which then becomes a small caption and stays the chart's name, and an optional `focal` figure sits beside it.
  Pages opt in to the annotation primitive (`ChartAnnotations`: end labels, callouts, reference lines and brackets, each text
  on a card-coloured halo, placed so none overlaps another or the data) from their own charts.
- The energy view's ratio chart on How sure is this? tints running coral above its line and cycling
  blue below it, so the side that is higher reads before the numbers do. Its zero line is labelled
  "Even" on the axis, and its key names the bands "Before heart-rate check: 90% range" and "After
  heart-rate check: 90% range".
- **Evidence sits behind a disclosure.** On How sure is this? each chart is under a Show the evidence
  disclosure, which reads Hide the evidence while it is open, and the claim it supports is in words
  above it. The chart mounts when the disclosure is first opened, so a closed section draws nothing.
- **In-page jumps are buttons, not fragments.** The contents list on How sure is this? moves focus to
  a section's heading, because a fragment would change the hash route.
- A sport page reads top to bottom, on about 1,200 px of a desktop and in one column on a phone. The answer is one
  card: the **threshold** on the left (60%) at display size, named with its period ("Threshold pace · 12 weeks", so it
  is not read against Profile's all-time figure) and a chip that says Estimated (a ring) or At least (a floor, a held
  best), its fit drawn as a slim track with the two ends printed and the word "fit spread" between them (a range
  between two fits, as with uneven bests, is "range"), what it means, and the heart-rate check said once, as a chip
  beside the name: "Hard efforts on file · 97% of reference heart rate" with a tick, or "Not a hard effort · 80% of
  reference heart rate" with a warning, the Balance evidence card's two labels; the full sentence (where the
  reference comes from, what would raise it) is the chip's definition, one press away. On the right (40%) the **level of the best 20
  minutes** at display size with its percent, one line of what it grades, and the level ladder on the neutral
  level bands, a dot for a recorded effort and a ring with its range for an estimated one. Then the period
  control, then "On this page", then the sport's sections as the rows its list gives (`SPORT_ROWS` in
  `apps/web/src/ui/pages/sportSections.tsx`, one list per sport, so a sport adds or drops a section there and
  the page maps it). The page's title row carries a line of recent form ("Last run 14 Jan · 9 runs · 42.10 km").
  - **Open sections first, closed ones after.** Open: **Best efforts** (the curve with its findings written on
    it, and a strip of four record tiles under it), **Race predictions** beside **Time in zones** (60 and 40 on
    a desktop; a ride's zones take the whole row), and **Best efforts over time**. Closed, each a card whose row names the
    section and says what it found, so a closed section still tells the athlete something: **Same heart
    rate, week by week** ("Your pace each week at 145 bpm.", the row naming the heart rate so "the same" is a number, and
    saying where the fitness status is when there is one), **Late in long sessions** ("Best 20 min held 99% after an hour; output per
    heartbeat fell 3% from the first half to the second"), **Where your bests stand out**, and **All best
    efforts** (every record with its level, where there is a profile to grade it, and its activity, and the notes
    on how the figures were made). A closed section mounts its content when it first opens, so nothing is
    measured while hidden. For the same reason the browser's find-in-page does not search a closed section's
    content: its row (name and finding) is searchable, and "On this page" opens a section in one press.
  - **"On this page"** is a row of buttons, one for each section the page has. On a desktop it holds its place
    under the header while the page scrolls, because the page is long and a section is then one press from
    anywhere; on a phone it is a row that scrolls sideways and does not hold. A button scrolls to the section,
    opens it when it is closed and moves the keyboard there; they are buttons and not links because the app
    routes by the hash.
  - **Best efforts** has no heading of its own on screen (a screen reader has one): the chart's title and its
    finding name it. Its four tiles are a run's 1 km, 1 mi, 5 km and 10 km, or a ride's 1, 5, 20 and 60 minutes
    (`RECORD_TILE_KEYS`), each the time or power at display size with its pace or W/kg, a level chip and the
    activity as a link, or, when every record was set in one activity, that activity once under the strip.
    A run with none of its distance bests shows its duration bests. The Flat note sits under the tiles on a run.
    **See your runs** opens Activities filtered to that sport.
  - **Best efforts over time** shows the efforts of 5, 20 or 60 minutes that were the best of their stretch, each as a dot
    on the day it was done, older ones fainter (35% at the oldest, solid at the newest), with no line and no wash: the days
    between dots hold no reading, and a line through best efforts measured how often the athlete went hard. Its title is the change
    test's finding about that length against the previous period with the window named ("20 min is 11 s/km faster than
    the previous 12 weeks", "No clear change in 20 min from the previous 12 weeks; changes under 7% can't be told apart here"), and the plain description ("Best 20 min runs by
    day") when there is no previous period (All time) or the test could not judge the length. The fitness status above is the
    sport's trend. A dot is the effort that led some trailing window, once; the hard-effort filter waits for the effort gate in core.
  - **Late in long sessions** is a closed section. It holds two readings, each titled by what it found, with its
    chart and note, and each shown only once 3 activities stand behind it (`LATE_IN_EFFORT` in
    `packages/core/src/constants.ts`). The first compares the best 5 and 20 min overall, from any point in an
    effort, with the best that starts after 60, 90 and 120 min of moving time (`periodDurability`). Its title
    is one stat, the share of output held at the deepest level with 3 activities behind it at the longest
    duration that has them, with that duration: "Best 20 min held 94% after 90 min". The note gives the sentence ("After 90 min your
    best 20 min is 6% below your best 20 min overall.") and the count ("Your best 20 min after 90 min rests on 4
    rides."), says that a lower figure late on can also mean the run never asked for more, and for a ride that
    only a power meter counts. The chart is a dumbbell for each late best: a ring at no fall, a solid mark at
    the share the late best kept and the bar between them, all rows on one scale of the share kept (a pace's by
    its speed), which runs only a few per cent past the extremes, so a small fall is a short bar and not an
    empty row. **View as table** lists each figure with its fall against the best overall and the activities
    behind it. The second reading is the drift of steady efforts over an hour (`driftTrend`), titled "On steady
    runs over an hour, your output per heartbeat fell 3% from the first half to the second (median of 12
    runs)." (or "rose", or "held level" when it rounds to under 1%). The chart is a dot for each steady effort
    by date, its change in output per heartbeat in percent (a fall is below zero), a line at the median across
    the dots labelled "Median: fell 3%", and a dashed line at a 5% fall named in the key as "A fall of 5%:
    a common coaching reference line". That is a coaching convention
    (`docs/research/durability.md`), a light reference and not a verdict, and the note says that heat,
    hydration and tiredness also move heart rate, so a change is not fitness. An activity whose heart rate is
    set aside has no drift. A half with too few activities is left out and named in the "Not enough yet" list,
    one line for each missing half, each naming that half and not the section: "Best efforts late in long sessions:
    add 3 runs longer than an hour." (a ride adds "with a power meter") or "Output per heartbeat over an hour:
    needs 3 steady runs with heart rate." (a ride needs a power meter and heart rate). With neither, the section
    has no row and both lines are in the list. The copy never says limiter, weak, strength, "holding you back" or "ahead of".
  - **A section with nothing to show has no heading.** Its reason is one line of a muted list at the end of the
    page, headed "Not enough yet", before the footnote: "Race predictions: needs a best of a mile or more, or
    runs with heart rate." Each section names its need in the plain words it would have used under its own
    heading, lower-cased after the section's name, so a new athlete sees no dead headings and no jargon.
    The list is left out when every section has content, and on a page with no activities.
  - **A threshold the fit refused, shown as its floor, is "Threshold pace" with the chip At least** (or "power"),
    not Estimated, since the floor is a held best; its heading says ", at least" to a screen reader. A range
    whose two ends would print the same has no track to draw.
    The threshold carries no count: the period control under
    the answer names the dates the efforts come from. A sport the library has no activities for has no
    period control and no curve, and asks for files: one section holds that prompt, with **Add runs** and
    **How to get your files** side by side.
- **"Where your bests stand out" compares an athlete with their own curve, never with anyone else's.** The
  finding is a closed section on each sport page, whose row says it and whose body holds the strip of every best
  against the others when one stands out. It says, for each duration from 5 s to 60 min, how far
  the best sits above or below what the athlete's other durations predict (Morton's three-parameter
  critical-power model, fitted without that duration; the method is in
  [research/duration-profile.md](research/duration-profile.md)). A sentence leads: "Your 1 min best is 14%
  above what your other bests suggest. Your 2 min best is 9% below: it may be relatively low, or
  untested." It names at most the three that stand out most, shortest first, and only a duration whose
  range clears zero by 2% at its near end; one that stands out by less is on the chart only. A best below
  the rest is always said to be possibly untested, since a best is a lower bound. With none standing out and 40 or more activities of the sport in the period it
  says "Your bests are in line with each other, compared from 5 s to 60 min." and offers no strip; with fewer it says "Nothing stands out in your bests, compared from 5 s to 60 min. It takes 40 activities to say they agree; this period has 25." (a few efforts can match a curve by chance). A stand-out is judged at a stricter level in a library under 40 activities (the 5% level scaled by activities over 40), the size it states is shrunk toward the athlete's own curve (positive-part James-Stein, so the duration that noise helped most is not stated at full size), and the curve's spread is never tightened by the points the lower-bound refit drops (`profile/standOut.sim.test.ts` records the false-stand-out rates). With some
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
  watts. Tooltips add the cycling W/kg. The grade by duration is the one chart that puts both sports on
  one scale: the age grade in per cent. Without a year of birth and sex it draws nothing and says what
  it waits for, as the cards do; Balance never shows an energy rate.
- **The weekly volume ends the Balance page.** A stacked bar chart of the hours trained, titled by
  its finding and named "Training hours per week" under it, with one bar for each week of the period:
  the moving time of the period's activities, in each sport's colour, stacked in the order of
  `SPORT_ORDER`, each part 2 px clear of the one beneath and the top of the bar rounded. It stands on the weeks of the
  period (`weekEndMs`, the UTC Sunday that ends each week); a week with no training is a gap, and a year or more of weeks
  with none is skipped and marked on the axis. Past 26
  weeks it draws a bar a month, dated at the month's last week and
  holding the average hours a week of the weeks the month has in the span (its note says "Each bar is a
  month: its average hours a week."). A week counts as training, for where the chart starts and what ends a skipped
  stretch, from an hour; the quiet early years of a library are not drawn. The tallest bar carries its hours ("4.8 h"). The title is chosen in
  `volumeCaption.ts`, from the weeks and not the months: with more than one sport, the sport whose share of the hours moved most between the
  first and second half of the weeks, when it moved by 15 points or more ("Cycling rose from 22% of your
  running and riding hours in the first half to 82% in the second."), else the share of the sport with most hours; with one
  sport, how its weekly hours moved between the halves when they changed by a quarter from at least half an hour a week, else what they
  averaged. The chart has the shared frame's tooltip, arrow-key reading and table (week or month, hours of each
  sport, total). It is not shown when fewer than three of the weeks have training.
- **The default period** is the 84 calendar days (`DEFAULT_PERIOD_WEEKS` of 7) ending on the newest
  activity's day, when they hold every sport the library has. A library of one sport always does, so a
  run-only or ride-only library gets its 12 weeks and a previous period like any other. A day is counted in the device's local zone and
  runs from its first millisecond to its last, so an activity at 06:00 and one at 12:00 on the same
  day give the same window, and an older window never hides recent activities. A library
  shorter than 12 weeks has no previous period, so its default is All time, dated from its first
  activity, with no note. When those 12
  weeks lack a sport the library has, as with a 2015 run and a 2019 ride, the default is All time, the
  control selects All time (the period in force, not the 12 weeks the stored choice names), and it
  says why, naming the missing sport: "Your last 12 weeks hold no rides, so this shows all time." The
  period is computed in
  `packages/core/src/period.ts`. Each fixed period is the same number of calendar days ending on the
  newest activity's day. A custom range is the first to the last day the athlete picks, both counted,
  with `periodOf` in `packages/core/src/period.ts` dating it from the first millisecond of its first
  day to the last of its last. It may hold no activities, and the page then shows its empty state.
- A period's comparison is the same length before it, drawn as a solid mid-grey line (2 px) and named
  "Previous 6 weeks", "Previous 12 weeks", "Previous 12 months" or, for a custom range, "Previous N
  days" (or the word for its length when it is one of the named lengths). All time has none.
- The dated bests of the chosen length (5, 20 or 60 minutes) come from a trailing window that ends each week: a third of the
  period, at most six weeks, so a six-week period uses two-week windows, every window inside the period (`fitnessTrend`, which
  is not capped: all time is every week from the first activity to the last). A dot is the effort that led some window, once, on the day it was done
  (`bestDots`). The chart (`BestsOverTimeChart`) is dots only: a fitted y axis (a pace axis spans at least 30 s, a power axis at least 8%
  of its middle, neither from zero), a time axis from the first dot to the last, opacity by age (`opacityOf`), the last dot larger, a
  tooltip with the day, the value and for a ride its W/kg, and a table of the days and values. There is no smoothing, no wash, no
  monthly roll-up and no skipped-years axis: nothing is drawn between dots. One short line under the chart says that a dot is a best, not a
  typical effort. The weekly hours of the Balance page sit on the weeks of the period alone, with no trend over them.
- **"Same heart rate, week by week"** is a closed section after "Best efforts over time" on each sport page, and shows the one
  signal built from easy and steady efforts (`docs/research/same-heart-rate.md`) as weekly dots. It claims no change. The
  older sentence ("At the same heart rate you run 6 s/km faster than in March") and the straight line and band fitted through the weeks
  are gone: the weekly windows overlap by three weeks in four and the level wanders, so a line through them read the overlap and the
  wander as a trend (23% to 57% of athletes with nothing changing got a claimed change under a wander of 1% to 2%), and
  the fitness status is the sport's one voice on that signal, tested on its own statistic. The closed row says what is drawn, "Your pace each
  week at 145 bpm.", and where there is a fitness status, "Your fitness status above is read from steady runs over longer stretches."
  With too little data to draw, the section has no row, and a line of the "Not enough yet" list names what is missing, one of: too few steady
  5-minute stretches, too few activities, activities in too few weeks, heart rate that hardly varies, no effort near the reference heart
  rate in the latest weeks, or less than 4 weeks of steady efforts in the period ("Needs 4 weeks of steady
  efforts with heart rate. Pick a longer period to see it."); the numbers in them come from `SAME_HEART_RATE`.
  The reference heart rate is the library's, not the period's. The words are "output at the same heart rate", never "fitness"
  (apart from the status), "limiter", "weak", "strength", "holding you back" or "ahead of". The chart is named with the heart rate and
  the sport's unit, "Your output at 145 bpm, flat pace per kilometre". It draws a light dot for each week that reports (a diamond
  for a ride, as in every chart); a week that does not report has no dot and a mark on the date axis. The vertical axis is the
  sport's own number, pace with faster up or watts, tight to the dots and their 90% intervals, and always at least 5% either side of the middle. The tooltip and arrow-key reading say the week, the
  value, the 90% range and the stretches and activities behind it, and **View as table** lists every week. The
  note under it says how a dot is made and that only outdoor runs and rides with a power meter count. The windows lie inside the period,
  so a 6-week period reports about two weeks. The chart is drawn only with two or more reporting weeks.
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
  trend: a run is a solid line with a dot, a ride is estimated, so it is a hollow ring with its 90% range
  as a band (never dashed), and the key says "estimated". The 20 minute marks are larger, since the balance is taken there. The 20 minute grades are named beside their marks where the labels fit clear of the lines, the band and the ticks. Where they do not, a chart 600 px or wider names each sport at the end of its line, in a gutter at the right ("Run 49%", "Ride 34%" with its range under it), placed by the annotation layout; a phone leaves out a label that cannot be placed, and the readout and the table carry the values. The duration axis is titled "Duration (min, log scale)" and has a tick, in minutes alone, at each duration that has a grade. On a narrow chart the ticks are thinned, keeping the first, the last and the 20, so the labels read at 320 px; every duration stays in the tooltip and the table.
  The finding is the chart's title, one plain clause, and the chart supports it. It is read from the
  grades the headline uses: the ride's heart-rate-adjusted equivalence, through the balance's own `balanceGap`,
  so its gap at 20 minutes is the headline's. The headline leans by the estimate (`leanOfLead`) and states the
  range beside it; the chart separates by the range alone (`leanOfRange`), so a duration can be inside the other
  sport's range while the headline names the estimate's lead, with that range. A sport is higher at a duration only where its grade is outside the other's
  range, in whole percents; a duration inside the range is level. The clause speaks only of ranges, so it never
  reads as contradicting the headline's estimate, and it carries no figure: "Running grades higher at 15 to 45 min",
  "Running grades higher at every length", or "Running and cycling grade alike" when no duration is outside the range.
  A lead at a single duration is noise and is not mentioned, nor is a dip inside a lead: a sport's leads that level or
  isolated durations separate are one stretch ("at 15 to 45 min"), and "at most lengths" says a lead that spans every duration
  has such exceptions ("Running and cycling grade alike at most lengths" where the only leads are single durations). When the lead
  changes hands, each sport named has a stretch of two durations or more: "Cycling grades higher at 3 to 7 min, running at 10 to 60 min".
  When no duration separates the sports the chart is folded behind **Show by duration** (**Hide by
  duration** while open), with the sentence visible above it; it mounts when first opened. When a duration
  separates them the chart is open, with the sentence as its title. A ride's range is a band only over the
  durations both sports share: a duration where one sport has no grade shows its line and ring, not a band.
  The section is left out without a year of birth and sex,
  without a weight (a ride's grade waits for it), and with fewer than two durations graded in both sports,
  since a chart that would only repeat the 20 minute balance says nothing more. The chart's table lists each
  grade, with a ride's range in brackets, and its tooltip names the level.
- A previous period is a solid mid-grey line (2 px, `--previous-mark`), never dashed. It appears only when it
  has values, and otherwise its key row says there were none.
- **The Balance first screen is one line.** At 1440 x 900 the headline, the sentence, the meter, the levels and the period chips are all above the fold, and at 390 px wide and at 320 x 640, with the sample banner's two lines above it, the meter and both levels end above the section tabs (the eyebrow goes on a phone, since the period control states the dates). The meter is the first graphic on the page. On a landscape phone (667 x 375) the headline is above the foot bar.
- The Balance headline runs the answer's full width and names the sport the balance leans toward, underlined in that
  sport's colour (a shape; the text stays ink). The lede is one plain sentence at the 62 character measure ("Running's age grade is 11 points higher than cycling's at 20 min.", with age grade defined in place); the range is not in it, since it is written at the meter's dot. Running is
  on the left and cycling on the right, in the order `SPORT_ORDER` gives (`apps/web/src/ui/sports.ts`): the meter's ends, the levels, the tiles, the
  landing example and the share card all follow it. The answer stacks, with the gap a page's sections have: headline and sentence, the meter, the levels, the period chips, the share button.
- **The meter is the balance, as one line** (`BalanceMeter`). Over its ends sit the sport names in the display face, capitals, each with its glyph, and "Even" over the middle. The track is a 3 px line (`--control-border`)
  with a short cap at each end and an even mark at the middle. The best estimate is a ringed dot in the leading sport's colour (a 3 px ring in the page colour, an outline in forced colours), and the 90% range is a translucent band behind it in that
  sport's soft tint, layered twice so it reads, with no edge and never dashes. A level balance takes the neutral tokens. The value is written right under the dot, with the number itself centred on the dot and its smaller, quieter unit hanging off to the right ("+11" and "PTS"; "+12" and "%" for an energy ratio; "<0.1" for an energy lead too small for a decimal, and an unsigned "0" at zero). The reading is placed by a zero-width anchor and flex centring, never a transform, and kept inside the track's ends by the room its own characters take (`--number-chars`, `--unit-chars`, `--range-chars`), so a long range does not reach the gutter at 320 px. The reading's lines never wrap, and under it "range 6 to 16" ("range −4 to +18" where the range reaches zero or the other side), written from the side the balance leans to, with the word range defined in place as the 90% range. A range that rounds to one value is left out. There is no key and there are no ticks; a lead past 30 is drawn at the end with its true figure under it, and a small "30+" ("30%+" in percent) stands beside the name of the sport it runs toward, as on the share card. One image (the track) is named by the balance sentence, in words, with its range, and for a grade lead what the range says ("so the lead holds across the range" or "so the two could be level"), which is in the spoken name only. The line draws the grade gap when both sports are graded and the energy ratio, in percent, when they are not; with the energy ratio, "informed by heart rate" sits under the range when the check used it. In forced colours the line, its caps and the even mark take the system text colour, the band a Highlight edge, and the dot an outline.
- **Each sport's level is one line under the meter** (`BalanceLevels`): the sport's glyph and name, named as the meter's ends are (RUNNING, CYCLING), its age grade as a whole percent, then the level ("Running 67% Local", "Cycling 56% Recreational to Local" where a ride's range crosses a band), in a fixed name column and a fixed grade column so the grades line up when the lines stack, with the sport colour on the glyph only and the level a defined term (the bands and "A level, not a ranking."). The two sit under their own ends of the meter, and stack where they do not fit side by side. A sport with no grade says what it is missing in a few words, "Needs a best 20 min effort", "Needs your year of birth and sex", "No rides in this period"; where both wait for the same thing it is said once. With one sport in the period, its level is the only line; with two sports but a held headline, the headline names the levels and no line repeats them.
- **The hero, the tiles and the changes read one gate.** The page works the balance out once (`balanceOfPick` over the grade gap and the headline's comparison), so when the headline is held for too few activities the meter, the level target and the strip of what changed all hold with it, instead of the hero saying a sport is missing while a tile states a lean.
- **What changed** compares with the previous period (it is left out under All time). At most four items, each with an arrow, a title, a line and a
  tag: the lean first, then the ride's best 20 min, then the run's. An item is listed only where the change test (`design/change-test.md`) calls it: a best
  whose real difference from the previous period's falls outside the middle 90% of the differences the athlete's own efforts make when dealt out between the two periods.
  The lean is made of the two bests, so it is listed only when a called best moves it the way it moved (a higher run best or a lower ride best toward running, the
  other two toward cycling) and its tag is "Estimated". A best is tagged "Recorded" when it was measured in both periods, and "Estimated" otherwise (a ride's watts that were estimated, in either period). The lean's arrow says whether it
  grew or eased, whichever sport it favours, and this period's 90% range is written from the side it leans to, as the headline writes it; no claim is made about whether the earlier range overlaps it. A best's title says what moved against the period before ("Faster 20 min run than the previous 12 weeks"), as
  it is not a personal record. The previous period's grades are worked out from its curves the way this period's are, the ride at the mass it was ridden at.
  Previous thresholds are not in the session state, so thresholds are not listed. With nothing to list the strip says
  "No clear change from the previous 12 weeks." when something could be compared and the test called nothing, and "Not enough in the previous 12 weeks to compare." when the previous period lacks the efforts or holds too few of that length to test; where only some could be compared it lists those. A best is compared only where neither period's best 20 min is known, by the heart-rate effort check's 90% line, to have been an
  easy effort; otherwise a line says "No comparable hard 20 min of running in the previous 12 weeks." (or, where this period's was the easy one, that it was not a hard effort so it is not compared). Where heart rate
  does not say, the best stands. The previous period's check is `SportCurves.headlineEffort`, judged against the library's reference heart rates and set-aside list.
- **The import summary compares like with like.** It lists what an import moved only when the period was in the same regime before and after (the same length, all time both times, or the same custom days: `sameRegime`). The default period is 12 weeks until an import brings a sport the library lacked and then all time; a threshold or grade across that switch is a different stretch of the library, not a change, so the summary lists nothing then.
- **The period control sits under the levels,** as one compact row of chips with the real dates, the count (linked to Activities, with "(38 walking-pace runs left out)" where
  runs at walking pace are), and, where a longer period holds the same activities as a shorter one, "Same 14 activities as 12 weeks". At 360 px and below the chips read "6 wk", "12 wk", "12 mo", "All" and "Custom", with the full names kept as their accessible names, so all five fit one row.
- **Three tiles at most** give the headline numbers (the lean has no tile: the headline, the lede and the meter's dot say it once, and a tile figure never exceeds `--display-2`): each sport's threshold ("threshold" is a defined term, with the plain-words meaning the sport page gives; the figure at display size, the fit's spread as a slim track labelled "fit spread", lighter than a 90% range and left out where its ends print the same, a chip saying Estimated or At least, a line under the name that says what a threshold is, "Pace you could hold for about 30 min", where the best 20 min was faster than it a line "Your best 20 min was faster: 6:37 /mi" (higher, for watts), the grade line, and a one-line chip with the share that says how hard the best 20 min was by heart rate, "Not a hard effort · 70%" or "Hard effort · 95%", whose full reading opens as a definition and which is never a card). When the best 20 min was not a hard effort the threshold is withheld: the tile shows that best as "At least", without a spread, with the line that says what it reached and that a hard 20 min effort would give the threshold; a reference heart rate that cannot be a maximum reads "Effort not confirmed" with no share (docs/design/effort-gate.md), and the ride on foot
  (the pace, the watts and the pace as a pair of chips, the activity that set it, and the equivalence table folded under it; an estimated ride under 10 min is not priced as a pace, and the tile asks for a ride of 10 min or more). A tile with no
  figure to give, one held for a weight or waiting for an effort, has no chip and no track.
- **Terms that carry the answer are defined in place** (`Definition`): age grade in the first sentence, the 90% range at the meter's "range", level on each level line. A term opens on a resting pointer only for a mouse or pen on a device that can hover (`pointerType` and `(hover: hover)`), never for touch, which leaves hover stuck on iOS. No box around a term may be transformed, filtered, contained or promoted (`will-change`): the phone's fixed sheet would be trapped in it, and `analysis.spec.ts` walks every term's ancestors to check. A note wraps whatever line it sits in. Each is a button that opens a short note under it, over it where the window has no room under it and has more above, and on a phone
  (under 480 px) a sheet at the foot of the window, so the note never covers the term it explains; it closes on a second press, Escape or a press elsewhere, and a pointer
  resting on it shows the note too. The button's press target is at least 44 px, from its own pseudo-element, so the line does not change.
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
- **A sport's page card reads top to bottom:** the sport's name, the threshold as the hero number (its
  unit set at about 40% of the numeral), the threshold in plain words, the grade line, the
  ladder with its key, then the best efforts. Balance no longer carries these cards: its tiles carry the threshold and the level.
  The grade line gives the level and its percent. The effort it grades sits on a line of its own under it: "on your
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
- **A threshold has its range under it, in small text.** It reads "Fit spread 22:58 to 23:49 /km" for a
  run and "Fit spread 48 to 49 W" for a ride, or "About 48 W" when both ends would print the same. The method is the standard error of the critical-power fit: one
  standard error either side of the critical power, a rough spread of the fit rather than a confidence
  interval, so it is not called a range. A range is left out when its low end is not above resting metabolic rate, which
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
  previous 6 weeks", or "8 W more than previous 6 weeks", or "No clear change from previous 6 weeks" when the
  move is not one the change test calls (the same verdict the curve's title reads); a length the test could not judge, with too few efforts in either period, shows no change at all. It is absent for All time, and for a ride when either best's watts are
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
- **How your reps held up** sits in an activity's In detail section, under the lap strip (a Laps strip shows for two or more recorded laps, since one lap is the whole activity, and Suggested intervals show when none were recorded), when the activity
  has at least 3 laps (the device's, or the suggested intervals when it recorded none) of about one length:
  within 20% of the middle one's duration. Recoveries between reps are left out only where they alternate with
  the reps: where the sorted outputs part by 15% or more and the hard laps all sit at places of one parity, the
  laps at those places are the reps, so a rep that fell to the recoveries' pace stays in. With any other
  pattern every lap is a rep, so a rep that blew up is the fade shown. The table is for structured intervals
  only: every rep after the first must follow a recovery, which is the laps between it and the rep before
  being all clearly slower (15% or more below the reps' middle output) or shorter (20% or more below their
  middle length) and not faster than the reps, or, with no lap between, a rest of 10 s or more that no lap covers (`recoversBetween`).
  Equal laps run one into the next at a steady effort, such as a watch's mile auto-laps, are splits, not
  reps, so they get no table. Every rep needs the measure it is read in, and none
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
  measures, the lap strip, the timeline and its brush, how your reps held up, the figures for the
  selection and time in zones), then, for a ride without a power meter, the line "Power here is estimated
  from speed and climbs. No power meter recorded it." Earlier and Later name the activities either side in
  the library, then the all-time records as chips, each linking to its sport's page (underlined on hover, not
  at rest), the splits (runs), the best efforts set here (a run at walking pace gives a line saying it is
  left out of the run analysis instead), the skipped readings, and Delete. A ride with no power curve says why in a line: an estimate is made only on
  climbs, and a ride with no power data has none. A ride's bests and chips wait for the weight. An
  activity from before moving time was kept shows its elapsed time, and says so.
  A run's distance times and its splits are timed differently on purpose: a distance time is race-like, from the clock
  including stops, and a split is moving time. When both are on the page, a line under the best efforts says so in
  these words: "Distance times include stops. Splits are moving time." While the splits show the device's recorded
  laps it says only "Distance times include stops." It is left out while the splits load or when they are
  missing, and when the run has no distance time.
  The best efforts set here do not follow a period the athlete picked elsewhere without saying so: a best that is an
  all-time record is marked "All-time record" exactly when it has a chip above (a ride's one-minute best has none), and
  one that is only the best of the period on screen says which, such as "Best in the last 12 months" (a custom range
  gives its dates, or "Best on 3 Aug 2025" for one day; all time names none). An activity outside that period has no
  period bests, so it lists its distance times and names its all-time records, with a link to the sport page for their
  figures ("Choose All time on the Run page to see their figures", or "See the Run page for their figures" when the
  period is already all time), and never says its bests are "not counted".
- **A list row reads the same figures.** The sport's glyph in a disc of its colour (its word is for
  screen readers), the name, the day and start time, with the **Indoor**, **Estimated power** and
  skipped-readings chips and the record chips, then the figures in the display face in columns at the
  right: the moving time, distance and climb, labelled, and the pace for a run, the speed for a ride, or
  the average power of an indoor ride with a power meter, set larger. A ride's record chips wait for the
  weight, as its page's do. Up to 760 px a row is two lines: the glyph and name, then the day and the
  figures, which lose their visible labels (kept for screen readers); a phone leaves the climb out of
  that line unless the list is sorted by climb, and a row with chips has a third line for them. The legs
  of one upload are a session: its bytes are hashed, so two uploads of one name are two sessions.
  Where the origin is not secure and there is no crypto.subtle, nothing is hashed, so the legs are
  not grouped and the import still reads. A session sits under one row that gives its total time,
  with the legs indented in the order they were ridden. This grouping applies only in a date sort,
  where a session's legs are next to each other. In a distance or time sort each leg is a row of its
  own. The time sort orders by the time each row shows, which is its moving time. Month headings
  group the rows when the list is in date order, each with that month's counts and distance by sport and
  its hours, summed over every activity the list holds and not only the rows on the page; another sort
  drops them, and at a page break a month heading repeats, so each page names its months. Above the list
  the volume strip draws the activities left by the period and sport: one column of stacked hours (run
  below, ride above) for each week, Monday to Sunday, or for each month when the set spans more than 26
  weeks (each quarter on a phone, where a month's column would be a few pixels wide), with the counts,
  hours and period as its heading ("38 runs and 12 rides, 61 h, in the last 12 weeks"; once the newest
  activity is over six weeks old the period is dated, "between 1 May and 11 Jun 2025", so "last" is not
  read as now). The page has no count line under its title: the heading is the summary. A year or more
  with no training is folded into one 28 px column with a break mark, as the trend's time axis skips it,
  so a stray early date does not take the width. A column is a button: it narrows the list to that week,
  month or quarter (kept in the address as `bucket`), the others fade, a "Showing week of 3 Jun 2025: 3
  activities" chip with Clear says so, and pressing the column again lets go. A tap beside a thin column
  picks the nearest one with training. Changing the period or sport lets go of it; a sort keeps it. A
  week or month that holds nothing, because it is outside the period or a removal emptied it, says "No
  activities in the week of 2 Jun 2025." with Clear week; after a removal that empties the list, focus
  goes to that message. The columns are one tab stop moved by the arrow keys, Home and End, and a fixed
  line under the strip reads the column under the pointer, or the busiest one, so nothing floats over the
  bars. The strip is built from the summaries
  the list holds, so it loads no trace. The page is counted over rows, so a session
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
  Estimated unless a power meter measured them. A run held indoors (on a treadmill, an indoor track, or a virtual or GPS-off run) sets no
  record and holds no best: its belt or footpod pace is left out of the run curves, the records, the
  distance bests, the thresholds, the race predictions, the late-in-session bests and drift, and the
  Balance comparison (`packages/core/src/digest/effortTrust.ts`, a table keyed by sport so a trainer ride's meter still
  counts). It stays in the activity list, the volume, the time and the heart-rate zones. Its page lists
  its own distance times under "Distance times", unmarked and ungraded, with one line: "Indoor pace
  is not used for bests." When
  every record was set in one activity, that activity is named once under the list ("All set on Morning run,
  5 Jan · 5 months ago"), the link and its count on one line in the second column, the name wrapping
  so the date stays whole. Otherwise each record links to its own activity, with its own count on the
  link's line. A long activity name is cut short with an ellipsis, and its full name is the link's
  title and accessible name.
- **The ride on foot is a tile:** a ride-to-run pair of chips (the watts, then "on foot"), the flat pace as the tile's figure ("4:10 /km", the unit in its own span), and one sentence ("Your best 20 min on the bike, 250 W (estimated), takes the same effort as running this pace on the flat."), with the watts marked estimated when no power meter measured them.
  Its ride figures and its table wait for the weight, as the tiles' do, and its needs-a-ride line names
  the dates the period is missing a ride between, or says that a long ride needs power when it has no power curve. The heart-rate check is never a card: it is a chip on the tile it qualifies, and for files with no heart rate one line
  under the tiles, with the link to How sure is this?.
- **A held comparison leads with what it can show.** While Balance cannot set the sports against each other, its title names the levels the files do give ("Running is at Local level, cycling at Recreational", or "Your running is at Local level"), and the line under it is one action: "Add one run of 20 min or more to compare them.", "Add 2 more rides in this period to compare them." or "Add your weight on Profile to grade your rides and compare them with your runs." For rides without a power meter the line names the climb instead, since a long ride is not what is missing: "Add one ride with a power meter, or with a climb of 3% or steeper that holds for 20 min without a break to compare them." (virtual power is trusted only on climbs, and a 20 min estimate needs one unbroken, `CLIMB_NEEDED`; the landing page and How sure is this? say the same). "Not enough to compare yet" is the title only when no sport has a level. With only one sport on file, the other sport's card asks for files to compare it with the first ("Add rides to compare them with your running."). A ride card held for the weight says how many rides there are, how long they ran and when the latest was, none of which needs a weight, then asks for it.
- **The browser is asked to keep a signed-out library, and a lost one is told.** After a first import is kept in this browser it
  asks the browser to keep the site's storage (`navigator.storage.persist()`). A browser that refuses gets the notice "This browser may clear
  your results" once on a device (`rca.persistNote.v1`), not on every import, and a browser that already keeps its storage is told nothing.
  A library marked as kept on an earlier visit that loads empty is told as gone ("Your kept results were cleared"): "The results you kept in this
  browser are no longer in it. Clearing site data, low storage or, in Safari, a week away can remove them.", with the sign-in line only when
  signed out. No cause is asserted. The mark (`rca.deviceKept.v1`) follows every list of the library kept in this browser and counts rows
  it holds but could not read (a newer version's), so neither a removal nor such rows read as a loss. It lives in the storage a sweep of the
  whole site also clears, so that loss cannot be told from a first visit.
- **A library that will not open is not an empty one.** When it fails to open (full, blocked by another tab, or no answer in 10 s), a listing,
  a lookup and a single read reject, so the page shows its error and Remove all my activities says it could not remove them; a signed-in delete does
  not claim the copy kept here gone, and a removal says the kept results could not be read. An import is then analysed on its own and says so ("shown
  on their own and are not added to them"); each save first reads what is kept under its workout, so nothing kept is written over. Only
  storage the browser does not offer, as in a private window, reads as empty. A transaction refused on a database that opened still reads a single
  workout or route as none, since only a listing or a lookup decides whether a copy is overwritten.
- **A weight that looks like the wrong units is asked about.** Besides the 45 to 160 kg range, a body weight 1.4 times higher or lower than the
  one already given is asked about before it is kept: in the setup dialog and Profile against the saved weight (on Profile, the dated weight in effect
  today when there is one), and for a dated weight against the nearest dated one, else the saved one. With none to compare with, a first weight above 120 kg is
  asked about too and, if typed in kilograms, says what it would be as pounds. "That is 150.0 kg, 121% higher than your saved weight, 68.0 kg. Check the units, or
  press Analyse my files again to keep it." The setup dialog never switches units under digits the visitor has typed or units they have chosen, whenever
  the account answers. A ride's best 20 min from a power meter shows without a weight, since a meter reads watts whatever the weight.
- **Counted runs keep their state where it is seen.** Pressing "Count this run" or "Leave this run out" on an activity moves focus to the button that
  replaces it; "Count these runs" on Balance or Run moves it to the page heading, which then says the new state. What a change did ("Counting 22 runs.") is
  said in a screen-reader line in the notice region, which stays mounted, and a refusal by the browser to keep the choice stays in that region
  ("This browser would not keep that choice…") until the next change. Run and Activities say "22 runs are counted despite walking pace" with "Leave them
  out". The choices are forgotten with the library (Remove all my activities, once the library is known to be empty), on signing out and on deleting the
  account, and follow a change made in another tab. An import notice that added only runs left out ends with a link: "Open Run to count them."
- **The app-wide error boundary is friendly and plain.** It says "Something went wrong" and "The page stopped working. Reload to try again; your saved activities are untouched." with a **Reload** button. The error's own message is never shown; React logs it to the console.
- **Share metadata, the manifest and the 404 page.** `index.html` carries the canonical link, Open Graph and Twitter tags and a theme colour for each colour scheme. The image is `public/social-card.png` (1200 x 630, drawn by `scripts/make-social-card.ts` from the sample athlete's figures, which the build reads from the sample's analysis (`landingFigures()` in `vite.config.ts`), and from the dark theme's colours in `tokens.css`; the script also writes the app icons and `public/social-card.stamp`, a hash of those figures and colours). The alt text in `index.html` is a `%LANDING_OG_ALT%` placeholder the build fills from the same figures. When the sample or a token the card uses changes, `shareMetadata.test.ts` fails on the stale stamp: run `npx playwright install chromium`, then `npm run card`, then commit `public/social-card.png`, `public/social-card.stamp` and the icons. `public/manifest.webmanifest` names the app and its icons; there is no service worker. An unknown path is answered with `public/404.html` and a 404 status (`not_found_handling = "404-page"`), which a browser navigation gets without invoking the Worker; `/api/*` keeps its JSON 404 under the rate limiter.
- **Only the drop area is dashed.** On the landing page the example beside it is a solid frame, with
  its figures at the body size in each sport's line, so the two never read as two drop targets. The export guides
  are a tile grid that opens one service's panel, not a stack of full-width panels.
- **The Balance footer is one line** that names the age and the standard, "Graded for a 37-year-old man on the USATF road standards.", adds a sentence on rides only when a ride is graded, and ends "A level, not a ranking." The full credit, with the authors and licence, is on How sure is this?, not on Balance or the sport pages.
- **The phone has no grade strip.** The levels show both grades at every width, so no strip repeats them.
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
  headline sit the lead line and the meter, drawn from the same `BalanceReading` as the page's. Then each sport's threshold, "Threshold flat pace, estimated from your
  best 3 to 20 min" for a run, with its W/kg and its level, such as "Local · 64% on best 20 min", under
  the figure, and a glyph beside each label for its sport; the period; the heart-rate caveat as a starred line when there is one; the footnote; and the
  site's host when it is public.
- Figures are drawn in text colour. Sport colour appears only on the brand mark, the edge of each
  column, and the meter's band and dot. It never colours text.
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
- **The balance is stated as a grade gap, led by its best estimate.** With both grades: "Running's age grade
  is 9 points higher than cycling's at 20 min, within −4 to +18 points." The estimate
  decides the title and the lean (`leanOfLead`): a lead of more than 2 whole points leans toward the sport it
  favours, "Your balance leans toward running", whether or not its range reaches zero. The range is stated
  beside the estimate, from the side the estimate favours (running when it rounds to zero) on every surface: the lede, the meter's range line, the spoken
  name and the import summary. A level balance that favours cycling reads cycling's range too. A cycling lead reads "cycling's age grade is 9 points
  higher than running's, within −4 to +18 points"; a range wholly on the leader's side is plain ("within 2 to
  10 points"), and one that reaches zero or the other side is signed with true minus signs. A range that
  rounds to a single value is left out: "Running's age grade is 6 points higher than cycling's at 20 min."
  Only an estimate within 2 whole points (`LEVEL_BAND`), however wide its range, is called level, under the
  title "Your running and cycling are in balance": "Running's age grade is 2 points higher than cycling's at
  20 min, within −2 to +6 points, so the two are level." Exactly zero reads "Running and cycling have the same
  age grade at 20 min, within −2 to +2 points, so the two are level.", and a lopsided range
  names its side: "within −1 to +3 points (running minus cycling)". The page, the meter, its spoken name and the
  share card all read the one `BalanceReading`, so they cannot disagree. The grade profile keeps its own rule,
  by range alone (`leanOfRange`): a sport leads at a duration only where its grade is outside the other's range.
  Never "ahead of". Without an age and sex, the energy ratio stands in, led the same way: "Over 20 min, your
  running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram." The prompt says that
  adding them shows the balance in points and levels. The energy ratio's 90% range names the sport that leads,
  with the same figures as the sentence and the meter: "Ride against Run, 90% range: 11% to 33%." on How sure
  is this?, and "Run against Ride, 90% range: -2% to +4%." only when the two are level. The lede names no
  dates: the period control's caption under the levels gives them when the period is not All time.
- **The level target says what would level the balance.** When the balance leans, the hero's line under the lede names what the lower sport's best effort at the headline length would need to grade
  level with the higher sport's, in its own unit, rounded toward the side that levels (watts up to the next 5 W, a pace to the faster 5 s), and a ride's range is the watts at the 5th and 95th percentile of its equivalence, rounded outward to 5 W: "To grade level with your running at 20 min, your best ride would need about 270 W (roughly 245 to 295 W; now 246 W)." (`levelTarget` gives the pieces and the sentence.) A run's pace has no mass, so a run target never says "at today's weight", whatever the dated masses. The target inverts the age grade at the lower sport's
  age, and a ride's watts invert the same equivalence its page grade is read from, with its heart-rate weights, so the
  words say "about" and "now", never a prediction. It is left off when the
  balance is even, when either grade is not on screen (a ride's waits for the weight), and when the rounded target
  does not beat the figure the page shows for the lower sport, in whole watts or whole seconds of pace. It is not repeated elsewhere on the page. The share card does not carry it.
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
  "could be higher" (the cards are titled "Your best run did not reach a hard heart rate", and the like), never
  "all-out" or "heart-rate reference". How sure is this? defines the reference heart rate
  in one sentence, where it explains the heart-rate check. Each line that names it glosses it once, as "(set from your highest
  heart rates on file)", which holds for both sports: cycling's is derived from running's, so a ride is never
  called your highest heart rate. A sport page's chip says "Hard efforts on file" at 90% or more,
  judged on the percent it shows, so a share that rounds to 90% is hard.
- **Race predictions sit beside the zones.** The Run page predicts the 5 km, 10 km, half marathon and
  marathon in a card of range bars, 60 beside the zones' 40 on a desktop. A row is the race with its pace on
  the left, the predicted time at display size on the right, and between them a bar: the **assumed spread**
  (its 10th to 90th percentile; the wording is "assumed spread", a defined term, never a range or a confidence
  interval) as a rounded band between two caps with its ends printed, the prediction as a ring, and each
  estimate it sits between as a triangle, ▼ from the runner's bests above the bar and ▲ from heart rate below
  it. The bar is linear in seconds and its scale widens for an estimate outside the spread, so a mark is drawn
  where it is. Each prediction is the geometric mean of the runner's
  bests and the races their heart-rate VO2max would run, both carried by Riegel's law at 1.07 and, for the
  marathon, Vickers & Vertosick's mileage-corrected model. **About these predictions**, a disclosure
  under the bars, holds the note, a table of every figure and where each estimate came from. The note says how many hard runs the heart-rate
  side rests on, how many hilly runs it left out, and, when the two disagree, which points higher and
  why. In All time the note adds "In All time they reflect your best period. A shorter period shows your recent form." With no best from the mile up
  and no heart-rate VO2max, the section has no card and says so in the "Not enough yet" list. The method and its sources
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
  a ranking." The card states a lead with the range it sits within on one line, in the lede's wording and
  without the unit: "Running grades 9 points higher, within −4 to +18" (a level balance states no lead, since the
  headline says it). It is short enough to leave the origin line in place at both shapes.
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
  ride would let them be compared." beneath it. When a sport has fewer than three analysed activities in the
  period, it says what is missing instead: "From 1 run and 3 rides. Needs 2 more runs in this period."
  (without "in this period" for All time), with **Show all time** when All time holds enough. The counts are
  the ones the rule counts: where a treadmill run is on file the run count reads "outdoor runs" ("From 1
  outdoor run and 3 rides. Needs 2 more outdoor runs."). One constant, `HEADLINE_MIN_ACTIVITIES`, sets the 3
  here and in the line under the lede that counts each sport.
- **The headline needs evidence on both sides.** Each sport needs a fitted threshold or an effort as long as
  the headline's (20 min). A sport known only from shorter efforts, such as one estimated 5 min ride, is not set
  against the other, and neither is a sport with fewer than three analysed activities in the period
  (`HEADLINE_MIN_ACTIVITIES`): the answer reads "Not enough to compare yet" (`headlinePick`, which
  `balanceOfPick` follows, so the grade gap is held with it), on the page, the share card
  and the import summary alike. How sure is this? holds its energy view the same way and names the same reason (`heldReason`): "The
  comparison is held. Needs 2 more runs in this period." or "The comparison is held. A hard 20 min run or ride
  would let them be compared.", with no ratio chart and no energy-ratio copy.
- **A run at walking pace is not a run.** A run whose moving pace is slower than 15:00 a mile for 10 min or more
  is a hike recorded as a run, unless its cadence is a runner's (130 steps a minute or more) or, without
  cadence, a tenth of its moving time was at a jog (`WALKING_PACE`, `digest/walkingPace.ts`). Either signal
  keeps the run: a runner's median cadence over all its moving seconds or over just those faster than a walk,
  or the jogging share, so a run/walk session or a hilly ultra with a low median cadence is still a run. It
  stays in the library with a Walking pace mark on its row and its page, where a line takes the place of its
  best efforts, is left out of every run analysis, volume and best, and a line under the import notices counts
  them on Run and Activities, the pages that list or analyse runs, and on no other. Every count and date the pages give of what is analysed leaves them out, while the activity list and the activity pages keep them.
  The athlete can **count a run** that is at walking pace: the activity page offers "Count this run", and its page then says it is
  counted and offers "Leave this run out". The choice is a list of workout keys (sport and start second) kept in this browser's local
  storage (`rca.countedRuns.v1`), signed in or not, so it survives a reload and a re-import; it is carried in `AthleteSettings.countedRuns`,
  and the session applies it when it builds its state (`countedRuns.ts`), so the digest is unchanged. Where every run is left out, no page says
  there are none: Balance's headline reads "Your runs are at walking pace" with the count, and Run says "22 runs are at walking pace, so they
  are left out. Count them as runs to include them.", each with a "Count these runs" button; the import notice says it too.
- **A ride whose power no rider holds is set aside, whole.** This is the flag that means implausible input, and the
  only one the athlete can override. A power-meter ride with any best above 1.25 times the world-class edge of a
  widely published power-profile table (men's row for everyone: 22.8 W/kg at 5 s, 10.6 at 1 min, 6.8 at 5 min, 5.6
  at 60 min, with a 15 s sprint node of 21; `ridePowerCeilingWkg`, `curves/powerCeiling.ts`), at the body mass of
  its day, is priced as NaN everywhere a ride is priced: no best, trend point, record or heart-rate point, no
  calibration of the bike model, no heart-rate line in the estimated-ride gate, no durability or drift reading and
  no ride fitness. Its heart rate is otherwise trusted: it is neither fitted nor judged by the low-for-power test,
  which reads heart rate against watts that cannot be right. The next ride takes its place. It is not judged while no body weight is entered. It stays in the
  library with a **Power set aside** chip on its row and page, where a line names power meter calibration, the
  weight setting and an e-bike logged as a ride as things to check, and a **Keep this power** button. Keeping it is
  a choice stored in this browser only (`rca.keepPower.v1`, ids; cleared on a completed sign-out, account deletion and Remove
  all, not on a session that expires), carried into the analysis as `AthleteSettings.keepPower`, and shows **Power kept**: the ride counts in the
  bests and thresholds, but a ride that then tops the age tables is still left out of the comparison. The digest is
  not touched, so nothing is reimported. A ride at the top of the age tables (a different flag, see
  `docs/research/age-grading.md`) is no fault, names no check and has no override.
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
  climb, the timeline in In detail, time in zones, late in long sessions, how your reps held up,
  weekly hours by sport, runs at walking pace, dated settings and estimated zones, the equivalence across
  sports, best efforts over time, whether a change is a change, and the heart-rate set-aside), _Read from your files_ (as the
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
  saved activity opens its confirmation under its row, with a **Delete** button (on a phone, 560 px and below, the row's Delete is a three-dot button named "Delete <activity>" with a 44 px target, and the Activities controls fold to one Period chip row with Sport and a compact Sort select beside it); a summary
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
  Ride page say "Add your weight on Profile to grade your rides and see their figures." with a link to Profile. A run's
  figures still show, and the balance waits, so the share sheet is not offered, while no weight is
  entered. The Balance cards, the Ride page, the cross-sport idea and How sure is this? show no ride
  figure worked out from the placeholder weight. How sure is this? holds its energy view and its
  virtual power check, and draws only the running blocks of its heart-rate chart, with the prompt
  beneath once a ride is on file. With no ride, its energy view says it needs one to compare with
  running, and asks for no weight. With a run and no ride, or a ride and no run, the energy view names
  the sport it needs and draws no ratio, so the ratio and its chart appear only with both. The request
  for a weight is written once, in weightCopy: the linked prompt Balance and
  Method show, the plain note a dialog shows, and the purpose a Profile field hint shows. The activity page holds a ride's bests and record chips the same way, and says "Add your weight on Profile to grade your rides and see their figures." in their place.
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
scheme in a muted line under it. Ranges are whole numbers that do not repeat a shared edge ("Under 140 W", "140–189 W", "375 W or more"); a run's range reads as a pace, the fast edge first, and a pace belongs to the zone it is slower than the next one's edge. A heart-rate estimate that rests on both sports says "From your runs and rides". Without a weight, estimated ride power zones are not shown and the section asks for one. While the sample is loaded, only the visitor's entered settings make zones. Without a reference
the section says zones appear once there are files or an entered setting. The schemes are in
[research/zones.md](research/zones.md). `zonesAt` in `packages/core/src/zones` is the one place they are
built, and `AnalysisSession.zonesAt(date, settings)` answers from the worker's analysis.

## Time in zones

How the time was spread across the training zones above, in one activity's selected interval and over a
sport's period. The maths is `packages/core/src/zones` (`timeInZones.ts`, `traceZones.ts`, `periodTime.ts`,
`zoneShares.ts`); the research notes are in [research/zones.md](research/zones.md#5-time-in-zones).

**Activity page, In detail: the timeline.** The measures stand in one figure, each in its own row at true pixel proportions
(never a stretched SVG), all on one time axis and under one crosshair, in `ui/charts/TimeSeriesStack.tsx` (the arithmetic is
`timeSeriesModel.ts`, which knows nothing of activities). Each row draws a smoothed line, a rolling mean as wide as a
hundred and seventy-fifth of what is in view (3 s at least, so a lap shows its detail, and two minutes over a six-hour ride,
which reads as a trend), and a light band behind it, the usual spread of the raw readings in each pixel: their 10th to 90th percentile, so a few
strays do not set it and it does not routinely fill the row. Power's band leaves out the coasting zeros (the line's mean keeps
them), and the band fades from full strength where a pixel is a second or two to about half where it is twenty seconds or more,
so an overview's spread is quiet behind its trend. The line breaks across a gap of more than two seconds, the recorders' sample rate, and bridges a hiccup of one
or two. Elevation is an area. Each measure has its own colour (the `--ch-*` tokens: pace green, power amber, heart rate
magenta, cadence olive, elevation stone), which reaches 3:1 on the card in both schemes and stays at least 15 CIEDE2000 from
the others and from the run, ride and swim hues (`channelTokens.test.ts`); the sport hue still only means a sport. A row's
axis is fitted to its smoothed line over what is in view (so a zoomed lap fills its row, and the rolling mean is cut at the ends
of the view, so a lap's first seconds are not averaged with the ones before it), from the 1st to the 99th percentile, kept to
the line's own extremes where they lie within a quarter of the span past it, with 5% of room round it and never narrower than a
fifth of the raw readings' own span (so a flat trend is drawn flat; a measure that cannot be negative is not widened below zero;
an area, like elevation, is fitted to its own data and not forced through zero), and a pace axis never reaches zero speed, which would be an
infinite pace. **A pace axis is even in pace, not in speed**: a minute is the same height anywhere on it, faster is up, and its
ticks are evenly spaced (4:30, 5:00, 5:30), which an axis even in speed would not give; its room is a share of its height in
pace, so the fast end clears the line as the slow end does (`timeSeriesModel.ts`, `AxisScale`). A raw reading past the axis (a power spike, a standing start) clips at the row's edge. It is marked only where it is more than
15% of the axis's span past it (measured as the axis is drawn), with one small tick, in the row's colour at reduced opacity, to each 8 px, and keyed "Reading beyond
the chart edge" under the plot while any is drawn. The band is a spread, not the extremes: the table twin keeps
the true lowest and highest of every reading, spikes included, while the interval summary gives each measure's average and its typical range (5th to 95th percentile), as
a lowest and highest are set by one stray second. Its
ticks fall on round paces (4:30, not 4:32). There is no histogram: the time in zones says how
time was spread, with its own table.
The readout above the plot is the chart system's readout row, kept at every width (five measures at once would cover the plot
if they floated): at the cursor it gives the elapsed time, the distance and each measure's value (the line's, and nothing in a
paused or unrecorded stretch), and with no cursor the selection's averages, the same as the interval summary's. Arrow keys
move the cursor by a hundredth of the window (a second at least), Home and End jump to the ends, Escape clears it, and the readout is
announced to a screen reader from when the plot gains keyboard focus (not for a press, a pointer sweeping, or the idle averages); on a phone a touch scrubs and keeps its reading after the finger lifts. Pauses and
gaps in the recording are marks on a lane under the rows (a pause solid grey, a gap hatched), and the readings the analysis
left out are ticks on their own row, each keyed under the plot only for the kinds the window holds. Every second lap is
shaded behind the rows. The laps, or the intervals found in the readings, are one strip above the plot. Intervals are found only when the device recorded no laps, from power for a ride and a run with power and from speed for a run (a ride's speed says terrain and wind, so a ride without a power meter has none): the smoothed readings are split into a higher and a lower level, the efforts are the stretches at the higher one, and they count when there are two or more with a recovery of up to ten minutes between them, about equally long (each block of a two-block session counts), or all with the same recovery (a pyramid or a ladder), or three or more of any length when the levels are far apart. A progressive run, a negative split, a tempo finish, the block between a warm-up and a cool-down, and a trail run or a run/walk plan with walking breaks give none. The limits are known and kept in `intervals.shapes.test.ts`: hills and a rolling road are not told from 2 min / 2 min repeats by speed alone (a rolling road of ±15% is read as repeats; ±8% is not), a hill repeat on foot is read by its faster jog down and not its slow climb, an effort that touches the start or the end of the recording is dropped (a workout with no warm-up loses its first rep), and a fartlek of varied surges at a moderate contrast is not found. Up to eight are
numbered buttons as wide as the lap was long, at least a finger wide; more are a proportional bar (a number in a segment only
where it fits) with the chosen lap's name, duration, pace or speed and heart rate in a line under it, one stop in the tab order
with Left and Right (and Home and End) stepping from lap to lap, so Up and Down still scroll. Choosing a lap zooms the timeline to it. The interval is set by dragging across the plot (a mouse or pen, with a hint "Drag to zoom"; a finger scrubs as before and
selects after it is held still for 0.4 s and then dragged, "Hold, then drag, to zoom"; the range is washed while dragged, applies on release, Escape drops it, and a Reset
chip returns to the whole activity), or by a brush directly under the plot, over a small overview of the whole activity drawn from
the measure the sport is read by (pace for a run, power for a ride, then heart rate, cadence and the terrain; one that never moves is passed over):
drag an end (by how far it moves, so a grab off its centre does not jump), the window or the empty track; each end is a slider with named values ("Start 12 min 30 s"),
which keeps the keyboard's way to the selection, and a disclosure under it ("0:00 to 6:13:37 · Set by time") sets either end by typed time. Each handle's hit area is
44 px wide and slides outward from the other when the two are closer than that, so both stay grabbable for a four-minute rep in a seventy-minute run. The plot lets a vertical drag
scroll the page. Measures a file holds with nothing to draw (all missing, or one value throughout) have a dashed chip that says "no data" and no row. The summary gives each measure's average and its
typical range, and a pace or speed is a table of its own, whose caption says its average is the distance over the moving time, the figure the header, the interval's tiles and the readout also give. From 1100 px the
interval's tiles stand in the column beside the timeline, below the figures, while a part of the activity is selected. On a phone the moving time and the two key figures are a strip directly under
the title, then the timeline, then the other tiles, and the readout stays under the header while the rows scroll past (from 360 px).
An activity whose recording is not kept is its summary, splits and bests, with one note after them and the file offered again as a quiet action. Opening a 6-hour ride at 1 Hz with
five measures, building every row's columns and paths, takes about 15 ms here (budget 40), a brush step about 10 (budget 25) and a
cursor step a fraction of a millisecond (`workbenchChannels.perf.test.ts`, `timeSeriesModel.perf.test.ts`); the heavy figures
follow the brush through `useDeferredValue`, and the rows are not redrawn when the cursor moves.

**Activity page: the route tile.** The route is a tile about 160 px tall, drawn at the track's true aspect, with the start a ring and the
finish a dot (shapes, not colours). Where the activity's readings are on the device and the pace varied (the 10th to the 90th percentile
differ by 5% or more) the line is coloured by pace on a ramp from the neutral grey of secondary text (slow) to the pace green (fast), kept apart for protan, deutan and tritan vision (`channelTokens.test.ts`), with a thicker stroke the faster it
was, and keyed "Slower, Faster"; a route that held one pace is the sport's colour with no key. The outline carries no time or distance by design, so each
segment stands for the share of the distance that the path's length gives it (`routePace.ts`): a guide to where the pace was high or low,
read from the trace already on the device, and nothing is sent.

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
and otherwise it gives the easy and hard shares ("60% of your running time with heart rate was easy (heart rate zones 1 and 2),
and 10% was hard (heart rate zones 4 and up)."). The shares are of the time with a reading, so the sentence says "with heart rate",
"with measured power" or "with a pace reading". Easy is zones 1 and 2 and hard is zone 4 and up for every measure
(`EASY_THROUGH`, `HARD_FROM`), and the sentence names the measure ("pace zones 1 and 2"), since pace, heart rate and power
cut their zones from different references and an easy share is not comparable between them. The period before is cut by the same estimated zones as the period on screen, so the two are
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
The ratio (`kappa`) and its error are read from the blocks of the days both sports were done in, widened by eight weeks
each side (`matchedSpan`, `MATCH_SLACK_DAYS`): a sport trained for months before the other began would otherwise be set
against its own earlier state, not against the other sport. The slopes and their points stay every block. Sports done more than
sixteen weeks apart, or with fewer than three activities of either sport in the shared stretch, have no ratio. `balanceSensitivity.test.ts` pins how far the Balance verdict moves with the period chip and
five kilograms of typed body mass, so a flip of the lean is a deliberate change.
The grade chart's extra durations and the level target use it too, so the ride's grade and the "Ride X W" target
share one conversion. Because it is the library's, adding files can shift older equivalents (the calibration
refits over everything), where a period's own check moved only with that period. A ride without a power meter is
the exception to period independence: its watts come from a bike model fitted over the period's own
power-meter rides, so those watts, and the pace they are worth, can still differ by period. Whether such a ride's
point counts at all is the library's call (`HeartRateJudgement.rideGate`, built by `rideGateOf` in
`digest/estimatedRide.ts`): for each curve duration a robust line (Theil-Sen, refitted without the points under
the tolerance, never read beyond the fitted watts) of the heart rate of the trusted power-meter rides on their
watts, and an estimated window counts toward the bests, curves, thresholds, records and trends only if its mean
heart rate is at least `ESTIMATED_RIDE.minShare` (90%) of the line at its watts. A window with no heart rate, or
at a duration with no line, is unbacked: it drops at a duration the library has measured (a measured point makes
every shorter duration measured, since the envelope copies it down), and elsewhere it stands at its own duration
only. The monotone envelope is built from measured and backed points alone, and an unbacked one is placed on the
finished curve where it beats what is there, so it never fills a shorter duration, and it is kept only at or under the finished curve at the nearest shorter duration
with a value (the records likewise), so the curve stays non-increasing and an estimate never reads higher than a
measured effort, whatever the unit (W/kg with dated masses) or the period. The trend and the records read it the same way. Fewer than 6 power-meter rides with heart rate give no
gate and nothing changes. The line is in absolute watts, so a change in mass moves a virtual ride's watts against
it slightly. A virtual ride's own heart rate is taken as recorded: neither set-aside path judges a ride whose watts
are the estimate in doubt. Only measured rides' set-aside heart rate is left out of the line. The judgement and
`combine` fit the gate once, without the rides whose heart rate reads low across the whole activity, judge against
it, and rebuild it once more (and the curves) if that set more aside: one rebuild, not a fixed point, and the gate
is null if too few rides are left. It is a combine-time rule on the digest's `terms`, so `MODEL_REVISION` is
unchanged. Periods, trends, the previous period and records all take the library's gate, so they agree.
Changing the period does not judge again. The reference it was judged against is the library's, which can differ from a
period's own figure, so the notes on a set-aside heart rate cite it ("under 70% of your reference heart rate across all your
activities (200 bpm running)", on How sure is this? and on the activity), and cannot seem to contradict the period's. With too
little to describe, the section has no heading and "Time in zones: needs 3 activities with heart rate, or a threshold
pace entered on Profile, and 1 hour of them." joins the "Not enough yet" list.

**Bars.** `ZoneTimeChart` is a `ChartFrame` with one band for each measure: its label in capitals with the easy and hard
shares at the right ("31% easy · 28% hard"), the bar across the full width with rounded outer ends and a 2 px gap between
segments, the share inside each segment where it fits at display size, and under each segment its number and name ("2 Endurance")
where they fit, or its number alone where the segment is at least 20 px wide. Under the bars a key reads Easy, the five
steps numbered, Hard. A segment is a step of the sport's five-step zone ramp (`--zone-1` to `--zone-5`, aliased for each
`data-sport` from `--zone-run-n` and `--zone-ride-n`), and its text takes that step's ink (`--zone-ink-n`). The ramp darkens with
effort in light and, in dark, grows more luminous at full saturation without paling. `zoneRamp.test.ts` checks it from the tokens: every step keeps 3:1 against the card
and the page, its ink 4.5:1, and neighbouring steps stay apart in CIEDE2000 (at least 7 in light and 5 in dark, where every step stays saturated) for normal
colour vision and for protanopia, deuteranopia and tritanopia. The number, the name and the table say which zone is which, so colour is never the
only cue. In forced colours every segment is the highlight colour with its text in the highlight's own text colour. The
figure is named by every bar read as text ("Heart rate: zone 1 12%, zone 2 64%").

**Zones do not depend on the period.** The references that estimated zones are cut from are the library's, whatever
period is picked: the library's judgement, taken over every visible activity once (`SessionState.zoneEstimates`, from
`HeartRateJudgement`). A heart rate is the reference heart rate, the highest value that several separate days reached
over the last three years. A pace or power is the fit over the half year before the activity's week (`thresholdTimeline`),
so an activity is cut by the athlete's fitness then; where that half year holds no fit the newest within a year stands
in, dated in the table ("up to Mar 2025"), and beyond a year there are no pace or power zones and a line says what would
give them. A dated setting the athlete entered still wins on the date it is in force, so each activity is cut by the
value in force on its own day, and the library's estimate stands where nothing was entered. Profile, the activity page and
the sport page's time in zones all read it, so one activity has the same zones, and the same shares, under every period.
Profile names where the max heart rate comes from ("201 bpm, the highest you reached on 3 separate days since Mar 2023.
Is that right?") with a Set control that opens the dated max heart rate form to the figure. The reference
heart rate is one number too: the library judges heart rate against it (`HeartRateJudgement.referenceHr`), and every
period's analysis reports and judges its efforts against it (`CombineOptions.references`), so Profile, How sure is
this? and the set-aside note all say the same running and cycling figure. A period's own threshold, the sport page's
figure for recent form, is still the period's.

The thresholds and reference heart rates are the library's as a whole, so they sit at the library's best:
a period far from the athlete's peak, an older one or a detrained one, is cut from the library's thresholds
and not from its own best efforts. Adding files can move
the library's thresholds, and with them the zones of older periods. The time in zones is the time spent
against the peak-based zones, the same in every period.

**Period maths.** Each activity's digest distribution (seconds per 1 bpm, 5 W or 0.05 m/s bin) is cut by that
activity's own zones, so a period can hold activities with different zones (a threshold entered during it, or a
body weight that changed an estimated ride threshold). A heart rate or a power is a whole number, so
the reference is rounded to the number Profile shows (`zonesAt`: 187.6 bpm is 188 bpm). Heart-rate zones are cut on whole-number edges (`zonesFor`: the first whole number at or above the cut, so 0.6 of 219 bpm is 131.4 and
the zone above starts at 132), and a bin of one beat is never split. Power edges are moved to the nearest 5 W, the step of the power bins (at most 2.5 W from the cut; 0.55 of 201 W is 110.55, so 110 W), so no bin straddles an edge. A reading is in the zone it is at or above the floor of
and below the ceiling of, as on the activity page, and the Profile ranges are written from the same edges, so they agree. A pace cut is moved to the nearest 0.05 m/s, the step of the speed bins, so no speed bin straddles an edge either. The session keeps the period's and the previous period's result (`ZoneTimeCache`) until a
digest, a dated setting, the masses or the analysis changes, and 2,000 activities take about 12 ms
(`periodTime.perf.test.ts`).

## Level bands

The level ladder on the sport pages draws the five age-grade levels (Recreational, Local, Regional,
National, World) as neutral bands on one x-scale. The bands are the canvas, so sport colour only ever means
"this sport": a dot or a ring in the sport colour sits on the neutral bands. Each band is the ink at a rising alpha,
so every step is a deeper wash than the one below it, in light and dark, and a band is named in words as well as
tinted. In dark the steps are wider, so two bands with one between them differ by at least 1.3:1 and the secondary text still reads on the
darkest. `levelTokens.test.ts` pins the values and the order.

| Token       | Light       | Dark        | Use               |
| ----------- | ----------- | ----------- | ----------------- |
| `--level-1` | `#0e111606` | `#eef0f308` | Recreational band |
| `--level-2` | `#0e11160d` | `#eef0f315` | Local band        |
| `--level-3` | `#0e111614` | `#eef0f323` | Regional band     |
| `--level-4` | `#0e11161d` | `#eef0f32f` | National band     |
| `--level-5` | `#0e111626` | `#eef0f339` | World band        |

**Shape language.** A recorded grade is a solid dot ringed in the card colour. An estimated grade is a ring over a
translucent band for its 90% range, never a dashed line. On Balance's meter the best estimate is a ringed dot and the range a translucent band behind it.

## Fitness at the same heart rate

The finding that leads: whether the athlete is slipping, holding, recovering or back at one heart rate, against their own
earlier level. The analysis is in [design/fitness.md](design/fitness.md); this is how it shows.

**Where.** A "Your fitness" section above the balance on Balance, and the same card above the threshold on a sport's page
(without the sport's name, which the title says). One card for each sport that has a status, run first; the Ride page holds the ride's card
alone. A ride that is still waiting on its count is one line on Balance ("Ride fitness: not enough steady rides yet, 7 of 12", or "Ride fitness: too uncertain to call yet"
when there are enough rides but the range is too wide; linking to the Ride page), not a card of its own; its full card, with the count, is on the Ride page. A sport with no steady
run, or no outdoor ride with a power meter, has no card. The landing page's example shows the same
finding for the sample athlete as its second panel, below the drop zone so Add files stays on the first screen, (`LANDING_EXAMPLE.fitness`, checked against the sample's analysis by a test).

**The card.** It adds no heading, so a page's own title stays first in the outline (the region is named "Your fitness" and the card by its state). A sport edge on the left, the sport's name, and a **New** marker, "since the week of 12 Oct", when the state began to be
shown in the last six weeks. The state is a word at display size (Slipping, Holding, Holding below, Recovering, Back,
Improving, Improved) beside its own shape on a soft sport tile: a descending line, a level arrow, a level arrow under a bar, a
rise from a dip, a ring with a tick, a rising line, a rising line that ends in a level run. A state is never colour alone. Under it the analysis's own sentence, with
the heart rate, the range and "steady run" defined in place (Definition), the support line, and, when the athlete's own
seasonal swing was taken out of every run, a line saying so ("Allowing for your usual seasonal swing, up to 2.1% either side."). Right of it, the change as a
**track**: "before" at the middle, "slower" and "faster" at the ends, the 90% range as a band and a hollow ring for the
estimate (an estimate is a ring and a band, never a dash); a recovery marks the low it fell to, so the way back reads along the
track. The track's scale holds at 12% either way and widens in 4% steps. It is hidden from assistive technology; the sentence
carries the figures. A status that is waiting says so in a smaller word ("Not enough evidence yet", "Not enough recent evidence
yet"), without repeating the sentence's opener, and shows how many steady runs it has of how many it needs as a row of pills.

**See the evidence.** A native disclosure that mounts its panel when opened. The chart (`FitnessChart`) is named "Pace at 150 bpm
over time" and has a table twin: the level at four-week steps, each a hollow ring with its 90% range as a shaded band, the
level before the change as a labelled reference line ("Before February", with its value), a rule where the change began
("Began February", left out when the chart starts after it), and now as the largest ring with its value. The axis is tight to
the ranges, faster up. On a short phone (the page's own tighter-gaps test) the card gives up what the evidence repeats: the support line and the sport's tag go, and the marker keeps its word and not its week, so the balance's headline is still above the tabs at 320 by 640. Under it, in two columns on a wide screen: how it is measured, with the honest limit said once and in the sport's own spread ("A change of 8% it sees within weeks,
reliably. A change of 5% it usually sees within a few months, and not always."; a ride's smaller changes sit inside 2% to 5%
a ride, a run's inside about 4%; a ride is adjusted for heart rate only, a run for heart rate and climb); the steady runs it rests on as links to their activities (the newest eight,
then all on a press); and why some runs do not count. The level series is `FitnessStatus.series`: at most 20 points, no per-run data; a step is named by the weeks it is read over and dated by the last day it includes ("the 8 weeks to 25 Oct"). The copy is in the athlete's units: a run is read in whole kilometres, so for miles it gives the distance in miles beside them. The older weekly same-heart-rate section is the weekly view only: it is titled "Same heart rate, week by week" and claims no change for either sport, so there is one voice on the signal.

**Terms in a sentence.** A defined term in a paragraph reaches a pixel past its line (`p .definition__term::after`), as wide as
its text and as tall as the line. Consecutive lines of a sentence touch, so the 12 px reach a term keeps elsewhere let a press on
the lower half of one term open the term on the line below it. A term outside a paragraph keeps its 44 px target.
