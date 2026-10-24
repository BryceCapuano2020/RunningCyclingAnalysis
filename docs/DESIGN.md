# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                                                               |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | The answer and meter, a card per sport with its grade, evidence and cross-sport cards, a trend per sport in its own units, share image                                                                                              |
| `#/run`, `#/ride`  | Run, Ride         | Threshold, records in native units with the age grade of each (runs also at 1 km, 1 mi, 5 km and 10 km), the best-effort curve in pace or watts with the previous period dashed, a weekly trend for 5, 20 or 60 minutes             |
| `#/activities`     | Activities        | Every activity, newest first; a row opens its activity page                                                                                                                                                                         |
| `#/activities/:id` | Activity          | Summary, route shape, splits (runs), records earned across the library, efforts set here, data issues                                                                                                                               |
| `#/method`         | How sure is this? | Ratio chart, both sports on one energy scale, heart-rate check, virtual-power accuracy, age grading, methodology                                                                                                                    |
| `#/profile`        | Profile           | About you (year of birth, sex), body and bike (weights, units), account (email, download, delete), original files (signed in), the saved library (signed in) or the activities kept in this browser (signed out), Remove activities |

Without a result every route except Profile shows the landing page. The header holds the wordmark,
the four tabs (once there is a result), one **Add files** button, a **Profile** link (a person glyph
with its word at every width) and the account control. Below 360 px the brand takes its own row and
the actions the full width, so they wrap to two rows rather than three. The account menu holds the
email and Sign out; downloading data and deleting the account are on the Profile page. A file dropped anywhere on the page is imported.

The landing page's step 1 has a **How to get your files** button. It moves focus to the export guides
below the steps, one closed details per service; guides whose steps could not be checked from the
vendor's own page say so.
After an import that added activities, a dismissible notice under the header says what it added and
links to Balance, except on Balance itself. Under that sentence it lists what the import moved in the
athlete's numbers: at most four items, thresholds first, then the balance, then new bests at 1, 5, 20
and 60 minutes, counted only for workouts that were not on file before. A first import, or one that
replaced the sample, lists nothing, and nor does an import that added no run or ride. Each change is
also read aloud in words. Signed in, the sync status's completion says "Your numbers moved." instead.

## Colour

Ink and volt are the brand. Sport colours mark a sport: its data, its glyph, and the edge of its
card. They never colour generic chrome such as buttons, links, tabs or focus rings. Status
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
  of a trend, or the 20-minute effort of a best-effort curve. Watts charts also fill the area under
  the line. Pace charts draw the line alone: pace has no zero to fill down to.
- The Method-page ratio chart tints running coral above its line and cycling blue below it, so the
  side that is ahead reads before the numbers do.
- Surface charts use the athlete's units. Running is pace per km or mile, faster up; cycling is
  watts. Tooltips add the cycling W/kg.
- A period's comparison is the same length before it, drawn as a dashed neutral line and named
  "Previous 6 weeks", "Previous 3 months" or "Previous year". All time has none. The Balance trends
  have no period comparison: each already spans the selected period.
- A trend is the best effort of the chosen length (5, 20 or 60 minutes; Balance uses 20) in a
  trailing window that ends each week. The window is a third of the period, at most six weeks, so a
  six-week period uses two-week windows. Every point's window lies inside the period, and a value
  holds until a faster effort or the window passes.
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
  the drawing. A run's estimate, from one activity, is a solid dot in the sport's colour. A ride's
  estimate is a ring over an outlined band for its model range. Band edges are ticks, not fill.
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
- The share image is a dark canvas card on ink, as a square (1080 by 1080) or a story (1080 by 1920).
  It holds the brand mark and app name, the sample badge for sample data, the headline, the balance
  meter, the running and cycling threshold estimates with W/kg, the period, the heart-rate caveat
  when there is one, the footnote and the site origin when it is public. Its colours are the dark
  tokens copied in `apps/web/src/share/cardColors.ts`.

