# The visual system

How the app looks, as it is on main after the D10 work (the shell, the type scale, the run colour, the bands, the checks
the suite could not see). The values are `apps/web/src/styles/tokens.css`; this page says what each is for, and the tests
named at the end keep the two in step. Pages and charts are in [DESIGN.md](../DESIGN.md); the level bands (a colour table of
their own) stay there under Level bands.

Owner calls this system keeps: run is coral and ride is blue; one primary action a screen; Balance is a single meter
line; fitness sits above Balance; the answer is the one thing on a page with weight.

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

| Token                  | Light       | Dark        | Use                                                                                                                                        |
| ---------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--surface-0`          | `#f5f6f8`   | `#0f1115`   | Page (paper)                                                                                                                               |
| `--surface-1`          | `#ffffff`   | `#171a20`   | Cards, inputs                                                                                                                              |
| `--surface-2`          | `#eceff3`   | `#1e232c`   | Hover, tiles, tracks                                                                                                                       |
| `--surface-pressed`    | `#dde2ea`   | `#101318`   | A button's fill while it is pressed                                                                                                        |
| `--border`             | `#e1e4ea`   | `#2a2f38`   | Card and table rules                                                                                                                       |
| `--grid`               | `#d0d5de`   | `#343b47`   | Chart gridlines: about 1.5:1 on the card, visible but recessive                                                                            |
| `--control-border`     | `#7f8694`   | `#6b7380`   | Input and button outlines (3:1 or better)                                                                                                  |
| `--divider`            | `#7f8694`   | `#6b7380`   | The 2 px rule that opens a band (a section with no box), so it is a 3:1 line and not a hairline                                            |
| `--text-primary`       | `#0e1116`   | `#eef0f3`   | Ink                                                                                                                                        |
| `--text-secondary`     | `#474f5c`   | `#b6bcc6`   | Supporting text                                                                                                                            |
| `--text-muted`         | `#5f6774`   | `#8d95a2`   | Captions, axis labels (4.5:1 or better)                                                                                                    |
| `--neutral-mark`       | `#474f5c`   | `#b6bcc6`   | Neutral data and reference marks                                                                                                           |
| `--neutral-band`       | `#474f5c24` | `#b6bcc629` | Neutral band fill                                                                                                                          |
| `--previous-mark`      | `#838a97`   | `#737b89`   | The previous period's line: a solid mid grey, 2 px, under the current line                                                                 |
| `--brand`              | `#c8f03c`   | `#c8f03c`   | Volt: marks the one primary action per screen                                                                                              |
| `--accent`             | `#0e1116`   | `#c8f03c`   | Primary button background (dark: volt, from `--brand`)                                                                                     |
| `--accent-contrast`    | `#c8f03c`   | `#0e1116`   | Primary button label (light: volt, from `--brand`)                                                                                         |
| `--highlight`          | `#c8f03c`   | `#c8f03c`   | Volt as a fill behind ink: selected segment, current page, new marker                                                                      |
| `--highlight-ink`      | `#0e1116`   | `#0e1116`   | Ink on the highlight fill (4.5:1 or better)                                                                                                |
| `--accent-hover`       | `#474f5c`   | `#a9d62c`   | Primary button fill on hover, a visible change in both schemes                                                                             |
| `--accent-pressed`     | `#000000`   | `#8fb81c`   | Primary button fill while it is pressed, with a 1 px drop                                                                                  |
| `--mark-tile`          | `#0e1116`   | `#0e1116`   | The brand mark's ink tile                                                                                                                  |
| `--mark-ring`          | `#0e1116`   | `#6b7380`   | The ring round the brand mark's tile, so the tile shows on the dark page                                                                   |
| `--selected`           | `#0e1116`   | `#eef0f3`   | Selected tab or segment                                                                                                                    |
| `--selected-contrast`  | `#ffffff`   | `#0e1116`   | Label on a selected tab or segment                                                                                                         |
| `--link`               | `#0e1116`   | `#eef0f3`   | Links, always underlined                                                                                                                   |
| `--focus`              | `#0e1116`   | `#c8f03c`   | Focus ring                                                                                                                                 |
| `--series-run`         | `#e44f27`   | `#f56333`   | Running data                                                                                                                               |
| `--run-ink`            | `#b83a12`   | `#f56333`   | Text in the run hue (4.5:1); defined, and read by nothing yet                                                                              |
| `--ride-ink`           | `#2f56e8`   | `#5c7bf7`   | Text in the ride hue (4.5:1); defined, and read by nothing yet                                                                             |
| `--series-ride`        | `#2f56e8`   | `#4d6ef5`   | Cycling data                                                                                                                               |
| `--series-swim`        | `#0f9fb0`   | `#14a0b0`   | Swimming data (reserved)                                                                                                                   |
| `--series-run-soft`    | `#e44f2726` | `#f5633333` | Running band and area fill                                                                                                                 |
| `--series-ride-soft`   | `#2f56e826` | `#4d6ef533` | Cycling band and area fill                                                                                                                 |
| `--series-swim-soft`   | `#0f9fb026` | `#14a0b033` | Swimming band and area fill (reserved)                                                                                                     |
| `--ladder-run-band`    | `#e44f2714` | `#f5633326` | Run band behind the level ladder's range, low enough alpha for the outline                                                                 |
| `--ladder-ride-band`   | `#2f56e826` | `#4d6ef526` | Ride band behind the level ladder's range, low enough alpha for the ring                                                                   |
| `--zone-run-1`         | `#d57029`   | `#b34f2c`   | Running zone 1, the lowest effort; the ramp runs orange into umber, losing chroma toward zone 5                                            |
| `--zone-run-2`         | `#c94e0c`   | `#ce470d`   | Running zone 2, lowest effort first                                                                                                        |
| `--zone-run-3`         | `#a63d02`   | `#f57e4d`   | Running zone 3, lowest effort first                                                                                                        |
| `--zone-run-4`         | `#7d2d05`   | `#fba774`   | Running zone 4, lowest effort first                                                                                                        |
| `--zone-run-5`         | `#552b14`   | `#fdc8a1`   | Running zone 5, lowest effort first                                                                                                        |
| `--zone-ride-1`        | `#6589d3`   | `#5061b3`   | Cycling zone 1, the lowest effort; the ramp darkens with effort in light and, in dark, grows more luminous at full saturation, never paler |
| `--zone-ride-2`        | `#3c67c9`   | `#4f70d6`   | Cycling zone 2, lowest effort first                                                                                                        |
| `--zone-ride-3`        | `#1844b9`   | `#4a81f4`   | Cycling zone 3, lowest effort first                                                                                                        |
| `--zone-ride-4`        | `#082c91`   | `#5196ff`   | Cycling zone 4, lowest effort first                                                                                                        |
| `--zone-ride-5`        | `#041b5d`   | `#67acfe`   | Cycling zone 5, lowest effort first                                                                                                        |
| `--zone-ink-1`         | `#0e1116`   | `#ffffff`   | Text on zone 1 of either sport (4.5:1 or better)                                                                                           |
| `--zone-ink-2`         | `#ffffff`   | `#ffffff`   | Text on zone 2 of either sport (4.5:1 or better)                                                                                           |
| `--zone-ink-3`         | `#ffffff`   | `#0e1116`   | Text on zone 3 of either sport (4.5:1 or better)                                                                                           |
| `--zone-ink-4`         | `#ffffff`   | `#0e1116`   | Text on zone 4 of either sport (4.5:1 or better)                                                                                           |
| `--zone-ink-5`         | `#ffffff`   | `#0e1116`   | Text on zone 5 of either sport (4.5:1 or better)                                                                                           |
| `--ch-pace`            | `#1b8a4d`   | `#3fc27a`   | Activity page: pace or speed channel                                                                                                       |
| `--ch-power`           | `#b86400`   | `#f0a030`   | Activity page: power channel                                                                                                               |
| `--ch-heartrate`       | `#b02e9a`   | `#e072cc`   | Activity page: heart rate channel                                                                                                          |
| `--ch-cadence`         | `#8c8210`   | `#e2e25a`   | Activity page: cadence channel                                                                                                             |
| `--ch-elevation`       | `#6e675c`   | `#a39c90`   | Activity page: elevation channel                                                                                                           |
| `--ch-pace-soft`       | `#1b8a4d26` | `#3fc27a33` | Pace band and area fill                                                                                                                    |
| `--ch-power-soft`      | `#b8640026` | `#f0a03033` | Power band and area fill                                                                                                                   |
| `--ch-heartrate-soft`  | `#b02e9a26` | `#e072cc33` | Heart rate band and area fill                                                                                                              |
| `--ch-cadence-soft`    | `#8c821026` | `#e2e25a2e` | Cadence band and area fill                                                                                                                 |
| `--ch-elevation-soft`  | `#6e675c33` | `#a39c9040` | Elevation area fill                                                                                                                        |
| `--status-warning`     | `#8a5300`   | `#f2b544`   | Warning icon and label                                                                                                                     |
| `--status-warning-bg`  | `#fbf2d9`   | `#33290c`   | Warning chip background                                                                                                                    |
| `--status-critical`    | `#b3261e`   | `#ff8a80`   | Error icon and label; destructive button background                                                                                        |
| `--status-critical-bg` | `#fde8e6`   | `#3a1714`   | Error chip background                                                                                                                      |
| `--status-good`        | `#17753a`   | `#4ac26b`   | Success icon and label                                                                                                                     |
| `--status-good-bg`     | `#e3f4e8`   | `#10301b`   | Success chip background                                                                                                                    |

