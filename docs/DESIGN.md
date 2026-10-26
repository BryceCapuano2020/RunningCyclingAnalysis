# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | The answer and meter, a card per sport with its grade, evidence and cross-sport cards, one fitness trend for both sports on one scale, share sheet                                                                                                                                                                                                             |
| `#/run`, `#/ride`  | Run, Ride         | Threshold with its level ladder and the age grade of its best 20 min, a line of recent form, records in native units with the age grade of each and the change on the period before (runs also at 1 km, 1 mi, 5 km, 10 km and a half marathon), a weekly trend for 5, 20 or 60 minutes, the best-effort curve in pace or watts with the previous period dashed |
| `#/activities`     | Activities        | Every activity in the library, with its own sport and period filters, a sort (newest, oldest, distance, time or climb), month headings in date order and a count of the activities shown; a row opens its activity page, and a kept activity can be deleted from its row                                                                                       |
| `#/activities/:id` | Activity          | Moving time and the figures beside it, route shape, splits (runs), all-time records across the library, best efforts set here, skipped readings, the activities either side, and Delete                                                                                                                                                                        |
| `#/method`         | How sure is this? | Three-line answer, an on-page contents list, the energy view (a cross-check of the age-grade gap), age grades and levels, heart-rate check, virtual-power accuracy and how this works                                                                                                                                                                          |
| `#/profile`        | Profile           | About you (year of birth, sex), body and bike (weights, units), account (email, download, delete), original files (signed in), the saved library (signed in) or the activities kept in this browser (signed out), Remove activities                                                                                                                            |

Without a result every route except Profile and How sure is this? shows the landing page. How sure is this? shows its method, its age grades and its topics, with one plain line where each chart would be. On a reload of a visit that kept
results, it shows a restoring state in its place, with an **Add files** button, until the library
has replied, or, while the account is still loading, three seconds have passed, whichever is first.
A returning visitor is not asked to add their files again and is never left without a control. The
header holds the wordmark, the four tabs (once there is a result), one **Add files** button, a
**Profile** link (a person glyph with its word at every width, outlined as an account) and the
account control. While the account is still loading, the account control reads "Checking sign-in…",
and "Sign-in is unavailable right now" when accounts cannot be reached. Both hold the sign-in
button's width, so the header does not move. The busy strip is fixed to the bottom of the window
and appears only once a run has lasted about 400 ms, so a quick change never moves the page; on a
phone it sits above the tab bar. Nothing is held for the account: a file is analysed at once and saved
once the account is known.

The header stays at
the top of the screen while the page scrolls. On a phone (760 px and below) the tabs move to a bar
fixed to the foot of the screen, 48 px tall, with four equal tabs of 15 px labels. Where they do not
all fit, the bar scrolls and fades at its edge. The brand and actions share one row. Sign-in stays
one tap away on a phone as the Google mark alone, 44 px square, named **Sign in with Google** for
screen readers. Below 420 px **Add files** shows its plus only, and keeps its name for screen
readers. The account menu holds the email and Sign out; downloading data and deleting the account
are on the Profile page. A file dropped anywhere on the page is imported.

The header's sizes are custom properties in `tokens.css`. The header is 113 px on a wide screen and
69 px on a phone, and the scroll padding follows it, so a control that focus or Back brings into
view is not hidden under the header. The breakpoints are named once, in
`apps/web/src/ui/layoutBreakpoints.ts`: 760 px for the phone layout, 560 px for the compact one and
420 px for the narrow one.

**Touch targets.** A control is 40 px tall. On a phone, or where the pointer is a finger, every
control is 44 px (`--control-height` in `tokens.css`): the header's controls, buttons, the account
menu, the sign-in button, the link arrows, the disclosure summaries and the form fields. At 360 px and
below the tab labels shrink a step, so "ACTIVITIES" keeps its line in a four-tab bar. Where the tabs
overflow, the bar scrolls from the left and fades at its edge until it is scrolled to the end.

Each page sets the tab title to its name and the app name, such as "Run · RunningCyclingAnalysis",
and an activity by its own name. The first control on a page is **Skip to content**, which moves
focus to the page heading past the header. The app's routes are hashes, so it is a button, not a
fragment link.

