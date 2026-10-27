# Which durations stand out, from your own curve

Status: the core module is `packages/core/src/profile` (`@rca/core/profile`), and the page is the "Where
your bests stand out" section on each sport page (`apps/web/src/ui/pages/StandOutSection.tsx`). It reports
a fact about the shape of one athlete's best curve. It estimates no capability. [unverified] marks a
claim not checked against the primary text.

## 1. What it says, and what it will not

For each duration from 5 s to 60 min, the page says how far the athlete's best sits above or below what
their **other** durations predict. A bump is a duration they are relatively good at. A dip is either
relatively low or never really tried, and the page says both (docs/VISION.md, commitment 2: most efforts
are not maximal, so a best is a lower bound).

It does not rank the athlete against anyone:

- The published power-profile norms are for professional riders (Allen and Coggan's chart is reproduced
  from a book that is under copyright, and its provenance is hard to check). Every amateur would sit at
  the bottom of a scale built on them.
- A low bar on such a scale may mean "never tried", not "low".
- Strava's Power Skills radar ranks a rider against a population. The app never ranks sporting ability
  (docs/ENGINEERING.md, pillar 5).

The comparison is of the athlete with themselves, so it is mass-free: a ratio of one value on the curve to
a prediction from the rest of the same curve.

## 2. The curve and the sessions

- **Ride:** the best mean power at each duration, from rides with a power meter only
  (`AnalysisResult.rideMeasuredCurve`). Estimated watts are a model's output, so comparing them with
  their own curve would measure the model. A duration whose all-rides best is estimated takes the best
  measured value at that duration, or has none.
- **Run:** the best gross metabolic power, W/kg (`runCurve`), at the prior-mean economy. A single scale
  factor on a run curve does not change a ratio of its own points.
- Durations are those of `DURATIONS_S` from 5 s to 3600 s that have a value. Each point carries the
  activity of its best, or the file holding several activities (`sessionKey`), as its session.
- The curve is the pointwise best across activities with the monotone envelope on top, so a best at a
  short duration is never below a longer one's. A duration the envelope filled from a longer effort is a
  lower bound by construction, and shows as a dip.

## 3. Requirements

A profile is shown only when the curve has all of:

- at least 5 durations with a value,
- a best at 1 min or under, and a best at 12 min or more, to pin both ends,
- bests from at least 2 sessions, so one effort cannot be the whole curve (the envelope of a single
  activity is smooth by construction).

Without a best at 15 s or under, Morton's maximal power cannot be inferred, so the short end is left out:
only 2 min to 60 min are shown, with the two-parameter model of section 4 (a note says so). When the
requirements are not met, the section shows one muted line naming what is missing. A ride's line adds
"with a power meter".

## 4. Method

**Model.** Morton's three-parameter critical-power model (Morton 1996, Ergonomics 39(4): 611-619,
doi:10.1080/00140139608964484):

    P(t) = CP + W' / (t + W' / (Pmax - CP))

For a fixed time constant k = W' / (Pmax - CP), P(t) = CP t / (t + k) + Pmax k / (t + k), which is linear
in CP and Pmax. The fitter therefore searches k on a log grid from 1 s to 600 s, refines it by golden
section, and solves CP and Pmax for each k. The coefficients are fitted on the natural log of the values by
least squares: a start from weights of 1 / P squared (the log fit to first order), then four Gauss-Newton
steps on the logs. A candidate with CP at or below 0, or Pmax at or below CP, is rejected.

Without the short end the model is the two-parameter hyperbola P(t) = CP + W' / t (Monod and Scherrer
1965, Ergonomics 8: 329-338 [unverified]), fitted the same way over CP and W'.

**Bests are lower bounds.** After a first fit, the points more than 10% below it are dropped and the curve
is fitted once more. A best far below the curve is more likely untried than a fact about the athlete, and
leaving it in would drag the curve down onto the dip it is being asked to find.

**Leave one duration out.** For each duration, the curve is fitted on the others (with the drop rule) and
read at that duration. The residual is `best / predicted - 1`: 0.14 is 14% above.

**Interval.** The interval is the residual plus and minus 1.645 times the root sum of squares of two terms: the
RMS of the other durations' leave-one-out residuals, and 3% measurement error. The first term is how far a
duration is typically from a curve fitted without it, on this athlete's own data. The second is the error
of a power meter (Maier et al. 2017, Int J Sports Med 38(6): 456-461 [unverified], as summarised in
Leo et al. 2022, Eur J Appl Physiol 122: 301-316 [unverified]). 1.645 is the normal quantile of a two-sided
90% interval. A duration **stands out** only when its interval excludes zero. At least 5% is needed, since
the 3% error alone gives a half-width of 4.9%.

The RMS excludes the duration's own residual, so a duration far from the curve does not widen its own
interval and hide itself.

**Wording.** "Your 1 min best is 14% above what your other bests suggest. Your 2 min best is 9% below: it
may be relatively low, or untested." At most the three that stand out most are named. With none standing
out: "Your bests are in line with each other from 5 s to 60 min." Words that rank or blame ("limiter",
"weak", "strength", "holding you back", "ahead of") are never used, and "grade" means age grade only.

## 5. What it can and cannot find

- A curve that follows one Morton model is found in line everywhere (a test fits one with CP 250 W, W' 20
  kJ and Pmax 1000 W and gets residuals under 1%). One duration raised 15% is flagged above at that
  duration only, and a duration held flat at the next one's best is flagged below.
- When many durations are off at once, the RMS grows, the intervals widen, and fewer stand out. This is
  intended: with no clean curve to compare against, the method says little rather than something
  confident.
- It cannot tell a low duration from an untried one. It says both.
- With 4 points and 3 parameters in a leave-one-out fit, the curve is barely identified. The requirements
  (5 durations, both ends) are the least that keep it usable, not a guarantee. The interval is measured on
  the athlete's own residuals, so it widens when the fit is poor.

## 6. Checks

- `packages/core/src/profile/durationProfile.test.ts`: curves generated from a known model, with one
  duration raised, held flat, or lowered, and every requirement.
- `packages/core/src/digest/combine.test.ts`: the measured ride curve uses power-meter rides only.
- The synthetic sample athlete has one run and one ride that set every best, so its sport pages show the
  muted "needs bests from 2 or more sessions" line.