Spacing, radius, font and shadow tokens live in `apps/web/src/styles/tokens.css`, beside the colours.

`*-soft` variants are the same hue at 15% (light) or 20% (dark) alpha, for bands and area fills. A
record chip takes its sport's soft colour as its fill, with ink text, so it never relies on the hue.
The run, ride and swim colours were checked with a colour-vision simulator in the October 2026 UX
review. `apps/web/src/styles/tokens.test.ts` checks contrast, not colour vision.

**Roles.** Every colour has one job, and a job has one family of tokens.

- **Surface** (`--surface-0` page, `--surface-1` cards and inputs, `--surface-2` hover, tiles and tracks) and **ink**
  (`--text-primary`, `--text-secondary`, `--text-muted`). Text is 4.5:1 or better on the surface it sits on.
- **Sport identity** (`--series-run` coral, `--series-ride` blue, `--series-swim` reserved) marks a sport's data, glyph and
  card edge. It is never alone for text. `--run-ink` and `--ride-ink` are the text forms, 4.5:1 on the surfaces (`runColour.test.ts`
  checks the values). No surface sets text in a sport hue, since sport colours never colour text, so nothing reads them yet.
- **Highlight** (`--highlight` volt, `--highlight-ink`) is a fill behind ink for "now": the selected segment, the current
  page, the new marker. It is never a line or a text colour on the light page. `--brand` is the same volt as the brand
  mark; `--accent` is the one primary action.