Back and Forward return to the page the visitor left, where they left it. A page opened by a link
starts at the top. **Back to activities** on an activity goes Back when the list was the page before.
Run and Ride link to **How sure is this?**, which links back to **Back to Balance**; the footer links
to it too.

A deep link to a page that needs a result, with none on this device, stays where it is and says
"Add your files to see this page." A file import that then brings a result moves to Balance, the
home page. An unknown hash becomes Balance's hash, so the address names the page shown.

**Period.** Balance and the sport pages show one period, picked with the control under the answer: **Default**, 6 weeks, 3 months, 1 year or All time. The control's dates sit beneath it, with the count of activities in the period when some are left out. The Activities page has its own period, sport and sort, which start with the whole library. Its view is kept in the address (for example `#/activities?sport=run&sort=distance&page=2`), so Back returns to the same page of it. A period only narrows what is analysed: an activity outside it still opens from the list or a link. The control shows the pick the athlete made last. Each pick is answered by the worker in turn, and the control follows only the answer to the latest pick; while an import runs, it says the pick applies when the import finishes. How sure is this? names the dated period on one line, with no control. The period is a view preference: it is kept on this device, across Start over and sign-out.

**The sample athlete** is a 37-year-old man at 75 kg. It is analysed with that body and bike mass and that age and sex, whatever the visitor has entered, and it is never kept. While it is loaded, a banner above every page says so once. Its rides carry their running equivalents, so the age-grade trend shows them for a visitor with no age or sex. The landing example is drawn from the same sample, labelled illustrative: the balance meter, then each sport's level and grade with its band. A test pins its numbers to the sample's own analysis.

The landing page is the promise, the drop zone with **Choose files** (its one primary action) and
**See a sample athlete**, the example result, three steps, three sentences on how the result is worked
out with a **Full method** link, and the export guides. The drop zone's **No files yet? How to get
them** link moves focus to the guides below the steps. The guides are one tile per service. Each tile
is `aria-expanded` and controls the one panel, which opens on Strava. Opening a tile moves focus to
the panel's heading, so its steps are read from the top. The Strava guide has **Try the sample while
you wait** right after its wait step, when the page offers the sample. Under the panel, the no-files
and phone-only path says what to do without an export. Every guide ends with a source line and a link
to its own service's help. The source line reads "Steps from Strava's help, checked 24 October 2026;
menus can change." for Strava, which was read on its own help page. For the other four it reads
"Steps from published guides, checked ...", because their steps came from guides or search summaries,
not from the services' own pages.
`HowToGetFilesButton` opens the same guides in a dialog. It sits beside **Add rides** (or **Add runs**)
on an empty Run or Ride card, as a secondary action; Profile can wire it in the same way. The dialog has no sample button, since a sample would replace the visitor's data.
The notice region sits under the header and holds one summary per import, the sample banner while the
sample is loaded, then the sync, library and sample notices and any error. After an import, a dismissible summary says what it added, or "Nothing new"
when every activity was already in the library, and links to Balance, except on Balance itself. An
import made on Profile or Method moves to Balance, where its result is. Under that sentence it lists
what the import moved in the athlete's numbers: at most four items, thresholds first, then the balance,
then new bests at 1, 5, 20 and 60 minutes and at each run distance (1 km, 1 mi, 5 km, 10 km and a half marathon), counted only for workouts that were not on file before. A
first import, or one that replaced the sample, lists nothing, and nor does an import that added no run
or ride. Files the import skipped are one neutral line, "2 files skipped.", that opens groups: each
group names its files with a plain reason and gives one suggested action. The summary's first skipped
file is shown beside the line, and the summary is announced with the same count it shows. Each import
is compared with the result the worker last reported when it was sent, except a file released from a
wait for the library, which keeps the result that wait ended with. After a Start over, the next import is
compared with nothing. Deleting an activity clears the summary, since its count has changed. Each change
is also read aloud in words. Signed in, the sync status's completion says "Your numbers moved." instead.
On the Activities page, a quiet line says what is kept: "Kept on this device: 3 activities." signed out,
or "Saved to your account: 3 activities." signed in.

A user's Stop is neutral news, never an alert. It cancels the import in progress and keeps the result on
screen: "Stopped. Add your files again when you're ready." The stop may replace the summary of the
previous import with that neutral line, since the import it summarised was the one stopped. The worker
is replaced and the kept library reloads behind it.

