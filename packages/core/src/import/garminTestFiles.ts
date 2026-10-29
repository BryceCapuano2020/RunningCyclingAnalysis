/** Test-only: a Garmin activity summary in the shape of a real one, for the unit and perf tests alike. */

/** The start of the first activity, and an hour between them. */
export const SUMMARY_START_MS = Date.UTC(2024, 4, 1, 7, 30)
export const SUMMARY_STEP_MS = 3_600_000

/** About 3 KB an activity: a hundred figures, nested objects and a list of splits. */
export function realisticSummary(count: number): string {
  const activity = (i: number) => ({
    activityId: 1_000_000 + i,
    name: `Activity number ${i}`,
    activityType: 'running',
    startTimeGmt: SUMMARY_START_MS + i * SUMMARY_STEP_MS,
    beginTimestamp: SUMMARY_START_MS + i * SUMMARY_STEP_MS,
    ...Object.fromEntries(Array.from({ length: 100 }, (_, f) => [`metric${f}`, i * 1.5 + f])),
    summarizedDiveInfo: { surfaceCondition: null, waterType: null },
    splitSummaries: Array.from({ length: 8 }, (_, s) => ({
      splitType: 'RWD_RUN',
      distance: s,
      noOfSplits: 1,
    })),
    note: 'x'.repeat(800),
  })
  return JSON.stringify([
    { summarizedActivitiesExport: Array.from({ length: count }, (_, i) => activity(i)) },
  ])
}
