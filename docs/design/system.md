# The visual system

Paper and ink. The values are `apps/web/src/styles/tokens.css`; this page says what each is for, and the tests named at the
end keep the two in step. Pages and charts are in [DESIGN.md](../DESIGN.md); the level bands (a colour table of their own) stay
there under Level bands.

Owner calls this system keeps: run and ride each have one colour; one primary action a screen; Balance is the level triangle; fitness sits above Balance; the answer is the one thing on a page with weight. Stage V (November 2026) replaced the
volt, card and dark-mode system with this one.

## Rules

- **One theme.** The page is paper in every system setting. No `prefers-color-scheme` rule, no `data-theme` hook, no second
  value for a token. `<meta name="color-scheme" content="light">` keeps the browser's own controls on paper too.
- **No boxes.** No cards, shadows, gradients, glows or coloured panels. A section is a heading and a hairline. A list is rows
  between hairlines. The only outlined things are controls.
- **The removal test.** Every element must carry information the page would lose without it. A label that repeats its
  heading, an icon in a circle, a chip, a badge or a pill, and a second emphasis in one row all fail it and are not drawn.
- **No subtitle lines.** A page title, a section heading or a row has no small line under it unless that line is the
  content itself. Context goes behind one ▸ Details disclosure where it is, as a detail panel (Detail panels, below): the
  period's dates and counts, "not counted", why a window was chosen, what a figure rests on, a target, a caveat. A line
  that repeats a heading, the rail or another line is deleted. A row keeps one meta line at most, and only for what tells
  it apart (its date or activity). The owner called the stacked small lines slop (4 Nov 2026).
- **One thing under the answer.** A page's answer has exactly one line under it, the one fact the reader should look at
  ("Running grades 9 points higher at threshold."). Everything else about it waits in the Details.
- **Almost no colour.** Ink and paper do the work. The run ink and the ride ink mark which sport a figure or a line belongs
  to. Nothing else on a page is coloured, except a status line and the data of a chart.

## Colour

| Token               | Value       | Use                                                                                   |
| ------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `--paper`           | `#fbfaf8`   | The page, and the fill of inputs and menus                                            |
| `--paper-hover`     | `#f3f1ed`   | A row or control under the pointer                                                    |
| `--paper-pressed`   | `#eae7e1`   | A control while it is pressed                                                         |
| `--ink`             | `#0a0a0a`   | Text, the primary button, the current rail item, the meter's mark, focus              |
| `--ink-secondary`   | `#6b6660`   | Bylines, axis labels, the rail's other items, a neutral row's index (4.5:1 or better) |
| `--hairline`        | `#eae7e1`   | Row dividers, chart gridlines, the meter's track                                      |
| `--rule`            | `#dcd8d1`   | The rule under a page title and above a section                                       |
| `--control-border`  | `#8a847c`   | The outline of a small button or an input (3:1 or better)                             |
| `--ink-hover`       | `#2b2926`   | The primary button's fill under the pointer                                           |
| `--run-ink`         | `#c2410c`   | Run: its index numbers, its chart lines and marks, its end of the meter (4.5:1)       |
| `--ride-ink`        | `#1d4ed8`   | Ride: the same jobs for a ride (4.5:1)                                                |
| `--swim-ink`        | `#0e7490`   | Swim, reserved (4.5:1)                                                                |
| `--lift-ink`        | `#86198f`   | Lift: its corner of the level triangle, never told apart by colour alone (7.9:1)      |
| `--run-wash`        | `#c2410c1f` | A run band or area fill under a line, never behind text                               |
| `--ride-wash`       | `#1d4ed81f` | A ride band or area fill under a line, never behind text                              |
| `--lift-wash`       | `#86198f1f` | A lift band on its axis of the level triangle, never behind text                      |
| `--previous-mark`   | `#8a847c`   | The previous period's line, under the current one (3:1)                               |
| `--status-critical` | `#991b1b`   | An error's words and a removal's confirm button, always with a label                  |
| `--status-warning`  | `#8a5300`   | A warning's words, always with a label                                                |
| `--status-good`     | `#17753a`   | A success's words, always with a label                                                |

