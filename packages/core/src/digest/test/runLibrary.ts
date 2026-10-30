import { DAY_MS, DURATIONS_S } from '../../constants'
import { sampleDataset } from '../../synthetic'
import type { ActivityDigest, DigestCurvePoint } from '../../types'
import { digestActivity } from '../digestActivity'

/** An outdoor run from the sample, to copy. */
const TEMPLATE = sampleDataset()
  .activities.map((activity) => digestActivity(activity))
  .find((d) => d.sport === 'run' && !d.indoor)!

/** Monday 4 January 2021, midday UTC. */
export const FIRST_MONDAY_MS = Date.UTC(2021, 0, 4, 12)

/**
 * The curve of a run whose best efforts follow a threshold of `level` times 14 W/kg and 900 J/kg above it, so every
 * effort from 3 to 20 minutes lies on one line in 1 / duration and the fit is exact. Metabolic W/kg, as a digest's run
 * curve is.
 */
export function runCurve(level: number): DigestCurvePoint[] {
  return DURATIONS_S.map((durationS) => ({
    durationS,
    value: level * (14 + 900 / durationS),
    startIndex: 0,
    windowS: durationS,
    heartRate: null,
    terms: null,
  }))
}

/** A run on a day (counted from the first Monday), with the efforts of `level` (see runCurve). */
export function levelRun(id: string, day: number, level: number): ActivityDigest {
  return {
    ...TEMPLATE,
    id,
    name: id,
    startMs: FIRST_MONDAY_MS + day * DAY_MS,
    indoor: false,
    curve: runCurve(level),
    hrBlocks: [],
    flags: [],
    flagCounts: {},
    maxHeartRate: null,
    hasHeartRate: false,
  }
}

/** One run a week for `weeks` weeks from `fromWeek`, at the level `levelAt` gives for the week. */
export function weeklyRuns(
  fromWeek: number,
  weeks: number,
  levelAt: (week: number) => number,
): ActivityDigest[] {
  return Array.from({ length: weeks }, (_, i) =>
    levelRun(`run-${fromWeek + i}`, (fromWeek + i) * 7 + 2, levelAt(fromWeek + i)),
  )
}

/** A run with no effort longer than 5 minutes: an easy or short run that holds a best only at its short durations. */
export function shortRun(id: string, day: number, level: number): ActivityDigest {
  const run = levelRun(id, day, level)
  return {
    ...run,
    curve: run.curve.map((point) =>
      point.durationS > 300
        ? Object.assign({}, point, { value: Number.NaN, startIndex: -1 })
        : point,
    ),
  }
}