## Copy

- **Balance is neutral.** Say which way it leans ("Your balance leans toward running"), never
  that a sport is a limiter, a weakness or holding you back.
- **The balance is stated as a grade gap.** With both grades: "Your running grades 6 points higher
  than your cycling, on your best 20 minutes in each." When the gap's range spans zero, the best
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
  "Energy rate" and "metabolic W/kg" belong on How sure is this?, not on the surface. A plain
  phrase such as "on the same energy scale" may explain the balance.
- **Caveats become chips and shapes.** Draw a range instead of writing it; a caveat is a chip with
  an icon that links to the detail.
- **Splits say what happened when they are missing**: "Splits were not kept when this run was added."
  for a run whose digest predates splits, "This run is too short to split." for one too short for a
  whole unit, and "Splits are kept for runs up to 500 km." for one past the limit. When the worker
  cannot answer, the page says "The splits could not be loaded. Open this activity again to retry."
- **Every number names its source**: the activity that set it, with a link to that activity.
- **Evidence gaps say what to do**: what to upload or record, and what it would sharpen.
- Dates are friendly: "Tue 3 Jun", with the year only when it is not this year. A range of months
  gives the year on both ends when the years differ, or when either is not this year: "from Mar to
  Oct", "from Mar 2023 to Oct 2026".
- One "How sure is this?" link per card at most.
- The app grades, it never ranks: no percentiles, no "top X%", no composite score across sports.
- **Levels, not ranks.** A grade names its band: Recreational, Local, Regional, National or World,
  written the same way in sentences, labels and this document. Never call a level weak, a limiter
  or a weakness, and never give a percentile.
- **Every grade is an estimate.** A run's grade comes from one activity's grade-adjusted pace, so
  it is written "Estimated age grade". A ride's grade is estimated through its running
  equivalent, and it shows its model range rather than one number.
- **Every grade names its standard.** Cards and the ladder's label say "on the USATF road
  standards". The full credit, with the authors, licence and a link, is on the Balance source line,
  the record list's source line and How sure is this?.
- **Each effort is graded at its own date**: the age on the day of the activity that set it, counted
  from the birth year alone. A ride is dated by its own best ride at that duration. Cards say the
  age they used ("aged 40"). The three pages that carry the full credit say "Age is counted from
  your birth year on the date of each effort." On the Ride page the source line also says that a
  ride's range is its model range.
- **Removing data asks first.** Removing every kept activity and turning off kept original files
  each open an alert dialog that names what goes and what stays, with Cancel focused. Removing one
  saved activity opens its confirmation under its row, with a **Delete** button; a summary
  kept in this browser gets a neutral card, and an original kept in the account the red one. Every
  removal's confirm button is the one destructive button, from `ConfirmActions`. The account's
  deletion needs the typed email address.
- **A missing year of birth or sex asks once,** on the Balance page, in a quiet line that links to
  Profile. The cards show no grade and no prompt in that case. Sex is never preselected; "Prefer
  not to say" is stored as no sex.
- **Weight is never filled in for you.** Setup's Skip leaves the body weight blank, and Profile
  shows it as not entered. Add it to compare a ride with a run. Until the results screens gate on it,
  their ride figures use a placeholder of 75 kg. The share card leaves out the ride estimate and the
  balance while no weight is entered.
- **Units follow the browser's language:** imperial for en-US, en-LR and my-MM, metric elsewhere.
  A new account takes the language of its sign-in request the same way. The Units choice comes
  first in setup, and a unit typed after a weight ("150 lb") is read as typed.
- **The export may hold a null body mass,** written as null, for a weight that was never entered.

## Accessibility

Unchanged by the redesign: every chart has a table view, colour is never the only cue, controls are
at least 40 px tall, focus is always visible, live regions stay mounted, and motion respects
`prefers-reduced-motion`.
