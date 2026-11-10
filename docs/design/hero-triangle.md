# The level triangle

Design note for the Balance hero after Stage X. Owner decision, 9 Nov 2026: the hero is a visualization of the balance
between lifting, running and cycling, "simple and visually compelling". He picked the level triangle over a pairwise
gap and a share-of-hours chart. A static prototype with synthetic values is at `.claude/stage-x/proto/hero/triangle.html`
(git-ignored; open it in a browser). No app code is in this note's change.

## 1. What it shows and why

Three axes leave the centre, one per sport. A corner sits on its axis at that sport's age grade, 0 at the centre and 100%
at the outer corner. The filled shape through the three corners shows two things at once: its **size** is level and its
**skew** is the lean. A tall spike toward one corner is a lopsided athlete. An even triangle is a balanced one.

Why this replaces the meter:

- The meter is a gap between two numbers. A gap needs one unit and two sports. The triangle puts three grades on one
  scale side by side, and no gap is needed for the picture. This is on purpose a reversal of
  [strength.md](strength.md) decision 8 ("no lift number goes on the meter"): that rule was about a pair's gap, and
  nothing here is a gap. It also meets [VISION](../VISION.md) commitment 5 (no universal score): the three grades stay
  side by side, **never summed, averaged or reduced to an area**. The page prints no total and no shape size.
- It tells the athlete one thing the meter could not: where lifting sits against the two sports he already grades.

**Blocker the coordinator must see.** Lift has no age grade today. `GRADE_LEVELS` and `gradeEffort` cover run and ride
only, and lifting has e1RM and relative strength, which are not a percent of an age-graded record. A lift corner on this
axis needs a defined 0 to 100 figure with the same level bands, which is a model change: a spec in `docs/design`, a
synthetic prototype and an Opus science review ([PROCESS.md](../PROCESS.md), Formula and model changes), then a
calibration case and a row in [model-ledger.md](model-ledger.md). "Grade" means age grade only, so unless that figure
is an age grade the lift corner must not be called one (it reads "Level", and the headline never says "grades" of
lifting). Until it exists the lift corner is in the missing state (section 6) for every athlete. That is why the
recommendation there matters most.

## 2. Geometry

- **Three axes at 120 degrees.** Run at the top, cycling at the lower right, lifting at the lower left. The order is the
  rail's (Balance, Run, Ride, Lift) read clockwise, and run keeps the first place it has had on every surface
  (`BALANCE_PAIR`). A point-up triangle puts one label above and two below, so no label sits beside another.
- **Scale.** Linear from 0 at the centre to 100% at each outer corner, the same scale as the grade. The outer triangle
  is 100% (hairline `--rule`). Two inner triangles, 80 and 60, are hairlines (`--hairline`), the lower edges of National
  and Local. Their numbers (12 px mono, `--ink-secondary`, paper halo) sit left of the run axis just above each ring.
  Below 60 is Recreational, so the inner third needs no ring. The three axes are hairlines.
- **The range** of a grade is a 12 px band along its own axis from its low to its high end, in the sport's wash
  (`--run-wash`, `--ride-wash`, and a lift wash), layered twice as the meter's was, with no edge and never dashed. The
  band is 90% like every other range. A recorded effort would be a dot with no band, as on the ladders.
- **The best estimate** is a dot in the sport's ink with a 3 px ring in the paper colour, on its axis.
- **The shape** joins the three dots: ink at 7% fill, a 2 px ink edge with round joins. It is neutral ink because it
  belongs to no sport. The sport colour is only the dot, the band and the corner label.
- **Even.** An even athlete draws an equilateral triangle, so no "Even" tick is needed. The old tick is dropped.
- **Pure function.** `triangleGeometry(grades, size)` in one module returns the axis ends, ring polygons, corner points
  and band ends. The SVG and the share canvas both read it, so they cannot drift (one source per figure).

## 3. The headline and the line under it

The sentence names the sport at the top, the way the current one does, and the line under it states the one fact: how far
the top grade is from the bottom one.

| Situation (graded sports only)                                | Headline                                             | Line under it (one line)                                     |
| ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| One sport clearly highest (decided by the existing lean rule) | Your balance leans toward running                    | Running grades 13 points higher than lifting.                |
| Two sports within the even rule of each other, a third below  | Your balance leans toward running and cycling        | Running grades 12 points higher than lifting.                |
| All within the even rule                                      | Your running, cycling and lifting are in balance     | The three sit within 4 points of each other.                 |
| Only two graded                                               | Today's headlines, unchanged                         | Today's line, "Running grades 9 points higher at threshold." |
| One graded                                                    | The levels title, as today (`levelsTitle`)           | Today's line                                                 |
| None graded                                                   | Today's states (add a birth year and sex, and so on) | Today's line                                                 |

Rules:

- The lean is today's rule (`leanOfLead` on the whole-point centre) applied to the highest and lowest graded sports. The
  lead the line states is `balanceLead` on that pair, so its range comes from the same function. A "points higher"
  figure is a whole number with the true minus sign rules of `signedCount`.
- The line says "higher than", never "ahead of". It never says weakest, limiter or holding back, and it names no cause.
- The sport named in the headline is underlined in its colour, as now. The line has no range: the range is in the Details
  under the answer (one ▸ Details, per [system.md](system.md)): "Range, 90%: running 55 to 67, cycling 46 to 58,
  lifting 42 to 54. The gap between running and lifting is 13 points, range 4 to 22." Numbers are mono.
- With two graded sports the output is the current output to the character, so the landing example and every run and ride
  athlete keep their text, and a test pins that.
- Nouns: Running, Cycling, Lifting in sentences and corner labels (the meter's ends use the same). The page and rail are
  "Lift". "Strength" appears nowhere.

## 4. Corner labels

Each corner is three short lines, centred on its vertex, label over number:

1. **Label**: the sport noun in mono meta style (11 px, upper case, `--tracking-meta`), in the sport's ink.
2. **Number**: the grade as a whole percent in mono 500 at 20 px, ink: `61%`.
3. **Level**: the level word in mono 12 px, `--ink-secondary`: `Local`. It is a defined term as it is today
   (`Definition`). It is its own line, since "52% Recreational" is 17 characters and a bottom corner has about 90 px at
   320 px.

The top label sits above the vertex, the two lower ones below it. Corner figures use the same `gradePercent` and
`levelOf` as the sport pages, so the number and the level always agree.

## 5. Colour

Run is `--run-ink` and ride `--ride-ink`, unchanged. Lift needs a new pair, `--lift-ink` and `--lift-wash` (ink at 12%,
`1f` like the others). The palette has no free colour: `--swim-ink` teal is reserved, green and amber are the status colours.

Proposed `--lift-ink: #86198f` (a dark magenta). Measured against `colourDifference.ts` and `contrastMath.ts`:

| Pair                      | Contrast on paper | CIEDE2000, normal | Under the worst deficiency |
| ------------------------- | ----------------- | ----------------- | -------------------------- |
| lift ink                  | 7.9:1             |                   |                            |
| lift against run          |                   | 42                | 20                         |
| lift against ride         |                   | 22                | 9                          |
| lift against swim         |                   | 38                | 8                          |
| lift against critical red |                   | 32                | 18                         |

Violet and olive were worse: violet is 1 against the ride ink under one deficiency, olive 5 against run. Magenta is the
best of the six tried. It misses the 10 bar the run ink holds against the critical red by 1 against ride, so the rule is
that **lift is never told apart by colour alone**: every use sits beside the sport's name (the corner label, the legend of
a chart). `levelTokens`-style tests add a `liftColour.test.ts` with these pairs. Both lift tokens go in `tokens.css`, in
`system.md` and in `[data-sport='lift']` (`--sport-ink`, `--sport-wash`).

## 6. A sport with no grade yet

Lift will be here first (section 1), and a run or ride can be missing too (no threshold yet, or no birth year and sex,
which removes all three). Options:

- **A. Draw the missing corner at the centre.** The shape collapses along that axis. It reads as a grade of 0 and shrinks
  the shape, which states a fact the data does not hold. Rejected.
- **B. Draw the graded corners only.** Two graded sports: their dots joined by a line, no fill. One: a dot. The missing
  axis stays, drawn in the lighter hairline with a short cap at its end and no dot (a dot is a grade or an estimate, so
  none is drawn). Its corner reads `LIFTING` over `No grade yet`. The shape is never an area with a made-up third side, and
  with run and ride graded it is the same two facts the meter gave.
- **C. A two-axis figure.** Drop the third axis until it has a grade. The layout jumps when the grade appears and the
  triangle the owner chose disappears for every athlete until lifting has a grade.