- **Status** (`--status-good`, `--status-warning`, `--status-critical` and their `-bg`) always comes with an icon and a
  label. The run coral is kept at least 14 apart from critical in CIEDE2000 (10 under the worst colour vision), and no
  zone step is within 10 of it (`runColour.test.ts`, `zoneRamp.test.ts`).
- **Context** (`--previous-mark`, `--grid`, `--neutral-mark`, `--neutral-band`, the level bands) is what is neither sport
  nor status: the previous period, gridlines, reference marks.
- **Honesty shapes** are shapes, not colours: a dot is a recorded effort, a ring an estimate, a floor says "At least". They
  hold in both schemes and in forced colours.

**Zone ramps.** Five steps for each sport, lowest effort first, with one ink per step (`--zone-ink-n`) for both. Ride is blue
throughout. Run goes from orange into umber and its chroma falls toward the strong end, so effort deepens into earth and
never into the status red. Every step keeps 3:1 on the card and its ink 4.5:1; a neighbour is at least 7 apart in CIEDE2000
in light and 5 in dark, under every colour vision. `zoneRamp.test.ts` checks all of it from `tokens.css`.

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
  header share `--tracking-caps`, and the phone's tab labels take `--tracking-tab`.
- **The display scale is tokens too, for every size above 18 px.** `--display-1` (56 to 96 px, fluid) is
  the one hero figure a view: the sport page's threshold figure and an activity's time. `--display-2`
  (36 to 48 px) is a tile or secondary figure, a state word and a long sentence headline such as
  Balance's. `--display-3` (28 to 36 px) is a page title, the level name and a finding title. `--title`
  (24 px) is a section heading and `--heading` (20 px) a smaller one. A size is never a clamp of its own,
  and `typeScale.test.ts` keeps the count of sizes that bypass the tokens from rising. `.display` sets the
  face, weight 800, tabular figures and the line height `--lh-display` (0.95) once, and takes a full line
  under forced colours so a chip beside a figure cannot overlap it. Barlow loads 400 to 600, so a sans
  rule never asks for 700 or 800: only rules that set the condensed face do.
