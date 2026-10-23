# Design

How the web app looks, reads and is organised. The product direction is in [VISION.md](VISION.md);
the code rules are in [ENGINEERING.md](ENGINEERING.md). This file is the one source for visual and
copy decisions: change it in the same pull request as the code that departs from it.

The direction comes from the October 2026 UX review: the app is for **multi-sport amateurs**, its
home screen is **Balance** (where you stand in each sport and which way your balance leans), and it
should feel **athletic and energetic** without hiding the honesty of the engine.

## Information architecture

Hash routes, so the static host needs no fallback rules.

| Route              | Page              | Holds                                                                                                                                                                                  |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`               | Balance           | The answer and its meter, one card per sport, the evidence card, the cross-sport card, the trend, the share image                                                                      |
| `#/run`, `#/ride`  | Run, Ride         | Threshold, records in native units, the best-effort curve                                                                                                                              |
| `#/activities`     | Activities        | Every activity, newest first; a row opens its activity page                                                                                                                            |
| `#/activities/:id` | Activity          | Summary, efforts set here, data issues                                                                                                                                                 |
| `#/method`         | How sure is this? | Ratio chart, heart-rate check, virtual-power accuracy, methodology                                                                                                                     |
| `#/profile`        | Profile           | Weight, units, year of birth and sex, account (email, download, delete), the saved library (signed in) or the activities kept in this browser (signed out), file retention, Start over |

Without a result every route except Profile shows the landing page. The header holds the wordmark,
the four tabs (once there is a result), one **Add files** button, a Profile link and the account
control. The account menu holds the email and Sign out; downloading data and
deleting the account are on the Profile page. A file dropped anywhere on the page is imported.

The landing page's step 1 has a **How to get your files** button. It moves focus to the export guides
below the steps, one closed details per service; guides whose steps could not be checked from the
vendor's own page say so.
After an import that added activities, a dismissible notice under the header says what it added and
links to Balance, except on Balance itself.

## Colour

Ink and volt are the brand. Sport colours mark a sport: its data, its glyph, and the edge of its
card. They never colour generic chrome such as buttons, links, tabs or focus rings. Status
colours always come with an icon and a label, so a warning never relies on red beside the run coral.

| Token                  | Light       | Dark        | Use                                                    |
| ---------------------- | ----------- | ----------- | ------------------------------------------------------ |
| `--surface-0`          | `#f5f6f8`   | `#0f1115`   | Page (paper)                                           |
| `--surface-1`          | `#ffffff`   | `#171a20`   | Cards, inputs, chart plot                              |
| `--surface-2`          | `#eceff3`   | `#1e232c`   | Hover, tiles, tracks                                   |
| `--border`             | `#e1e4ea`   | `#2a2f38`   | Card and table rules                                   |
| `--grid`               | `#e9ecf1`   | `#232830`   | Chart gridlines                                        |
| `--control-border`     | `#7f8694`   | `#6b7380`   | Input and button outlines (3:1 or better)              |
| `--text-primary`       | `#0e1116`   | `#eef0f3`   | Ink                                                    |
| `--text-secondary`     | `#474f5c`   | `#b6bcc6`   | Supporting text                                        |
| `--text-muted`         | `#5f6774`   | `#8d95a2`   | Captions, axis labels (4.5:1 or better)                |
| `--neutral-mark`       | `#474f5c`   | `#b6bcc6`   | Neutral data and reference marks                       |
| `--neutral-band`       | `#474f5c24` | `#b6bcc629` | Neutral band fill                                      |
| `--brand`              | `#c8f03c`   | `#c8f03c`   | Volt: marks the one primary action per screen          |
| `--accent`             | `#0e1116`   | `#c8f03c`   | Primary button background (dark: volt, from `--brand`) |
| `--accent-contrast`    | `#c8f03c`   | `#0e1116`   | Primary button label (light: volt, from `--brand`)     |
| `--selected`           | `#0e1116`   | `#eef0f3`   | Selected tab or segment                                |
| `--selected-contrast`  | `#ffffff`   | `#0e1116`   | Label on a selected tab or segment                     |
| `--link`               | `#0e1116`   | `#eef0f3`   | Links, always underlined                               |
| `--focus`              | `#0e1116`   | `#c8f03c`   | Focus ring                                             |
| `--series-run`         | `#e5304f`   | `#f0435f`   | Running data                                           |
| `--series-ride`        | `#2f56e8`   | `#4d6ef5`   | Cycling data                                           |
| `--series-swim`        | `#0f9fb0`   | `#14a0b0`   | Swimming data (reserved)                               |
| `--series-run-soft`    | `#e5304f26` | `#f0435f33` | Running band and area fill                             |
| `--series-ride-soft`   | `#2f56e826` | `#4d6ef533` | Cycling band and area fill                             |
| `--series-swim-soft`   | `#0f9fb026` | `#14a0b033` | Swimming band and area fill (reserved)                 |
| `--status-warning`     | `#8a5300`   | `#f2b544`   | Warning icon and label                                 |
| `--status-warning-bg`  | `#fbf2d9`   | `#33290c`   | Warning chip background                                |
| `--status-critical`    | `#b3261e`   | `#ff8a80`   | Error icon and label; destructive button background    |
| `--status-critical-bg` | `#fde8e6`   | `#3a1714`   | Error chip background                                  |
| `--status-good`        | `#17753a`   | `#4ac26b`   | Success icon and label                                 |
| `--status-good-bg`     | `#e3f4e8`   | `#10301b`   | Success chip background                                |

Spacing, radius, font and shadow tokens live in `apps/web/src/styles/tokens.css`, beside the colours.

`*-soft` variants are the same hue at 15% (light) or 20% (dark) alpha, for bands and area fills.
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
- Charts get a faint grid, 2.5 px lines with round joins, an area fill under single series and an
  emphasised latest point.
- Phone first: every page is designed at 390 px, with a 16 px gutter and no sideways page scroll.
  Tables that cannot fit become lists.

## Copy

- **Balance is neutral.** Say which way it leans ("Your balance leans toward running"), never
  that a sport is a limiter, a weakness or holding you back.
- **Lead with the finding**, in the words an athlete uses: pace, watts, time, distance.
  "Energy rate" and "metabolic W/kg" belong on How sure is this?, not on the surface.
- **Caveats become chips and shapes.** Draw a range instead of writing it; a caveat is a chip with
  an icon that links to the detail.
- **Every number names its source**: the activity that set it, with a link to that activity.
- **Evidence gaps say what to do**: what to upload or record, and what it would sharpen.
- Dates are friendly: "Tue 3 Jun", with the year only when it is not this year. A range of months
  gives the year on both ends when the years differ, or when either is not this year: "from Mar to
  Oct", "from Mar 2023 to Oct 2026".
- One "How sure is this?" link per card at most.
- The app grades, it never ranks: no percentiles, no "top X%", no composite score across sports.

## Accessibility

Unchanged by the redesign: every chart has a table view, colour is never the only cue, controls are
at least 40 px tall, focus is always visible, live regions stay mounted, and motion respects
`prefers-reduced-motion`.