**Recommendation: B.** The triangle is always there (the owner's picture, and the place lifting will appear), nothing is
claimed about the missing sport, and the shape arrives as the third dot does. In the prototype this is the middle figure.
The corner is a link to that sport's page, which says what it needs: a threshold, a profile, or logged lifts. With no
grade at all, the three axes and rings draw empty, each corner says `No grade yet`, and the page's existing missing
states carry the reason (they are unchanged). No "?" icon and no dashed line.

## 7. Interaction

- Each corner is a real link, a 44 px target at the vertex (`min-width` and `min-height`), to `#/run`, `#/ride` or
  `#/lift`. A hover underlines the label. A focus ring is the ink outline of every link.
- No tooltip and no drag. The figure is read at a glance, and detail is on the sport page.
- No animation, so there is nothing to reduce. The shape draws in place on load and when the period changes. A later
  change that animates must switch it off under `prefers-reduced-motion`.
- The period control below still changes the grades, and the shape redraws.

## 8. Accessibility

- The corners are HTML text in the page's flow order, placed over the SVG, so they scale and wrap as text and are real
  links. The SVG is `aria-hidden="true"` and carries no text of its own except the ring numbers.
- Reading order: headline, line, Details, then the corners in the rail's order (run, ride, lift). A link reads "Running
  61% Local" followed by visually hidden ", range 55 to 67". A missing one reads "Lifting No grade yet". That is the
  text equivalent, so no second table is needed and the figures have one source.
- Shape alone never carries a fact: every grade is also a number. In forced colours the shape fill is `Canvas`, the edge,
  axes and dots take system colours, and the ring stays as a dot's outline.
- Contrast: corner text is ink or `--ink-secondary` (4.5:1 or better); the sport ink labels are 4.5:1 or better
  (lift 7.9:1). Ring numbers are 12 px `--ink-secondary` with a halo. The hairline rings are decoration, as the
  chart gridlines are.
- Zoom to 200% and 320 px must not scroll sideways.

## 9. Size

The figure is a square plot, `aspect-ratio: 1`, `width: 100%`, capped at 440 px and centred. One viewBox of 300 units;
the outer triangle has a radius of 118 units, so each corner is at 14 to 16% from the plot's edge.

| Width             | Plot   | Notes                                                                                                                                                                                                                                          |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1280 px and wider | 440 px | Headline, line and Details stack above, the triangle centred under them, then levels are gone (they are the corners), then the period chips. At 1440 x 900 the headline, the line, the triangle and the chips are above the fold.              |
| 761 to 1279 px    | 400 px | The same stack.                                                                                                                                                                                                                                |
| 375 px            | 343 px | The headline wraps to two lines at 32 px. Corner figures stay 20 px.                                                                                                                                                                           |
| 320 px            | 288 px | The headline is 28 px. A lower corner has 46 px to the page edge, and "Recreational" is 86 px, so it is centred on the vertex within the 16 px gutter. The figure is above the section tabs with the sample banner above it, as the meter was. |

The first-screen rule in DESIGN.md stays: the triangle is the first graphic on the page. A landscape phone (667 x 375)
puts the headline and line left and the triangle right, at 300 px, so the headline stays above the foot bar.

## 10. The share image

The 1200 x 630 card keeps its paper, the app name and its fonts (`cardCanvas.ts`). The headline and the line go left in the
serif. The triangle goes right at about 420 px, drawn on the canvas from `triangleGeometry` with the same colours, the
corner labels in the same three lines, and the missing state as in section 6. It carries no range (ranges stay in the app,
as now) and no total. Alt text for the image is the headline, the line and the three corners in one sentence. The
Open Graph card (`public/social-card.png`) is the sample athlete drawn the same way and is regenerated with it.

## 11. What the current meter's figures become

| Today                                               | After                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Headline "leans toward running" or "in balance"     | Same wording, by the top and bottom graded sports (section 3)       |
| Line "Running grades 11 points higher at threshold" | Unchanged for two sports; "higher than lifting" with three          |
| The dot, at the gap's best estimate                 | Gone. Each sport's dot is at its own grade                          |
| The range written at the dot                        | A band along each axis, and the gap's range in Details              |
| The Even tick and "Even" label                      | Gone. An equilateral triangle is even                               |
| The ends "RUNNING" and "CYCLING"                    | Corner labels, with Lifting added                                   |
| `BalanceLevels` ("Running 67% Local")               | The corners. The component is removed, since it would restate them  |
| The energy ratio and its basis line                 | Unchanged on Method. The hero never showed it as the default        |
| The share card's meter                              | The triangle (section 10)                                           |
| The landing example (meter and levels)              | The triangle with run and ride graded and lift in its missing state |

Removed with the meter: `BalanceMeter` and its stylesheet, `balanceScale` helpers only the meter reads, and `BalanceLevels`.
The tests that pinned the meter's sentence and the levels line move to the headline and the corners.

## 12. Build slices (about 600 lines each)

1. **Core.** `triangleGeometry`, the headline and line rules for three, a test that two-sport output is byte-identical to
   today's. No digest change, so no `MODEL_REVISION` change.
2. **Web.** `LevelTriangle`, its stylesheet, `--lift-ink` and `--lift-wash` with the colour test, `system.md` and
   `DESIGN.md` updates, the meter and levels removed, e2e text updated (grep `apps/web/e2e*` for the old text first).
3. **Share and landing.** The canvas card, the social card, the landing example.
4. **Lift grade** (separate and gated, section 1). Until it lands, lift is always in the missing state.

## 13. Open questions for the owner

- Is the lift figure an age-graded record percent, or another standard? It sets the word on the corner (grade or level)
  and whether the 60 and 80 rings mean the same thing for lifting.
- The prototype uses the neutral shape. A shape tinted by the top sport is possible and would add colour to something
  that belongs to no sport; the recommendation is neutral.