## Colour

Ink and volt are the brand. Sport colours mark a sport: its data, its glyph, and the edge of its
card. They never colour text, and never generic chrome such as buttons, links, tabs or focus rings.
A sport's figure is set in ink, and its shape carries the colour. Status
colours always come with an icon and a label, so a warning never relies on red beside the run coral.

| Token                  | Light       | Dark        | Use                                                                        |
| ---------------------- | ----------- | ----------- | -------------------------------------------------------------------------- |
| `--surface-0`          | `#f5f6f8`   | `#0f1115`   | Page (paper)                                                               |
| `--surface-1`          | `#ffffff`   | `#171a20`   | Cards, inputs, chart plot                                                  |
| `--surface-2`          | `#eceff3`   | `#1e232c`   | Hover, tiles, tracks                                                       |
| `--border`             | `#e1e4ea`   | `#2a2f38`   | Card and table rules                                                       |
| `--grid`               | `#e9ecf1`   | `#232830`   | Chart gridlines                                                            |
| `--control-border`     | `#7f8694`   | `#6b7380`   | Input and button outlines (3:1 or better)                                  |
| `--text-primary`       | `#0e1116`   | `#eef0f3`   | Ink                                                                        |
| `--text-secondary`     | `#474f5c`   | `#b6bcc6`   | Supporting text                                                            |
| `--text-muted`         | `#5f6774`   | `#8d95a2`   | Captions, axis labels (4.5:1 or better)                                    |
| `--neutral-mark`       | `#474f5c`   | `#b6bcc6`   | Neutral data and reference marks                                           |
| `--neutral-band`       | `#474f5c24` | `#b6bcc629` | Neutral band fill                                                          |
| `--brand`              | `#c8f03c`   | `#c8f03c`   | Volt: marks the one primary action per screen                              |
| `--accent`             | `#0e1116`   | `#c8f03c`   | Primary button background (dark: volt, from `--brand`)                     |
| `--accent-contrast`    | `#c8f03c`   | `#0e1116`   | Primary button label (light: volt, from `--brand`)                         |
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
- Headings are condensed and upper case. The page title is 800 weight; section headings are 700.
- **Numbers are the hero.** The main number on a card is at least 48 px, condensed 800, with
  tabular figures (`.hero-number`). Supporting stats are 28 px or more (`.stat-number`).
- Small labels above a value use `.eyebrow`: condensed 700, upper case, wide tracking, muted.

## Layout

- **Cards only for things you can open or act on.** Sections are separated by space and a heading,
  not a border. A card has a 12 px radius, a 1 px border and no shadow.
- One primary action per screen, in `.btn-primary`: an ink button with a volt label in light, and
  a volt button with an ink label in dark, so it stands out on either page colour.
- A sport glyph (`SportIcon`) sits next to every sport name.
- Charts get a faint grid, 2.5 px lines with round joins, and an emphasised point: the latest value
  of a trend, or the 20-minute effort of a best-effort curve. The 20-minute effort is labelled with
  its value, such as "250 W", and the latest trend value with its window, such as "64%, last 2 weeks". Watts charts also fill the area under
  the line. Pace charts draw the line alone: pace has no zero to fill down to. Every chart has a
  visible title, and a value's label sits clear of its own line.
- The energy view's ratio chart on How sure is this? tints running coral above its line and cycling
  blue below it, so the side that is higher reads before the numbers do.
- **Evidence sits behind a disclosure.** On How sure is this? each chart is under a Show the evidence
  disclosure, and the claim it supports is in words above it. The chart mounts when the disclosure is
  first opened, so a closed section draws nothing.
- **In-page jumps are buttons, not fragments.** The contents list on How sure is this? moves focus to
  a section's heading, because a fragment would change the hash route.
