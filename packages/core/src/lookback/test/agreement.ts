import { DAY_MS } from '../../constants'
import { WEEK_ORIGIN_MS } from '../../fitness/machine'
import type { MachineState } from '../../fitness/machine'
import { replaySim, simulate } from '../../fitness/test/runSim'
import type { SimSpec } from '../../fitness/test/runSim'
import { fitnessHistories, fitnessStatuses } from '../../fitness/compute'
import { rideLibrary } from '../../fitness/test/rideSim'
import type { RideSpec } from '../../fitness/test/rideSim'
import { hindsightOf } from '../hindsight'
import type { HindsightFitness } from '../types'

/**
 * Hindsight against the live monitor on one simulated library (design 1.3): what the look-back says about the level at
 * the horizon, and what the fitness card says as of the newest run.
 */

/** The look-back's call about the last plateau at the horizon. */
export type Call = 'steady' | 'lower' | 'higher' | 'back' | 'no-call'
/** The card's state, as the monitor has it. */
export type Live = MachineState | 'none'

export interface Agreement {
  call: Call
  live: Live
  years: HindsightFitness | null
  /** The weeks at which the monitor declared a slip or a rise, through the horizon. */
  declared: number[]
  horizonWeek: number
}

/** What the look-back says of the level at the horizon: the last plateau against the one before it. */
export function callOf(years: HindsightFitness | null): Call {
  if (years === null) return 'no-call'
  const last = years.levels.at(-1)
  const episode = years.episodes.at(-1)
  if (last === undefined || episode === undefined) return 'steady'
  // An episode counts for the last plateau when it ended where that plateau began (a week either way) or is still open.
  const reaches = episode.toMs === null || episode.toMs >= last.fromMs - 7 * DAY_MS
  if (!reaches) return 'steady'
  switch (episode.kind) {
    case 'slip-open':
    case 'slip-partly-back':
      return 'lower'
    case 'slip-back':
      return 'back'
    case 'improvement':
      return 'higher'
    case 'after-break':
      return episode.change.value < 0 ? 'lower' : 'higher'
  }
}

/** The look-back and the monitor over the same simulated library. */
export function agreement(
  spec: Partial<SimSpec> & Pick<SimSpec, 'weeks'>,
  seed: number,
): Agreement {
  const runs = simulate({ perWeek: 3, ...spec }, seed)
  const result = hindsightOf({ runs, activeDays: runs.map((r) => r.t), asOfDay: spec.weeks * 7 })
  const years = result.kind === 'ok' ? result : null
  const records = replaySim(runs, spec.weeks)
  const horizonWeek =
    years === null ? spec.weeks : Math.floor((years.toMs - WEEK_ORIGIN_MS) / (7 * DAY_MS))
  return {
    call: callOf(years),
    live: records.at(-1)?.state ?? 'none',
    years,
    declared: records
      .filter(
        (r) => (r.state === 'slipping' || r.state === 'improving') && r.fresh && r.w <= horizonWeek,
      )
      .map((r) => r.w),
    horizonWeek,
  }
}

const weekOf = (ms: number) => (ms - WEEK_ORIGIN_MS) / (7 * DAY_MS)

/** The weeks a hindsight episode begins and ends at (an open one ends at the horizon). */
export const spanWeeks = (e: { fromMs: number; toMs: number | null }, horizonMs: number) => ({
  from: weekOf(e.fromMs),
  to: weekOf(e.toMs ?? horizonMs),
})

/** Whether a live declaration and a hindsight episode are about the same event: within 8 weeks of its span. */
export const overlaps = (
  week: number,
  episode: { fromMs: number; toMs: number | null },
  horizonMs: number,
): boolean => {
  const { from, to } = spanWeeks(episode, horizonMs)
  return week >= from - 8 && week <= to + 8
}

const NONE: ReadonlySet<string> = new Set()

/** The same, for rides with a power meter, through the real unit, the look-back and the card. */
export function rideAgreement(spec: RideSpec): Agreement {
  const digests = rideLibrary(spec)
  const lastMs = Math.max(...digests.map((d) => d.startMs))
  const options = { nowMs: Math.floor(lastMs / DAY_MS) * DAY_MS }
  const { runs } = fitnessHistories(digests, NONE, options).ride
  const asOfDay = Math.max(...runs.map((r) => r.t)) + 1
  const result = hindsightOf({ runs, activeDays: runs.map((r) => r.t), asOfDay })
  const years = result.kind === 'ok' ? result : null
  const status = fitnessStatuses(digests, NONE, options).ride.state
  return {
    call: callOf(years),
    live: status === 'not-enough-evidence' ? 'none' : status,
    years,
    declared: [],
    horizonWeek: spec.weeks,
  }
}