**Retired names.** The names of the volt system (`--surface-0`, `--text-primary`, `--series-run`, `--brand`, `--highlight`,
`--radius-sm`, `--font-display` and the rest) were `var()` aliases of these tokens while the pages moved, and are gone.
`tokens.test.ts` fails any sheet or source that declares or reads one.

The zone ramps (`--zone-run-n`, `--zone-ride-n`, `--zone-ride-long-n` and their inks) and the activity page's channels
(`--ch-*`) keep their light values and their tests. They are data, so they are the one place a page shows a range of colour.

**Sport colour.** A sport surface sets `data-sport`, and `tokens.css` points `--sport-ink` and `--sport-wash` at that sport's
pair, so a row, a line or a triangle corner takes its own sport's colour. A sport's figure is set in ink; its index number and its
marks carry the colour. A list that mixes sports gives each row its own sport's ink, and a row with no sport takes
`--ink-secondary`. The run ink is kept at least 14 from the critical red in CIEDE2000 (10 under the worst colour vision),
and no zone step within 10 of it (`runColour.test.ts`, `zoneRamp.test.ts`).

**Honesty shapes** are shapes, not colours: a dot is a recorded effort, a ring an estimate. They hold in forced colours.

## Type

Three faces, each with one job. Newsreader and IBM Plex Mono are OFL-1.1, self-hosted from `@fontsource`, so no
third-party font request is made.

| Role  | Face                          | Job                                                                                    |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Serif | Newsreader 400 and 500        | Page titles, section and row titles, the answer sentence, the rail, prose              |
| Mono  | IBM Plex Mono 400 and 500     | Every number (pace, watts, dates, grades, counts), index numbers, bylines and metadata |
| Sans  | The system face (`system-ui`) | Controls only: buttons, inputs, selects, menus                                         |

- **Numbers are mono,** with `font-variant-numeric: tabular-nums`, wherever they appear, inside a sentence too (`.num`).
  A number in a serif sentence is set at 0.9em so its height matches the serif's.
- **Metadata** (`.meta`) is mono at `--text-meta`, upper case, `--tracking-meta`, in `--ink-secondary`: a row's byline, a
  section's date range, a chart's axis title. It is the only upper case on a page.
- **Weight.** Serif titles are 500 and prose 400. Mono figures are 400, and the one figure a page leads with is 500.
  Nothing is bold beyond 500.
- **The scale is tokens.** Every size is one of these; `typeScale.test.ts` keeps the count of sizes that bypass them from
  rising, and no size is a clamp of its own.

| Token         | Size           | Face  | Use                                                                |
| ------------- | -------------- | ----- | ------------------------------------------------------------------ |
| `--display-1` | 40 px (2.5rem) | Mono  | The one figure a page leads with: a sport page's threshold         |
| `--display-2` | 32 px (2rem)   | Serif | The answer sentence: "Your balance leans toward running"           |
| `--title`     | 24 px (1.5rem) | Serif | A page title and a section heading                                 |
| `--heading`   | 21 px          | Serif | A row's title                                                      |
| `--text-lead` | 18 px          | Serif | The one line under the answer                                      |
| `--text-md`   | 17 px          | Serif | Prose                                                              |
| `--text-sm`   | 14 px          | Any   | A row's figure in mono, a control's label in sans                  |
| `--text-xs`   | 12 px          | Mono  | Axis labels and chart annotations                                  |
| `--text-meta` | 11 px          | Mono  | Metadata and index numbers, upper case, `--tracking-meta` (0.12em) |

- Titles and prose take `text-wrap: pretty`, the answer sentence `text-wrap: balance`, so no word is left alone on a line.
- A unit after a figure is the same mono at 0.75em in `--ink-secondary`, after a non-breaking space.

