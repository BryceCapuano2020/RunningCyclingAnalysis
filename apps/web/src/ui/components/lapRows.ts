import { MIN_RUN_SPEED_MS } from '@rca/core/metabolic'
import { QUALITY_THRESHOLDS } from '@rca/core/quality'
import type { UnitSystem } from '@rca/core/units'
import {
  METRES_PER_KM,
  METRES_PER_MILE,
  formatDistance,
  formatPace,
  formatPartialDistance,
  formatRecordTime,
} from '@rca/core/units'
import type { ActivityTrace } from '@rca/core/workbench'
import { lapFiguresOf, lapHeartRate, type LapFigures } from './lapFigures'
import { fastestOf, type SplitCells } from './splitRows'

/** Laps below this many are not a view of their own: one lap is the whole run. */
export const MIN_LAPS = 2
/** Laps this close to a unit's length, as a fraction of it, are that long. */
const SAME_LENGTH = 0.03
/** A lap timed for fewer seconds than this has no pace: the distance over so few is noise. */
export const MIN_TIMED_S = 5

/**
 * Whether the laps are a watch's automatic laps of one mile or one kilometre. Every lap but the last,
 * which is the remainder, is within a few percent of the same unit, and so repeats the splits; laps of
 * any other length, such as 400 m or 5 km, or a rest between reps, say what the splits cannot. A lap
 * that holds a gap the device did not record is left out of the judgement, because the distance may
 * have stepped across the gap and made it long; so is one with no distance. If most laps are left out
 * there is nothing to judge by, and the laps are offered.
 */
function automaticLaps(laps: LapFigures[]): boolean {
  const body = laps.slice(0, -1)
  const judged = body.filter(
    (lap): lap is LapFigures & { distanceM: number } => lap.distanceM !== null && !lap.gapped,
  )
  if (judged.length === 0 || judged.length * 2 < body.length) return false
  return [METRES_PER_MILE, METRES_PER_KM].some((unit) =>
    judged.every((lap) => Math.abs(lap.distanceM - unit) <= SAME_LENGTH * unit),
  )
}

const offered = new WeakMap<ActivityTrace, boolean>()

/** Whether the device recorded laps that say more than the splits do: more than one, not automatic. */
export function hasRecordedLaps(trace: ActivityTrace | null): trace is ActivityTrace {
  if (trace === null || trace.laps.length < MIN_LAPS) return false
  const kept = offered.get(trace)
  if (kept !== undefined) return kept
  const laps = lapFiguresOf(trace)
  const answer = laps.length >= MIN_LAPS && !automaticLaps(laps)
  offered.set(trace, answer)
  return answer
}

/**
 * A lap's speed, m/s: its distance less what its rests gained, over its timed seconds, as a split's
 * is. A lap with no distance, too few timed seconds, too slow to be running, or faster than any
 * runner has no speed: its boundary may sit just after a GPS jump.
 */
function lapSpeed(lap: LapFigures, maxSpeedMs: number): number | null {
  if (lap.distanceM === null || lap.timedS < MIN_TIMED_S) return null
  const speed = (lap.distanceM - lap.restM) / lap.timedS
  return speed >= MIN_RUN_SPEED_MS && speed <= maxSpeedMs ? speed : null
}

/** A lap's time as the table says it: m:ss, or why there is none (null reads as not timed). */
function lapTime(timedS: number): string | null {
  if (timedS >= MIN_TIMED_S) return formatRecordTime(timedS)
  return timedS > 0 ? `Under ${MIN_TIMED_S} s` : null
}

/**
 * The device's own laps in display form, from the trace's seconds. A lap's time is its seconds less
 * its rests and its pace is its distance, less what the rests gained, over that time, as a split's is,
 * so a rest the device did not time does not slow it, and a gap the runner moved through does not
 * speed it.
 */
export function lapCellsOf(trace: ActivityTrace, units: UnitSystem): SplitCells[] {
  const unitMetres = units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM
  const maxSpeedMs = QUALITY_THRESHOLDS.speedSpike.maxSpeedMs[trace.sport]
  const laps = lapFiguresOf(trace)
  const speeds = laps.map((lap) => lapSpeed(lap, maxSpeedMs))
  const { fastest, fastestIndex } = fastestOf(speeds)
  return laps.map((lap, index) => {
    const speed = speeds[index]!
    const heartRate = lapHeartRate(trace, lap.startS, lap.endS)
    const { distanceM } = lap
    return {
      label: `${index + 1}`,
      fastest: index === fastestIndex,
      pace: speed === null ? null : formatPace(speed, units),
      barPercent: speed === null || fastest === null ? null : (speed / fastest) * 100,
      gradeAdjustedPace: null,
      flatWithheld: false,
      elevation: null,
      heartRate: heartRate === null ? null : `${Math.round(heartRate)} bpm`,
      lap: {
        time: lapTime(lap.timedS),
        distance:
          distanceM === null
            ? null
            : distanceM > 0 && distanceM < unitMetres
              ? formatPartialDistance(distanceM, units)
              : formatDistance(distanceM, units),
      },
    }
  })
}