- **Units in a heading.** A unit inside a capitalised heading is set apart in `.unit`, so it stays in
  lower case, as in "/mi", and the space before it is a non-breaking space, so the unit never starts
  a line. Inline source links are set at `--text-md`, and on Balance and the sport pages so are the
  disclosure summaries, except a best efforts label, an eyebrow at `--text-sm`.

## Layout, rhythm, radius and shadow

- **One shell.** `--page-width` (75rem, 1200 px) is the width of the header, the tabs and every page, so nothing jumps
  between pages; `e2e/shell.spec.ts` reads the header's, the tabs' and the page's `x` and width on Balance, Run, Ride, Activities and Profile. Prose is capped at `--measure` (28.5rem, about 66
  characters in Barlow), not at a character count; charts and answer panels use the whole shell.
- **Two gaps.** `--section-gap` (48 px, `--space-7`) between a page's sections and `--stack-gap` (24 px, `--space-5`)
  between the items of a stack. The spacing steps are `--space-1` to `--space-7` (4 to 48 px).
- **Radius.** `--radius` (12 px), `--radius-sm` (6 px, chips) and `--radius-pill`. A raw radius in a sheet is counted, and
  the count may only fall.
- **Shadow.** `--shadow-pop` is for popovers, menus, dialogs and tooltips only. Cards do not lift. `--shadow` is the same
  value under its old name for files that wait on other work, and the test keeps it from spreading.
- **Controls.** A control is 40 px (`--control-height`); a phone or a finger gets a 44 px target. The header is two rows
  on a wide screen and one on a phone (`--header-height`), the phone's tab bar is 48 px (`--tab-bar-height`).
  `--sticky-extra` is the height of a bar stuck under the header (below).
- **Breakpoints** are named constants in `ui/layoutBreakpoints.ts` (the phone is 760 px, a short phone 700 px tall); a sheet
  that repeats one says so in a comment, and a test ties it to the constant.

## Surfaces

Two surfaces, and a page is mostly the second.

- **`.panel`** is a box (a 1 px border, the card radius, no shadow). A sport page keeps one only for a disclosure row (the
  census allows `section.panel` and nothing else), because the box is what says "open me". The one-sport Balance's
  one-line invitation to add the other sport is a panel too.
- **`.band`** is not a box: a 2 px rule across the top in `--divider` (3:1, not a hairline), the heading, and the section gap
  under it. The sport page's sections, its answer and the fitness card are bands, with a 4 px sport rule beside the fitness
  card's heading.