## Layout

- **One shell.** `--page-width` (75rem) holds the header, the rail and the page, so nothing jumps between pages. Prose is
  capped at `--measure` (36rem, about 70 characters of Newsreader).
- **The rail.** From 1024 px a text rail of `--rail-width` (12rem) sits left of the page: Balance, Run, Ride, then a rule,
  then the periods (6 weeks, 12 weeks, 6 months, 12 months, All time, Custom). Each is a serif text link at `--text-md`. The current
  page and the current period are ink; the others `--ink-secondary`. No icon, box or bar marks them. Below 1024 px the rail
  is two lines across the top of the page, the pages over the periods with a rule between, the periods by their short
  names (6 wk, 12 wk, 6 mo, 12 mo, All, Custom) with the full names kept as their accessible names, so nothing scrolls
  sideways at 320 px. Lift joins the rail after Ride with the lift logger ([lift-logger.md](lift-logger.md)); it shows no periods.
- **The header** is one line: the wordmark in serif, the other pages (History, Activities, Method) as text links, and the
  account and Add files at the right.
- **Rows, not cards.** A list (records, best efforts, history, What changed) is a numbered list of rows between hairlines.
  A row is: the mono index (01, 02 ...) in its sport's ink, the serif title at `--heading`, a mono meta line under it, an
  optional ▸ disclosure, small outlined buttons, and at the right a sparkline where the row has a trend. A row has one
  emphasis, its title. A list's rows sit `--space-5` apart with the hairline between.
- **Disclosure.** "How this was worked out" and every fold is a native `<details>` with a ▸ that turns to ▾. No box, no
  chevron icon, no background. What it holds is a detail panel, never a block of prose.
- **Two gaps.** `--section-gap` (48 px) between a page's sections and `--stack-gap` (24 px) inside a stack. Spacing steps are
  `--space-1` to `--space-7` (4 to 48 px).
- **Radius.** `--radius` (8 px) for buttons and inputs, which are the only boxes. A raw radius in a sheet is counted and the
  count may only fall.
- **No shadow.** A menu, a dialog or a tooltip is paper with a 1 px `--rule` edge.
- **Controls.** The primary button is solid ink with paper text, one a screen. Every other button is small and outlined: 40
  px tall, a control's own target (`target-size.spec.ts`), `--control-border` edge, sans at `--text-sm`, sentence case. A
  phone or a finger gets a 44 px target. A disclosure's ▸ summary is as tall. The one exception is Google's sign-in button,
  which keeps Google's own fill, stroke, text colour and Roboto (its branding rules fix them); only its height and outline
  shape follow this system.
- **Breakpoints** are named constants in `ui/layoutBreakpoints.ts`; a sheet that repeats one says so in a comment, and a
  test ties it to the constant.

## Detail panels

Every disclosure or Details that would hold prose holds a detail panel instead (`ui/components/PropertyList.tsx`). The
owner banned walls of small conditional prose in disclosures (6 Nov 2026).

Rules:

- **One fact a row.** A row is a label and a value. A condition is a row value, not a clause: `Heart rate`, `Not used`; never
  "Here it was not used because ...".
- **Nothing longer than one sentence** appears in an app view. A value is a figure, a date or a few words.
- **Method and caveat prose lives on Method.** The panel ends with one "Method" link (`MethodSectionLink`) to the section that
  explains its figures. Add the lines to Method if its entry lacks them.
- **An empty or insufficient state is one row** with the reason, not a paragraph. A panel with no rows is not drawn.
- **No figure changes.** A panel says what the page said before, in rows: the same values, the same formulas.

Layout:

- The label is serif at `--text-md` in `--ink-secondary`, left. The value is mono at `--text-sm` in `--ink`, right, with
  tabular figures. Labels share one column (`--column-props`, at least 9rem) so the values align down the panel.
