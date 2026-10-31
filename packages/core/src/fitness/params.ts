/**
 * Every number the fitness analysis reads, in one table. They were chosen and tested together (the
 * false-alarm budget of about a quarter of an alarm per athlete-year on a quiet athlete and the lag to a
 * clear drop of 4 to 6 weeks come from this set; the closing rule, the season and the learned floor were added and
 * swept against that budget in D2), so change them as a set and re-run the acceptance tests (`*.sim.test.ts`).
 * Fractions are of speed or power, in natural-log units where they are contrasts (0.04 is a 3.9% loss).
 */
export const FITNESS = {
  /** The unit of evidence: one value per steady run, read at the library's reference heart rate. */
  unit: {
    /** Indices into the run's whole kilometres: kilometre 1 is warm-up and nothing past kilometre 10 (drift). */
    firstKm: 1,
    lastKm: 9,
    minKmDistanceM: 990,
    /** A kilometre counts when its heart rate is within this many bpm of the reference. */
    hrHalfBand: 20,
    /** At most this much climb in a kilometre, and at most this much grade credit (the grade-adjusted time differs from the clock time by no more). */
    maxClimbM: 25,
    maxCredit: 0.15,
    /** A run counts only when the median change of pace between kilometres 2 to 10 is at most this, from at least `paceSteps` changes. */
    maxPaceChange: 0.05,
    paceSteps: 3,
    /** Kilometres a run needs. */
    minKm: 2,
    /** The strict unit, used when the grade fit is unstable: flatter, with a steady heart rate and pace from the kilometre before. */
    strict: { maxClimbM: 20, maxCredit: 0.06, steadyBpm: 8, steadyPace: 0.08, minKm: 3 },
    /** The reference heart rate is the median of the steady flat kilometres of the newest weeks, to the nearest `referenceStepBpm`. */
    referenceWeeks: 52,
    referenceStepBpm: 5,
  },
  /** The per-library fit of grade pass-through (kappa) and the slope of speed on heart rate (beta, per bpm). */
  fit: {
    blockDays: 28,
    /** A block with fewer kilometres tells nothing about the slope. */
    minBlockKm: 6,
    /** Fewer kilometres than this cannot fit two slopes: use the strict unit. */
    minKm: 300,
    /** Kappa is clamped to [-1, 0]: -1 is the model's whole credit, 0 none. */
    kappaMin: -1,
    kappaMax: 0,
    /** The fit is unstable, and the strict unit is used, when kappa lies this far outside [kappaMin, kappaMax] or is known no better than this. */
    kappaSlack: 0.5,
    maxKappaSe: 0.25,
    /** With less spread than this in the grade credit it cannot be fitted and its whole credit (-1) is used. */
    minCreditSd: 0.01,
    betaMin: 0.002,
    betaMax: 0.012,
    /** Used when the heart rates barely vary. */
    betaFallback: 0.005,
    minHrSd: 1,
  },
  /** Rides: measured power only, from the five-minute blocks. */
  ride: {
    hrHalfBand: 20,
    minBlocks: 2,
    betaMin: 0.002,
    betaMax: 0.02,
    betaFallback: 0.008,
    minBlockRides: 3,
  },
  /** The weekly monitor, evaluated at the end of each week from the first with enough history. */
  monitor: {
    /** The earlier level is the median of the runs from `refStartWeeks` to `refEndWeeks` ago, from at least `minRefRuns` over `minRefWeeks` distinct weeks. */
    refStartWeeks: 44,
    refEndWeeks: 8,
    minRefRuns: 12,
    minRefWeeks: 8,
    minRecentRuns: 3,
    /** A contrast needs runs from this many distinct weeks in its recent window: a burst of runs in one week cannot declare a slip. */
    minRecentWeeks: 2,
    /** The second qualifying week: a weekly evaluation counts toward `consecutive` only if that week's own steady runs read at least this share of `delta` below the baseline judged. A week without a steady run neither counts nor breaks the run. */
    confirmShare: 0.5,
    /** The non-seasonal check while no season is fitted: a slip is set aside when the same scale read at least this share of `delta` low a year earlier (it came at this time last year too), when that year holds the runs to say. */
    yoyShare: 0.5,
    /** After a rise is declared no new one is opened for this many weeks from its onset: the weeks before it are still in the baselines of the longer scales, and would declare it again. */
    riseGuardWeeks: 104,
    /** Window contrasts: recent weeks against the weeks before them. A slip is a contrast of at least `delta` at `zSlip` standard errors. */
    scales: [
      [4, 32],
      [8, 32],
      [16, 48],
      [26, 78],
    ],
    zSlip: 3.3,
    delta: 0.04,
    /** Model-error floor added to every standard error (slow wander of the level), and the larger one in printed ranges. */
    tau: 0.01,
    rangeTau: 0.02,
    /**
     * The floor learns the library's own wander. Blocks of `floorBlockWeeks` weeks from `floorWeeks` back to 8 weeks
     * back (at least `floorMinBlocks` blocks of `floorBlockRuns` runs, else `tau`); the robust spread of their levels
     * beyond the sampling noise of a block is the wander, and what it shows past `floorRef` (the reference athlete's)
     * adds to `tau` in quadrature, `floorGain` times over, to at most `floorMax`.
     */
    floorBlockWeeks: 6,
    floorWeeks: 108,
    floorMinBlocks: 14,
    floorBlockRuns: 2,
    floorRef: 0.02,
    floorGain: 1,
    floorMax: 0.02,
    /** 1: blocks that overlap a real dip (an episode that reached "back") are left out of the wander; 0 reads them as wander. */
    floorSkipDips: 1,
    /** Run values are clipped at the window's median plus or minus this many spreads. */
    clip: 2.5,
    /** Weekly evaluations in a row a contrast must hold to declare a slip. */
    consecutive: 2,
    /** The spread of one run against the next: from changes up to `sigmaGapDays` apart in the last year, at least `sigmaFloor`, `sigmaPrior` with fewer than `sigmaMinSteps`. */
    sigmaWeeks: 52,
    sigmaGapDays: 14,
    sigmaMinSteps: 10,
    sigmaFloor: 0.02,
    sigmaPrior: 0.045,
    /** Onset: the best split between 3 and `onsetMaxWeeks` weeks back, against `onsetBaseWeeks` before it. */
    onsetMinWeeks: 3,
    onsetMaxWeeks: 40,
    onsetBaseWeeks: 32,
    onsetMinAfter: 4,
  },
  /**
   * The athlete's own seasonal pattern, fitted from the steady-run series once `minYears` full years exist: one
   * annual sine and cosine on the last whole years of runs (at most `maxYears`), shrunk to nothing unless it
   * stands out from the wander, and taken out of every run before the tests read it.
   */
  season: {
    minYears: 2,
    maxYears: 4,
    /** Runs the fit needs, and in each quarter of the year. */
    minRuns: 80,
    minQuarterRuns: 12,
    /** Residuals are clipped at this many robust spreads and the fit repeated once. */
    clip: 2.5,
    /** The fitted amplitude is shrunk by `1 - shrinkK / r`, r being its squared size over the variance of one coefficient (weekly levels, with their lag-1 correlation); no term below that. */
    shrinkK: 6,
    maxRho: 0.9,
    /** The term is dropped below this amplitude (log units) and never exceeds `maxAmplitude`. */
    minAmplitude: 0.003,
    maxAmplitude: 0.06,
    /** Days of runs the tests read back from a week's end: the longest window any of them uses. */
    lookbackWeeks: 110,
    /** The swing is refitted every this many weeks (not every week: it moves slowly, and a fit is the dearest step of a replay); between fits the last one is used. */
    refitWeeks: 4,
  },
  /** After a slip is declared the reference is frozen and the episode is followed until it closes. */
  episode: {
    /** The level now is the runs of the last 8 weeks, widened to 12 then 16 until it holds `minRuns`. */
    levelWeeks: [8, 12, 16],
    minRuns: 6,
    /** Plateau: at least `stableWeeks` since declared, `dwell` in the phase, and a trend over `trendWeeks` that is flat within `plateauTol`. */
    stableWeeks: 12,
    dwell: 8,
    trendWeeks: 24,
    trendMinRuns: 10,
    trendMinWeeks: 8,
    plateauTol: 0.05,
    /** A fresh fall (trend at most -`reslip` at `zReslip`) after `dwell` weeks sends recovering or holding back to slipping. */
    reslip: 0.04,
    zReslip: 2.5,
    /** Rising, on `consecutive` weekly evaluations, by any of: a contrast against the episode's own low, a 26-week trend, or a rise from the 20-week trough. */
    riseWindows: [8, 16, 26],
    riseBaseWeeks: 48,
    riseOnsetSkipDays: 14,
    /** The model-error floor in the rise tests, and how fast it grows with the episode's age (per square-root week). */
    riseTau: 0.01,
    riseTauGrowth: 0,
    /** How many of the contrast and the trend must fire (the trough rule stands alone), and for how many weekly evaluations running. */
    contrastAgree: 2,
    recoverConsecutive: 2,
    zUp: 4.3,
    deltaUp: 0.04,
    zTrendUp: 4.0,
    deltaTrendUp: 0.035,
    troughWeeks: 20,
    troughMinRuns: 10,
    deltaTrough: 0.07,
    zTrough: 6.5,
    /** Back: a 12-week level (8 runs) within `backPoint` of the reference with its lower bound above -`backTol`, 3 weeks running and at least 4 weeks after the slip. */
    backWeeks: [12, 16],
    backMinRuns: 8,
    backPoint: 0.01,
    /** The one-sided bound (z of 1.28, 90%) the plateau and back tests hold their tolerances to. */
    boundZ: 1.28,
    backTol: 0.02,
    backConsecutive: 3,
    backMinWeeks: 4,
    /** After this many weeks in back the episode closes and the reference is read afresh. Below -(backTol + backRelapse) it reopens as slipping. */
    backHoldWeeks: 12,
    /** A rise that has settled is shown as improved for this many weeks, then the episode closes and the reference is read afresh. */
    improvedHoldWeeks: 12,
    /** And it is told as improved only when the gain's lower bound (one-sided, `boundZ`) is at least this much above the reference: the mirror of the tolerance a return must clear to be back. */
    improvedTol: 0.03,
    backRelapse: 0.01,
    /**
     * A drop that is no longer clear closes the episode as holding. The level is the runs since the onset (at most
     * `closeLevelWeeks` weeks, needing `closeMinRuns` over `closeMinWeeks` weeks); a week is quiet when its range
     * (`closeZ` standard errors, the model-error floor `closeTau`) against the reference reaches no change; the episode
     * closes after `closeWeeks` quiet weeks running.
     */
    closeWeeks: 12,
    /** In recovering the wait is longer, so a return that is on its way to "back" gets there first. */
    closeRecoveringWeeks: 26,
    closeZ: 1.645,
    closeTau: 0.015,
    closeLevelWeeks: 26,
    closeMinRuns: 12,
    closeMinWeeks: 8,
    /** Standard error of a median against a mean. */
    medianFactor: 1.2533,
  },
  /** What is shown. */
  display: {
    /** A new state is shown once it has held for this many weekly evaluations. */
    holdWeeks: 2,
    /** The status line needs this many steady runs in the last `recentWeeks` weeks, and one in the last `breakWeeks`. */
    recentWeeks: 8,
    minRecentRuns: 4,
    breakWeeks: 4,
    /** A slip or a rise is told over the shortest of these stretches (weeks) that holds enough runs. */
    nowWeeks: [4, 6, 8, 12, 16],
    /** Holding is said only when the level is known to within this much. */
    maxWithin: 0.06,
    /** The level series: a point every `seriesStepWeeks`, back over at most `seriesWeeks` weeks. */
    seriesStepWeeks: 4,
    seriesWeeks: 76,
    /** The percentage of a printed range (one-sided 5% tails). */
    rangeZ: 1.645,
    /** A state is a fresh finding for this many weeks after it is first shown (the engine's stale limit is 8). */
    freshWeeks: 6,
  },
  /** The finding made of a fresh state. */
  finding: {
    /** The monitor's own gate (z of 3.3 held two weeks, tuned to a false-alarm budget) is the evidence a change is out of the ordinary. The engine judges surprise against the usual spread of that statistic, which for a z-score is 1. */
    quietSpread: 1,
    /** The newest steady runs a finding points at. */
    evidenceRuns: 24,
    minHistoryWeeks: 16,
  },
} as const

/**
 * Rides are compared: the ride unit runs the same monitor as the run unit, and `ride.sim.test.ts` is its gate. At the
 * spreads of a measured-power ride (2.4% to 4.5% a ride, wider than a run's because a five-minute block has no steadiness
 * test) it holds the run budget when nothing changes and sees a loss of 8% in a few weeks. Turn it off, and the ride
 * card and findings go, if those sims ever fail; calibrate `FITNESS.ride` on real power-meter libraries when there are some.
 */
export const RIDE_FITNESS_ENABLED = true
