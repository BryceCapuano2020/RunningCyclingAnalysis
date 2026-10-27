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
  activity is smooth by construction). Durations and sessions are counted over the durations the
  profile is made from, so without a best at 15 s or under they are counted over 2 min and up.

Without a best at 15 s or under, Morton's maximal power cannot be inferred, so the short end is left out:
only 2 min to 60 min are shown, with the two-parameter model of section 4 (a note says so). When the
requirements are not met, the section shows one muted line naming what is missing. A ride's line adds
"with a power meter". When all of it is there but no curve can be fitted to enough of the durations (fewer
than five have a valid fit), the line says a curve could not be fitted, which is not a duration missing.

## 4. Method

**Model.** Morton's three-parameter critical-power model (Morton 1996, Ergonomics 39(4): 611-619,
doi:10.1080/00140139608964484):

    P(t) = CP + W' / (t + W' / (Pmax - CP))

For a fixed time constant k = W' / (Pmax - CP), P(t) = CP t / (t + k) + Pmax k / (t + k), which is linear
in CP and Pmax. The fitter therefore searches k on a 13-point log grid from 1 s to 600 s, refines the best point by golden
section (twelve steps, one evaluation each), and solves CP and Pmax for each k. The coarse grid costs no
accuracy that the false-alarm table in section 6 shows, and with columns reused between solves it brings a
full profile from about 15 ms to about 1 ms. The coefficients are fitted on the natural log of the values by
least squares: a start from weights of 1 / P squared (the log fit to first order), then four Gauss-Newton
steps on the logs. A candidate with CP at or below 0, or Pmax at or below CP, is rejected.

Without the short end the model is the two-parameter hyperbola P(t) = CP + W' / t (Monod and Scherrer
1965, Ergonomics 8: 329-338 [unverified]), fitted the same way over CP and W'.

**Bests are lower bounds.** After a first fit, the points more than 10% below it are dropped and the curve
is fitted once more. A best far below the curve is more likely untried than a fact about the athlete, and
leaving it in would drag the curve down onto the dip it is being asked to find.

**Leave one duration out.** For each duration, the curve is fitted on the others (with the drop rule) and
read at that duration. The residual is `best / predicted - 1`: 0.14 is 14% above. A duration is left out,
with no residual, when the curve has Pmax and the others hold no best at 15 s or under: with a lone short
best, reading it from a curve fitted to longer efforts is an extrapolation to a duration the model has no
data for, and it would give an arbitrary number. A duration with no row takes no part in any other's
interval.

**Interval.** The interval is the prediction interval of the fit on the others, on the log scale, in
the form for a nonlinear least-squares fit:

    ln(best / predicted) +/- t * s * sqrt(1 + g' (J'J)^-1 g)

J is the gradient of ln P with respect to (CP, Pmax, k) at the durations the fit used, and g is that
gradient at the duration asked about. A duration beyond the others, or one the curve is sensitive to, so
gets a wider interval than one amid them. This matters: the earlier version pooled the leave-one-out
residuals into one RMS, but those residuals are much larger at the two ends of the curve than in the middle,
so a pooled RMS flagged the ends of a curve of pure noise far too often (41% of 18-duration profiles at 3%
noise).

- s is the residual standard deviation of the fit on the others, `sqrt(SSE / df)` with df the points the fit
  used less its parameters (3, or 2 without Pmax), and never below 3%, the error of a power meter (Maier et
  al. 2017, Int J Sports Med 38(6): 456-461 [unverified], as summarised in Leo et al. 2022, Eur J Appl Physiol
  122: 301-316 [unverified]). A fit through few points can match them closely by chance, and the meter's error
  is in every best. A fit with no degree of freedom left has no interval, and a curve whose parameters cannot
  be told apart has an infinite one.
- t is a Student's t quantile with that df, not 1.645: with four points and three parameters there is one
  degree of freedom, and the t quantile there is very large, so five durations can almost never be flagged.
  That is the intent.
- The level is 5% for the profile as a whole: each of its n rows is judged at 5% over n (Bonferroni), so
  that a profile of nothing but noise says something stands out in under 10% of cases (section 6). Judging
  each row at 10% would flag some row in nearly half of 18-duration profiles.

A duration **stands out** only when its interval, put back from logs to fractions, excludes zero.

**Wording.** "Your 1 min best is 14% above what your other bests suggest. Your 2 min best is 9% below: it
may be relatively low, or untested." At most the three that stand out most are named, and only those whose
interval clears zero by 2% at its near end; one that stands out by less is on the chart and not in the
sentence, which then ends "apart from small differences on the chart". With none standing out: "Your bests
are in line with each other from 5 s to 60 min.", and the page shows no chart. Words that rank or blame ("limiter",
"weak", "strength", "holding you back", "ahead of") are never used, and "grade" means age grade only.

## 5. What it can and cannot find

- A curve that follows one Morton model is found in line everywhere (a test fits one with CP 250 W, W' 20
  kJ and Pmax 1000 W and gets residuals under 1%). One duration raised 15% is flagged above at that
  duration only, and a duration held flat at the next one's best is flagged below.
- When many durations are off at once, the fit's residual grows, the intervals widen, and fewer stand
  out. This is intended: with no clean curve to compare against, the method says little rather than
  something confident.
- It cannot tell a low duration from an untried one. It says both.
- With 4 points and 3 parameters in a leave-one-out fit, the curve is barely identified. The requirements
  (5 durations, both ends) are the least that keep it usable, not a guarantee. The interval is wide there
  (one degree of freedom), so a five-duration profile almost never flags a duration.

## 6. Checks

- `packages/core/src/profile/durationProfile.test.ts` and `.edges.test.ts`: curves generated from a known
  model, with one duration raised, held flat, or lowered, every requirement, a lone short best, a curve no
  model fits, and the sessions counted over the durations shown.
- `packages/core/src/profile/durationProfile.calibration.test.ts`: a seeded simulation of pure noise on a
  true Morton curve (CP 250 W, W' 20 kJ, Pmax 1000 W), multiplicative lognormal noise of 1%, 3% and 6%, at
  5, 8 and 18 durations. The share of profiles that flag at least one duration must be under 10%. Measured
  at 400 profiles per cell with seed 777 (the test uses 400 with its own seed):

  | Noise | 5 durations | 8 durations | 18 durations |
  | ----- | ----------- | ----------- | ------------ |
  | 1%    | 0.0%        | 0.0%        | 0.0%         |
  | 3%    | 0.0%        | 0.0%        | 0.0%         |
  | 6%    | 0.0%        | 1.8%        | 4.3%         |
  | 10%   | 0.0%        | 5.5%        | 13.3%        |

  At 10% noise, five times the meter's error and the size of the drop rule's cut, the rate passes 10% at 18
  durations: the rule drops the points more than 10% below the fit, which trims the fit's residual and so
  its interval. The page is calibrated for bests that scatter about their curve by the meter's error up to
  about twice it, which is the case for bests of well-recorded efforts; with scatter beyond that it is
  somewhat too ready to flag.

- `packages/core/src/profile/studentT.test.ts`: the quantile against standard t tables.
- `packages/core/src/digest/combine.test.ts`: the measured ride curve uses power-meter rides only.
- The synthetic sample athlete has one run and one ride that set every best, so its sport pages show the
  muted "needs bests from 2 or more sessions" line.