- Rows sit between `--hairline` rules at `--space-2` above and below; the first row has no rule above it.
- The "Method" link is serif at `--text-md` in `--ink`, under the last row, once.
- A value that is a count may link to the list it counts. A panel is as wide as `--measure` and wraps on a phone.

## The level triangle

Three hairline axes at 120 degrees (run at the top, cycling at the lower right, lifting at the lower left), a corner on each
at that sport's age grade, 0 at the centre and 100% at the outer ring. The outer ring is `--rule`; the 80 and 60 rings and the
axes are `--hairline`. The shape through the dots is `--ink` at 7% with a 2 px edge, never a sport colour. A sport's dot is its
ink with a 3 px paper ring, and its 90% range is a 12 px band of its wash along its axis. No glow, no tick, no total and no
area. A sport with no grade keeps a lighter axis with a short cap and no dot. The corners are HTML text over the SVG
(label in the sport's ink, whole percent in mono, level word in `--ink-secondary`; the levels are Recreational, Active, Trained, Club, Local, Regional, National and World, see [finer-levels](decisions/finer-levels.md)). Lift is never told apart by colour alone,
so its ink always sits beside its name. The share card and the landing example still draw the old one-line meter (a hairline
track, the sport inks at its ends, one ink mark) until they take the triangle.

## Accessibility the suite checks

The axe tags are WCAG 2.0, 2.1 and 2.2 A and AA and best practice (`WCAG_TAGS` in `e2e/helpers.ts`). Text is 4.5:1 or better
on paper and a control's edge 3:1. Beyond axe:

- **Focus is never wholly behind a stuck bar (2.4.11).** `focus-not-obscured.spec.ts` tabs through Run and Ride at 1440 and
  390 px and fails when a focused control lies inside a sticky or fixed rect. Focus is a 2 px ink outline offset 2 px.
- **Reflow at 320 x 256 (1.4.10).** The `reflow-320x256` project loads each page at 320 x 256 and fails on a horizontal scroll
  or a clipped primary control. The rail's two lines fit 320 px with no sideways scroll.
- **Forced colours.** `forced-colours.spec.ts` runs `assertNoTextOverlap` over the heroes of Balance, Run, Ride and an
  activity. The triangle's shape, axes and dots take the system text colour.
- **Large text and text spacing (1.4.4, 1.4.12).** `text-zoom.spec.ts` sets the root font to 200% and injects the 1.4.12
  spacing sheet, then checks that chart labels do not overlap and the page does not scroll sideways.

## What holds this page to the code

| Test                                                              | What it keeps                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `styles/tokens.test.ts`                                           | Every colour row above is in `tokens.css` with the same value, every colour token has a row, and text reaches 4.5:1.    |
| `styles/oneTheme.test.ts`                                         | No sheet, script or page in `apps/web` has a `prefers-color-scheme` rule or a `data-theme` hook.                        |
| `styles/levelTokens.test.ts`                                      | The level bands table in DESIGN.md, and that it is not in the colour table.                                             |
| `styles/zoneRamp.test.ts`, `styles/runColour.test.ts`             | The ramps and the run ink, by contrast and CIEDE2000.                                                                   |
| `styles/typeScale.test.ts`                                        | The scale above, the three faces and their jobs, weights of 500 or less, and the count of sizes that bypass the tokens. |
| `styles/layoutTokens.test.ts`                                     | One shell width, one measure, two gaps, one radius, no shadow, and the ratchet on raw radii.                            |
| `e2e/box-census.spec.ts`                                          | The box ratchet: boxed elements on Run and Ride, which only falls.                                                      |
| `e2e/focus-not-obscured`, `reflow`, `forced-colours`, `text-zoom` | The four checks above.                                                                                                  |
| `src/shareMetadata.test.ts`                                       | The social card's stamp, drawn from `tokens.css` and the sample's figures.                                              |