- **Labels.** `.tag` is the small condensed capitals that name a thing: condensed 700, upper case, `--tracking-caps`, muted
  by default, `tag--ink` for the supporting ink and `tag--small` for 12 px. `.eyebrow` is the same rule. A tile's name and
  basis, the sport page's period, the levels' name, a change's evidence tag, the fitness card's sport and the track's
  markers take it and keep only their layout, shape and state (`styles/tag.test.ts`). A state that sets its own colour
  compounds with `.tag` (`.tag.balance-changes__tag--recorded`), since the tag is later in the bundle. `.chip` is the
  boxed form for a small status or a record's level.
- **The box ratchet.** `e2e/box-census.spec.ts` counts the elements with a border and a radius or a shadow on Run and Ride
  at 1440 and 390 px, in normal and forced colours, and fails above 8% of `main`'s height on a desktop and 12% on a phone
  (about 2 points over what is measured). Lower the cap when a PR lowers the share; a new card on a sport page fails it.

## Accessibility the suite checks

The axe tags are WCAG 2.0, 2.1 and 2.2 A and AA and best practice (`WCAG_TAGS` in `e2e/helpers.ts`). Beyond axe, four checks
hold what a rule engine cannot see:

- **Focus is never wholly behind a stuck bar (2.4.11).** `useStickyExtra` sums the height of the bars that stick under the
  header (the section row, the chart readout) into `--sticky-extra`, and `scroll-padding-top` clears the header and them.
  `focus-not-obscured.spec.ts` tabs through Run and Ride at 1440 px and 390 px and an activity at 390 px, from several
  scroll offsets, and fails when a focused control lies inside a sticky or fixed rect.
- **Reflow at 320 x 256 (1.4.10).** The Playwright project `reflow-320x256` loads the landing page and each page of the
  sample at 320 x 256 (a 1280 px page at 400% zoom), and fails on a horizontal scroll or a clipped primary control.
- **Forced colours.** `.display` takes a full line height under `forced-colors: active`, so a chip beside a figure cannot
  overlap it. `forced-colours.spec.ts` runs `assertNoTextOverlap` over the heroes of Balance, Run, Ride and an activity.
- **Chart labels at large text and text spacing (1.4.4, 1.4.12).** `labelLayout` places chart labels by priority (bests,
  threshold and end labels first) using widths measured at the reader's text size (`rootFont`), and drops the lowest
  priority that would collide; the data table carries every value. `text-zoom.spec.ts` sets the root font to 200% and
  injects the 1.4.12 spacing sheet, then checks that chart labels do not overlap, the page does not scroll sideways, and the
  section pills wrap to more rows and stay on screen.

## What holds this page to the code

| Test                                                              | What it keeps                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `styles/tokens.test.ts`                                           | Every colour row above is in `tokens.css` with the same light and dark values, and every colour token has a row; the pairs promised (text on surface, graphics at 3:1) reach their ratios. |
| `styles/levelTokens.test.ts`                                      | The level bands table in DESIGN.md, and that it is not in the colour table.                                                                                                                |
| `styles/zoneRamp.test.ts`, `styles/runColour.test.ts`             | The ramps and the run coral, by contrast and CIEDE2000.                                                                                                                                    |
| `styles/typeScale.test.ts`                                        | The display scale, sizes above the body, one line height, no clamp outside the tokens, no 700 or 800 on the sans face, and the count of sizes that bypass the tokens only falls.           |
| `styles/layoutTokens.test.ts`                                     | One shell width, one measure, two gaps, the radius and shadow names, the band rule, and the ratchets on `ch` caps and raw radii.                                                           |
| `e2e/box-census.spec.ts`                                          | The box ratchet.                                                                                                                                                                           |
| `e2e/focus-not-obscured`, `reflow`, `forced-colours`, `text-zoom` | The four checks above.                                                                                                                                                                     |
| `src/shareMetadata.test.ts`                                       | The social card's stamp: `make-social-card.ts` reads its colours from `tokens.css` and its figures from the sample, so the image moves only when they do.                                  |
