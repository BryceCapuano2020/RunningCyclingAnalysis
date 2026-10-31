/**
 * Every number the look-back reads, in one table (as fitness/params.ts is for the monitor). They were chosen and
 * tested together on the synthetic harness (lookback/hindsight.sim.test.ts): change them as a set and run the sims.
 * Sizes are fractions of speed or power in natural-log units; weeks are whole weeks.
 */
export const LOOKBACK = {
  /** The look-back is told through this many weeks before the newest activity; the weeks after belong to the fitness card. */
  horizonWeeks: 12,
  /** Needed before anything is told about a sport's fitness: steady runs over this many weeks before the horizon. */
  minimum: { weeks: 52, runs: 40, changes: 10 },
  /** The optimal partitioning of the steady-run series into plateaus. */
  segment: {
    /** A plateau spans at least this many weeks, and holds at least this many runs over at least this many distinct weeks. */
    minWeeks: 8,
    minRuns: 12,
    minDistinctWeeks: 8,
    /** The price of one more plateau, in squared standard deviations of a run. */
    beta: 30,
    /** A run is clipped at this many spreads of the median of the weeks round it (this many weeks either way). */
    clip: 2.5,
    clipWeeks: 13,
    /** The model-error floor under every comparison of plateaus; the library's own (D2's floorAt) replaces it when larger. */
    tau: 0.015,
    /** The floor is read at steps this far apart back from the end, and the median taken. */
    floorStepWeeks: 26,
    /** The spread of one run against the next with fewer changes than `minimum.changes` cannot be said. */
    sigmaGapDays: 14,
    sigmaFloor: 0.02,
  },
  /** An episode is listed when a step is this large and this clear (the monitor's own bar); under `shortWeeks` of data the size is `shortDelta`. */
  list: { delta: 0.04, z: 3.3, shortWeeks: 104, shortDelta: 0.08 },
  /** An episode is the lead of the look-back only on a stronger bar, and only within the last `years`. */
  lead: { delta: 0.07, z: 5.5, years: 5 },
  /** The card's slip belongs to a hindsight fall when it was declared within this many weeks before it, or twice as many after. */
  liveMatchWeeks: 8,
  /**
   * A change the fitness card declared is kept as an episode when the runs do not contradict it: a step of `delta` that is
   * `z` standard errors clear of the floor (the back test's one-sided 90% bound: the card's own test is the evidence, this only has to agree), both lower than the bar for a change the look-back finds alone. The card has
   * already vouched for it, so this only has to agree. Its date is the week where the runs split best, looked for from
   * `fallLeadWeeks` before the card declared it (it trails a change by weeks) or, for a return, from `riseLeadWeeks`
   * before the card said back; the level before is read over `beforeWeeks` and the level after over `afterWeeks`, each
   * needing `sideRuns` runs.
   */
  card: {
    delta: 0.025,
    z: 1.28,
    fallLeadWeeks: 14,
    riseLeadWeeks: 26,
    beforeWeeks: 26,
    afterWeeks: 12,
    sideWeeks: 8,
    guardWeeks: 4,
    sideRuns: 6,
  },
  /** A break is this many weeks with no run of any kind; a boundary this close to one is a step after a break. */
  gapWeeks: 8,
  afterBreakWeeks: 4,
  /** Steps in one direction with no plateau between them longer than this are one episode. */
  coalesceWeeks: 12,
  /** A quiet stretch: a plateau this long, with this many steady runs; its blocks are this many weeks. */
  quiet: { weeks: 26, runs: 40, blockWeeks: 12, blockRuns: 4 },
  /** The most each list holds, and what is dropped is counted. */
  caps: { levels: 16, episodes: 10, spans: 6, years: 15, steps: 8, verdicts: 6 },
  /** An effort has milestones from this many readings on this many different days. */
  milestones: { readings: 10, days: 3 },
} as const
