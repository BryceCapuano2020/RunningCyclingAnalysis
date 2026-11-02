import { DAY_MS, DURATIONS_S, HEADLINE_DURATION_S, THRESHOLD_HOLD_S } from '../constants'
import type { ActivityDigest, BikeModel, Sport } from '../types'
import { effortsCount } from './effortTrust'
import type { EstimatedRideGate } from './estimatedRide'
import { estimatedStanding } from './estimatedRide'
import type { Masses } from './masses'
import { pointWkg } from './rideCurves'
import type { FloorEffort, ThresholdFloor, ThresholdFloors } from './thresholdTimelineTypes'

/** The days a floor reaches back: 12 months up to the date it is taken at. */
export const FLOOR_WINDOW_DAYS = 365

const HOLD_INDEX = DURATIONS_S.indexOf(THRESHOLD_HOLD_S)
const HEADLINE_INDEX = DURATIONS_S.indexOf(HEADLINE_DURATION_S)

/**
 * What each counted activity gives a floor: its 30 minute and its 20 minute best, priced as the library's curves are (a run at
 * the prior-mean economy, a ride from its watts at the body mass of its day), oldest first. An activity with neither is left out.
 */
export function floorEffortsOf(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
): ThresholdFloors {
  const standing = estimatedStanding(gate)
  const efforts = (sport: Sport): FloorEffort[] =>
    ordered
      .filter((digest) => digest.sport === sport && effortsCount(digest))
      .flatMap((digest) => {
        const at = (index: number) => {
          const point = digest.curve[index]
          const { wkg } =
            point === undefined
              ? { wkg: Number.NaN }
              : pointWkg(point, digest, masses, bikeModel, standing)
          return wkg > 0 && Number.isFinite(wkg) ? Math.round(wkg * 1e4) / 1e4 : 0
        }
        const hold = at(HOLD_INDEX)
        const headline = at(HEADLINE_INDEX)
        return hold === 0 && headline === 0 ? [] : [[digest.startMs, hold, headline] as const]
      })
      .sort((a, b) => a[0] - b[0])
  return { run: efforts('run'), ride: efforts('ride') }
}

/** The index of the first effort starting at or after `ms`, in efforts oldest first. */
function firstFrom(efforts: readonly FloorEffort[], ms: number): number {
  let low = 0
  let high = efforts.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (efforts[middle]![0] < ms) low = middle + 1
    else high = middle
  }
  return low
}

/** The best 30 minutes among the efforts from `from` to `to` inclusive, else the best 20; null when they have neither. */
function bestWithin(
  efforts: readonly FloorEffort[],
  from: number,
  to: number,
): ThresholdFloor | null {
  let hold: ThresholdFloor | null = null
  let headline: ThresholdFloor | null = null
  for (let i = firstFrom(efforts, from); i < efforts.length && efforts[i]![0] <= to; i++) {
    const [startMs, heldWkg, headlineWkg] = efforts[i]!
    if (heldWkg > 0 && (hold === null || heldWkg > hold.value)) {
      hold = { durationS: THRESHOLD_HOLD_S, value: heldWkg, asOfMs: startMs }
    }
    if (headlineWkg > 0 && (headline === null || headlineWkg > headline.value)) {
      headline = { durationS: HEADLINE_DURATION_S, value: headlineWkg, asOfMs: startMs }
    }
  }
  return hold ?? headline
}

/**
 * The floor on a sport's threshold at an instant: its best 30 minutes in the 12 months up to the instant, else its best 20
 * (none of the efforts after it, none of the ones before that year). With none in the window, `current` zones (those for
 * today) may stand on the newest effort before it, with the best of the 12 months ending with that effort; zones for a date
 * in the past have no floor then. Null when there is none to take.
 */
export function floorAt(
  efforts: readonly FloorEffort[],
  at: number,
  current: boolean,
): ThresholdFloor | null {
  const from = at - FLOOR_WINDOW_DAYS * DAY_MS
  const found = bestWithin(efforts, from, at)
  if (found !== null || !current) return found
  const newest = efforts[firstFrom(efforts, from) - 1]
  if (newest === undefined) return null
  return bestWithin(efforts, newest[0] - FLOOR_WINDOW_DAYS * DAY_MS, newest[0])
}
