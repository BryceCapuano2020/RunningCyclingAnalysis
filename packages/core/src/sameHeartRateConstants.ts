/**
 * Output at the same heart rate (docs/research/same-heart-rate.md). Each week fits output on heart
 * rate over the blocks of the trailing windowDays (wideWindowDays when those hold under minActivities
 * activities), and reports it at a reference heart rate kept for the whole period. A week reports only with
 * at least minBlocks blocks from minActivities activities in minWeeks different weeks, and heart rate
 * spread of at least minSpreadBpm (standard deviation). At most maxBlocks blocks from at most maxActivities
 * activities enter a fit. A period reports at most maxWeeks weeks, all time every week. The reference heart
 * rate is the median of the library's newest referenceWeeks weeks of blocks, so it does not move with the
 * period; where the session has the fitness card's heart rate it reads at that instead, and a week whose window lies
 * wholly above or below it reaches back to wideWindowDays too. A change is only said with minReportedWeeks reporting weeks. The 90% interval is built from the
 * spread of `draws` resamples of the activities, seeded with `seed`, and widened for few activities (see
 * theilSen.ts).
 */
export const SAME_HEART_RATE = {
  windowDays: 28,
  wideWindowDays: 56,
  minBlocks: 8,
  minActivities: 6,
  minWeeks: 2,
  minSpreadBpm: 5,
  maxBlocks: 48,
  maxActivities: 24,
  maxWeeks: 52,
  referenceWeeks: 52,
  minReportedWeeks: 4,
  referenceStepBpm: 5,
  draws: 200,
  seed: 1,
} as const
