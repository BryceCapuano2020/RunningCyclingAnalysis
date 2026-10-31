import { DAY_MS } from '../constants'
import { orderedFor } from '../digest/consumers'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { memoByDigests } from '../digestMemo'
import { fitnessHistories, fitnessStatuses } from '../fitness/compute'
import { dayOfMs, WEEK_ORIGIN_MS } from '../fitness/machine'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { hindsightOf, horizonDay } from './hindsight'
import { milestonesOf } from './milestones'
import type { EffortMilestones, SportYears } from './types'

/** A sport's years: its fitness told in hindsight, and its best efforts over the years. */
export interface SportLookBack {
  sport: Sport
  /** The heart rate the fitness is read at, bpm; null without a steady run. */
  referenceHr: number | null
  fitness: SportYears
  milestones: EffortMilestones[]
}

export interface LookBack {
  /** The date the look-back is as of: the newest activity's, or the wall clock if that is later. */
  asOfMs: number
  /** The years are told through here; the weeks after it belong to the fitness card. */
  horizonMs: number
  sports: Record<Sport, SportLookBack>
}

const SPORTS: readonly Sport[] = ['run', 'ride']

/** Nothing to say: no library. */
export const NO_LOOKBACK: LookBack = {
  asOfMs: 0,
  horizonMs: 0,
  sports: {
    run: { sport: 'run', referenceHr: null, fitness: { kind: 'unavailable' }, milestones: [] },
    ride: { sport: 'ride', referenceHr: null, fitness: { kind: 'unavailable' }, milestones: [] },
  },
}

export interface LookBackInput {
  settings: AthleteSettings
  setAside: ReadonlySet<string>
  /** The wall clock, cut to the day by the caller so the memory still hits. */
  nowMs: number
  gate: EstimatedRideGate | null | undefined
}

function compute(digests: ActivityDigest[], input: LookBackInput): LookBack {
  const current = orderedFor('fitness', digests)
  if (current.length === 0) return NO_LOOKBACK
  const options = { nowMs: input.nowMs }
  const asOfMs = Math.max(current.at(-1)!.startMs, input.nowMs)
  const asOfDay = dayOfMs(asOfMs)
  const statuses = fitnessStatuses(digests, input.setAside, options)
  const histories = fitnessHistories(digests, input.setAside, options)
  const milestones = milestonesOf(digests, input.settings, input.gate)
  const sport = (s: Sport): SportLookBack => ({
    sport: s,
    referenceHr: histories[s].referenceHr,
    fitness:
      statuses[s].shortfall?.kind === 'unavailable'
        ? { kind: 'unavailable' }
        : hindsightOf({
            runs: histories[s].runs,
            activeDays: current.filter((d) => d.sport === s).map((d) => dayOfMs(d.startMs)),
            asOfDay,
          }),
    milestones: milestones[s],
  })
  return {
    asOfMs,
    horizonMs: WEEK_ORIGIN_MS + horizonDay(asOfDay) * DAY_MS,
    sports: { run: sport('run'), ride: sport('ride') },
  }
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a === b || (a.size === b.size && [...a].every((id) => b.has(id)))

const remembered = memoByDigests<LookBackInput, LookBack>(
  compute,
  (a, b) =>
    sameSet(a.setAside, b.setAside) &&
    a.nowMs === b.nowMs &&
    a.gate === b.gate &&
    a.settings.massKg === b.settings.massKg &&
    a.settings.bikeMassKg === b.settings.bikeMassKg &&
    a.settings.measurements === b.settings.measurements,
)

/**
 * The library's years: each sport's fitness at the same effort in hindsight, and its bests over the years. A function
 * of the digests, the set-aside list, the settings and the date alone, library-wide (whatever period is picked), and
 * remembered for the same digests so that a change of period costs nothing.
 */
export function lookBackOf(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  setAside: ReadonlySet<string>,
  nowMs: number,
  gate?: EstimatedRideGate | null,
): LookBack {
  return remembered(digests, { settings, setAside, nowMs, gate })
}

export { SPORTS as LOOKBACK_SPORTS }