- A sport page reads top to bottom: the threshold, its grade and level ladder for the best 20 minutes
  (the same grade line as the card), a line of recent form ("Last run Wed 14 Jan · 9 runs · 42.10
  km"), the best efforts, the week-by-week trend under the heading "Week by week", then the curve,
  headed "Pace curve" for running and "Power curve" for cycling.
- Sport pages use the athlete's units. Running is pace per km or mile, faster up; cycling is
  watts. Tooltips add the cycling W/kg. The Balance trend is the one chart that puts both sports on
  one scale: the age grade in per cent when the age and sex are known, else the energy rate in
  metabolic W/kg.
- **The default period** is the 84 calendar days (`DEFAULT_PERIOD_WEEKS` of 7) ending on the newest activity's day, when they hold a run and a ride. A day is counted in the device's local zone and runs from its first millisecond to its last, so an activity at 06:00 and one at 12:00 on the same day give the same window, and an older window never hides recent activities. It is clipped to the first activity's day, so a library shorter than 12 weeks is dated from its start. When those 12 weeks do not hold both sports, as with a 2015 run and a 2019 ride, the default is All time, and the control says why: "The 12 weeks up to your newest activity do not hold both a run and a ride, so this shows all time." The period is computed in `packages/core/src/period.ts`. Each fixed period is the same number of calendar days ending on the newest activity's day.
- A period's comparison is the same length before it, drawn as a dashed neutral line and named
  "Previous 6 weeks", "Previous 3 months" or "Previous year". All time has none. The Balance trends
  have no period comparison: each already spans the selected period.
- A trend is the best effort of the chosen length (5, 20 or 60 minutes; Balance uses 20) in a
  trailing window that ends each week. The window is a third of the period, at most six weeks, so a
  six-week period uses two-week windows. Every point's window lies inside the period. The title
  names the effort and the window. Each line steps from one Sunday to the next and breaks at a week
  with no value, and each Sunday has a marker. The latest value is labelled with its window, so it
  can differ from a card's best, which covers the whole period.
- On the Balance age-grade trend, a run is solid with a dot, as recorded. A ride is an estimate: it
  is graded through its running equivalent, as the cards grade it, so it is dashed with a ring at
  each week, its model range is a band, and the key says "estimated". Each grade is taken at the age
  on the day of its best effort. Without a weight, the Balance trend holds cycling: there is no ride
  line, ring, band, key or table column, and the chart says so. On an energy trend and on the sport
  pages, cycling is drawn as measured: a solid line with dots.
- A previous period is a thin dashed grey line (1.5 px). It appears only when it has values, and
  otherwise the chart says there were none.
- The balance meter spans the card row, so its centre is the gap between the two cards. Running is
  on the left and cycling on the right, in the order `SPORT_ORDER` gives (`apps/web/src/ui/sports.ts`):
  the cards, the meter, the landing example and the share card all follow it. The meter plots the
  age-grade gap in whole points, with the range as a band and the best estimate as a dot. Ticks sit at
  10, 20 and 30 points either side of the centre, and a lead past 30 is drawn at the end, marked "30+"
  ("30%+" in percent). The best estimate is printed over the dot as "6 pts". Its scale is the gap in
  points when both sports are graded, and the energy ratio in percent when they are not. The track has
  a 3:1 outline, the band a solid edge in its sport's colour, and the end labels name each sport with
  its glyph. The key under it gives the range in words: "Band: the ride's 90% range".
- The level ladder draws the age-grade bands on a 30% to 100% scale, with its labels as text beside
  the drawing. A run's grade, read as recorded, is a solid dot. A ride's grade is estimated, so it is
  a ring over an outlined band for its model range. The bands the grade falls in are filled in its
  sport's soft colour and named in bold: the band of its centre, or every band from the low end of a
  ride's range to its high end. Band edges are ticks. A marker past either end of the scale stays
  inside the track, outline included, and a chevron stands just outside that end; the key says the
  grade is below or above the scale.
- **The key sits under every ladder** as a figure caption, in words: "Solid dot: the grade of one
  recorded effort." for a run, and "Ring: estimated, with its range." for a ride. The shape is never
  the only cue.
- **A Balance card reads top to bottom:** the sport's name, the threshold as the hero number (its
  unit set at about 40% of the numeral), the threshold in plain words ("About the pace you could hold
  for a long, steady effort, estimated from your best 3 to 20 min efforts."), the grade line, the
  ladder with its key, the caption, then the best efforts, with the Flat note under them on a run.
  The grade line names the effort it grades: "Local · 64% · on your best 20 min, 6:37 /mi". A
  ride's line starts "Estimated", and its watts carry "estimated" when they did not come from a
  power meter. A run card that shows a Flat mark says what it means under its records, on every run
  card that has records, with or without a grade: "Flat pace: your pace allowing for hills, as if
  on level ground."
- **A threshold is checked before it is shown, and a refused one shows no number.** Two reasons, and
  each has its own words in the threshold's place. Missing efforts: fewer than four efforts from 3 to
  20 min, or none that reaches 1140 s (within 5% of 20 minutes); the place reads "Needs efforts between
  3 and 20 min". No threshold: the efforts are flat, the work capacity is below the least a rider or a
  runner has (3 kJ of cycling W′, or 15 m of running D′, which is 58.5 J per kg), or the threshold is
  not below the lowest of the efforts it was fitted to, since a threshold cannot be faster than an effort
  held; the place reads "Needs a harder effort between 3 and 20 min". The floors are far below the
  published work capacities, so they refuse only fits close to flat. A fit just above a floor is kept,
  and its threshold then sits close to the best 20 minutes, which is honest: about what was held. The
  ride's floor is the same at every body mass. The share card labels its threshold "Threshold pace, estimated from your best 3 to 20 min", printed in capitals. The line "About ... estimated from your best 3 to 20 min efforts" sits under
  a number only, and is left out with none.
- **A record's change on the period before** reads in words under its figure: "0:12 /mi faster than
  previous 6 weeks", or "8 W more than previous 6 weeks", or "Same as previous 6 weeks" when the
  figure has not moved. It is absent for All time. A record with no grade says why in its grade slot,
  such as "No age standard under 1 mile", so every row has the same cells.
- **Power is said to be measured or estimated on the page.** When a ride's watts were not measured by
  a power meter, the best efforts say "Power meters measured 2 of 5 rides. Watts for the rest are
  estimated." The line links to How sure is this?.
- **An activity page reads top to bottom:** the name, the sport, the day and start time (with an
  **Indoor** chip for a trainer ride), the route when it was kept, then the moving time as the hero, with
  the elapsed time under it when the file kept both. Distance, average pace or speed over the moving time,
  climb, average heart rate with the highest, and average power follow. An indoor ride reports no speed
  anywhere, since a trainer's speed is virtual rather than measured on a road. A ride without a power meter says so in a line beneath
  the figures: "Power here is estimated from speed and climbs. No power meter recorded it." Earlier and
  Later name the activities either side in the library, then links to the sport's records and to How
  sure is this?. Then the all-time records as chips, the splits, the best efforts set here, the skipped
  readings, and Delete. A ride with no power curve says why in a line: estimated power is made only on
  climbs, and a ride with no power data has none. A ride's bests and chips wait for the weight. An
  activity from before moving time was kept shows its elapsed time, and says so.
- **A list row reads the same figures.** The name, sport, day and start time, with the **Indoor** and
  skipped-readings chips, then the moving time, distance and climb, labelled, and the record chips. A
  ride's record chips wait for the weight, as its page's do. At the right sit the pace for a run, the
  speed for a ride, or the average power of an indoor ride with a power meter. The legs of one upload
  are a session: its bytes are hashed, so two uploads of one name are two sessions. Where the origin is not secure and
  there is no crypto.subtle, nothing is hashed, so the legs are not grouped and the import still reads. A session sits under
  one row that gives its total time, with the legs indented in the order they were ridden. This grouping
  applies only in a date sort, where a session's legs are next to each other. In a distance or time sort
  each leg is a row of its own. The time sort orders by the time each row shows, which is its moving time.
  Month headings group the rows when the list is in date order; another sort drops them, and at a page
  break a month heading repeats, so each page names its months. The page is counted over rows, so a
  session is never split across two pages, and the summary counts its activities.
  A removal made on an activity's page goes to the list, which announces it once, and the list's address
  drops the marker that brought the visitor. A notice or error from a removal clears when the visitor moves
  to another page, so Profile shows no old "Deleted ...". The list's own outcome also clears when its sort,
  filter or page changes.
- **Best efforts share one list,** `SportRecords`, on the Balance card, the sport page and the activity
  page: one row per record with one source size, built by `recordRow`. A run's own distance times, such
  as its 5 km time, are graded at the day it was run, and the activity page links their level to How is
  this graded?. A run's pace is marked Flat, which the note spells out; a ride's watts are marked Estimated unless a power meter measured them. When every
  record was set in one activity, that activity is named once under the list ("All set on Morning
  run, Mon 5 Jan"). Otherwise each record links to its own activity. A long activity name is cut
  short with an ellipsis, and its full name is the link's title and accessible name.
- **The cross-sport idea is a quiet section, not a card:** a glyph pair, its headline ("On foot, your
  ride is worth 4:10 /km"), and the ride's watts marked estimated when no power meter measured them.
  Its ride figures and its table wait for the weight, as the cards' do. The evidence card is a card
  only for a gap with an action; good news is a quiet line with no heading.
- **Only the drop area is dashed.** On the landing page the example beside it is a solid frame, with
  its numbers at the 48 px hero size, so the two never read as two drop targets. The export guides
  are a tile grid that opens one service's panel, not a stack of full-width panels.
- **The Balance footer is one line** that names the age and the standard, "Graded for a 37-year-old man on the USATF road standards.", adds a sentence on rides only when a ride is graded, and ends "A level, not a ranking." The full credit, with the authors and licence, is on How sure is this? and the source lines of the sport pages and the record list, not on Balance.
- **On a phone, the two grades sit under the meter** in one line, "Running 64% Local / Cycling 58% Recreational". The cards say the same, so the line is hidden from assistive technology, and it is hidden at wider widths, where the cards sit side by side.
- Phone first: every page is designed at 390 px, with a 16 px gutter and no sideways page scroll.
- **Tables that cannot fit become lists, without a scroll.** From 480 px a `<table>` with a caption
  and scoped headers. Below 480 px an `<ol>` with one `<dl>` per row, holding the same values. Both
  are in the page, and a media query shows exactly one at each width, so the accessibility tree
  holds one representation. Never set `display: block` on a table element, which drops its table
  semantics. The splits table on the activity page is the first use; record any new one here.
- **Bars start from zero.** A bar's length is the value relative to the best known one, so the best
  fills its track. A row with no known value has no bar and cannot be the best.
- **The best row says so in words.** A small `.chip` reads "Fastest" beside its value, and the value
  is bold, so the mark does not rest on colour or weight alone.
- **Missing values** show a dash, with words for a screen reader that say why: "Not measured" for a
  time the device did not record, or an implied speed over 12.5 m/s that no run reaches; "Not
  available" for a grade; "No altitude"; or "No heart rate".
- The share image is a dark canvas card on ink, as a square (1080 by 1080, "Square (feed)") or a tall
  story (1080 by 1920, "Tall (story)"). Share opens a sheet beside the answer: a preview, the choice of
  shape, the note that it is made on this device, and one action. The action reads "Share file" only
  when the device's share sheet can take this image; otherwise it reads "Save image" and downloads the
  PNG. The PNG is encoded once, for the preview, so the share starts within the tap. Until the chosen
  shape is drawn, the action reads "Preparing…" and is held: a tap does nothing. The sheet's
  action is outlined like the other buttons, so the page's one primary action stays Add files. The
  file is named by the period's dates, such as `balance-2025-05-12_2025-08-03-square.png`.
- The card holds the brand mark, in the two sport colours, and the app name in volt. Under the
  headline sits the lead in one line, "Running grades 6 points higher than cycling", the same words
  the meter reads. Then the balance meter, each sport's threshold, "Threshold pace, estimated from your
  best 3 to 20 min", with its W/kg and its level, such as "Local · 64% on best 20 min", under the
  figure; the period; the heart-rate caveat as a starred line when there is one; the footnote; and the
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

- **Balance is neutral.** Say which way it leans ("Your balance leans toward running"), never
  that a sport is a limiter, a weakness or holding you back.
- **The balance is stated as a grade gap.** With both grades: "Your running grades 6 points higher
  than your cycling, on your best 20 min in each." When the gap's range spans zero, the best
  estimate is named and the range is given: "On the age-grade best estimate, running grades 4 points
  higher, but the range (−2 to +10 points) includes zero, so the two are in balance." When the best
  estimate is level: "On the age-grade best estimate, running and cycling grade the same, and the range
  (−2 to +2 points) includes zero, so the two are in balance." Never "ahead of". Without an age and
  sex, the energy ratio stands in, as in "Over 20 min, your running is about 12% higher than your
  cycling once both are put on the same energy scale." The prompt says that adding them shows the
  balance in points and levels.
- **Grades read as whole percents, floored.** `formatGrade` in `apps/web/src/ui/gradeFormat.ts` writes
  every grade on the cards, the ladder and the balance gap, so 64.5% reads as 64%, and a grade never
  reads above its level band: 89.6% is 89%. The gap is the difference of these whole percents.
- **Lead with the finding**, in the words an athlete uses: pace, watts, time, distance.
  "Energy rate" and "W/kg" belong on How sure is this?, not on the surface. A plain phrase such as
  "on the same energy scale" may explain the balance.
- **How sure is this? opens with three lines**: what is recorded ("Your best efforts are recorded."),
  what is estimated ("Thresholds, levels and the balance are estimates from N runs and M rides.") and
  how far to trust it ("These checks show how far to trust them.").
- **Define a term once, in plain words, where it first appears** on How sure is this?: the energy
  rate, the 90% range and the median each get one plain sentence. Technical detail (efficiency
  constants, citations, the bike model, the ISA atmosphere) sits behind More detail.
- **Durations are written one way.** Effort lengths are numerals with min: "5 min, 20 min or 60 min".
  Seconds are numerals with s: "10 s". Periods are numerals with the unit in full: "6 weeks", and a
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
  run.fit, so it was not counted twice." Sport names are words: "A walk is not a run or a ride, so it
  was left out on purpose." Nothing says "worker", "deployment" or "re-import". The one place "UTC" is
  said is How sure is this?: its trend's weeks are UTC weeks (`digest/trend.ts`), so the page says so.
  The words for a skipped reading are `flagSentence` and its count `skippedReadingsText`, both in
  `apps/web/src/ui/analysis/flagCopy.ts`. The activity page and the list use them, so the core's English is never shown.
- **Times are the viewer's own.** A limit's reset reads in local time: "It resets at 4:00 PM, your
  time.", never UTC.
- **Every number names its source**: the activity that set it, with a link to that activity.
- **Evidence gaps say what to do, on the card itself**: one plain sentence under the gap, saying how to
  record a hard, steady 20-minute effort with heart rate on, or how to add heart rate to a file. Its
  link is "How sure is this?", to the method page, which explains the check. Good news has no how-to.
- **Export guides cite their sources.** Each guide's steps name only what the sources cited beside
  them in `apps/web/src/ui/exportGuides.ts` support. The source line says where the steps came from,
  decided by the guide's `verified` flag, so a guide never claims a help page it did not read. Guides
  use curly quotes, and say "zip", never ".gz".
- Dates are friendly: "Tue 3 Jun", with the year only when it is not this year. A range of months
  gives the year on both ends when the years differ, or when either is not this year: "from Mar to
  Oct", "from Mar 2023 to Oct 2026".
- **A period's dates always carry the year**, as in "12 May – 3 Aug 2025" or "3 Aug 2024 – 2 Nov 2025", so a span reads without the current date. The period control, the Balance caption and the card's period line show the same dates.
- **Empty states name the period.** When a sport has nothing in the period on screen, the page says which dates it is missing it between and how many the library holds in All time, with one tap to show All time: "No rides between 12 May and 3 Aug 2025. You have 14 rides in All time." The same sentence heads the empty sport on Balance and the sport page, so the wording is one. A sport the files do not have says so, and offers the file chooser as a secondary button. The empty sport is a short prompt rather than a card, so it takes little room beside the sport that has activities. An activity list with nothing to show says the same way, with its dates. Empty sections and links to empty pages are left out, so a one-sport file shows no comparison slots.
- One "How sure is this?" link per card at most.
- **A level says how it is graded.** A level's grade line may link to its age grades with How is this
  graded?, which opens How sure is this? and focuses the grades heading, since a fragment would change
  the hash route. The request lasts for that one navigation only: any later route change drops it.
- The app grades, it never ranks: no percentiles, no "top X%", no composite score across sports.
- **Flat pace, and grade for age only.** Every running pace worked out as a flat pace is called
  "flat pace" in charts, axes, tables, records and copy. Its record mark is "Flat", and its note reads
  "Flat pace: your pace allowing for hills, as if on level ground." "Grade" means an age grade and
  nothing else.
- **Run distance records.** A run keeps its time at 1 km, 1 mi, 5 km, 10 km and a half marathon. A
  run added before the half marathon was recorded gets it only when it is added again: the library
  is not re-digested, and the model revision does not change.
- **Levels, not ranks.** A grade names its band: Recreational, Local, Regional, National or World,
  written the same way in sentences, labels and this document. Never call a level weak, a limiter
  or a weakness, and never give a percentile.
- **Runs are read as recorded; rides and thresholds are estimates.** A run's grade is the grade of
  one recorded best effort, so its line reads "Local · 64%" with no estimate word, and its pace is
  marked Flat and noted: "Flat pace: your pace allowing for hills, as if on level ground." A ride's grade
  is estimated through its running equivalent, so its line starts "Estimated", it shows its 90% range in
  brackets, and a range that crosses a band names both levels ("Local to Regional"). The card's caption
  says the bracketed range is the 90% range. A ride record says the grade is "Estimated through its
  running equivalent" in full, because a row stands on its own. Thresholds are always estimated. The
  Method page is the one place that explains the estimates.
- **Every grade names its standard.** Cards and the ladder's label say "on the USATF road
  standards". The full credit, with the authors, licence and a link, is on the sport pages' source
  lines, the record list's source line and How sure is this?.
- **Each effort is graded at its own date**: the age on the day of the activity that set it, counted
  from the birth year alone. A ride is dated by its own best ride at that duration. Cards say the
  age they used ("Graded at age 40"). The pages that carry the full credit say "Age is counted from
  your birth year on the date of each effort." On the Ride page the source line also says that a
  ride's range is its model range.
- **Removing data asks first.** Removing every kept activity and turning off kept original files
  each open an alert dialog that names what goes and what stays, with Cancel focused. Removing one
  saved activity opens its confirmation under its row, with a **Delete** button; a summary
  kept in this browser gets a neutral card, and an original kept in the account the red one. Every
  removal's confirm button is the one destructive button, from `ConfirmActions`. The account's
  deletion needs the typed email address.
- **A missing year of birth or sex asks once on each page that grades,** Balance, Run and Ride. On
  Balance a muted line says the balance in points and levels needs them, and a secondary button, "Add
  year of birth and sex", opens Profile. On Run and Ride the best efforts say "Age grades need your
  year of birth and sex." with that link. The cards show no grade and no prompt in that case. Sex is never preselected; "Prefer not to say" is
  stored as no sex.
- **Weight is never filled in for you.** Setup's Skip leaves the body weight blank, and Profile
  shows it as not entered. Without it, a ride's figures wait: the ride's threshold, its W/kg and
  watts, its grade, its records and its trend are held, and the card, the cross-sport idea and the
  Ride page say "Add your weight on Profile to see ride figures." with a link to Profile. A run's
  figures still show, and the balance waits, so the share sheet is not offered, while no weight is
  entered. The Balance cards, the Ride page, the cross-sport idea and How sure is this? show no ride
  figure worked out from the placeholder weight. How sure is this? holds its energy view and its
  virtual power check, and draws only the running blocks of its heart-rate chart, with the prompt
  beneath. The request for a weight is written once, in weightCopy: the linked prompt Balance and
  Method show, the plain note a dialog shows, and the purpose a Profile field hint shows. The activity page holds a ride's bests and record chips the same way, and says "Add your weight on Profile to see ride figures." in their place.
- **Each results page says what it is based on,** at its foot, in one line: "Based on 165 lb, age 37,
  man. Change on Profile". It names only the parts the athlete has set, in their units, and it links
  to Profile. It is on the Balance, Run and Ride pages only, and the sample has its own persona and
  no such line.
- **A figure's scope is named by the period.** A window is named "in this period", as in "Based on 6
  runs in this period." Under All time there is no period, so the same line reads "in all your files".
  Method's lede names its dated period in brackets instead, as "(12 May – 3 Aug 2025)".
- **Units follow the browser's language:** imperial for en-US, en-LR and my-MM, metric elsewhere.
  A new account takes the language of its sign-in request the same way. The Units choice comes
  first in setup, and a unit typed after a weight ("150 lb") is read as typed.
- **The export may hold a null body mass,** written as null, for a weight that was never entered.

## Accessibility

Unchanged by the redesign: every chart has a table view, colour is never the only cue, controls are
at least 40 px tall (44 px on a phone or for a finger), focus is always visible, live regions stay mounted, and motion respects
`prefers-reduced-motion`.
