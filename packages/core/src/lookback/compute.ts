import { dayShiftFor, WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import { orderedFor } from '../digest/consumers'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { localZoneKey } from '../digest/localDay'
import { memoByDigests, sameSet } from '../digestMemo'
import { fitnessHistories, fitnessStatuses } from '../fitness/compute'
import { dayOfMs } from '../fitness/machine'
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
  /** How the zone cuts local days (see `localZoneKey`): an answer made in another zone is not taken. */
  zone: string
}

/** What the years say that the athlete's mass and bike mass do not touch: the fitness told in hindsight, per sport. */
interface Years {
  asOfMs: number
  horizonMs: number
  sports: Record<Sport, Pick<SportLookBack, 'referenceHr' | 'fitness'>>
}

type YearsInput = Pick<LookBackInput, 'setAside' | 'nowMs' | 'zone'>

/**
 * The fitness in hindsight of each sport. It reads the digests, the set-aside list and the date alone, never the
 * body mass, so a change of mass leaves it as it was (and costs none of it), where the milestones are priced by mass.
 */
function yearsOf(digests: ActivityDigest[], input: YearsInput): Years | null {
  const current = orderedFor('fitness', digests)
  if (current.length === 0) return null
  const newest = current.at(-1)!.startMs
  const asOfMs = Math.max(newest, input.nowMs)
  // The card is as of the newest activity; the years are told through the clock, so a later date is passed on. When they
  // are the same date the options are the card's own and its replay is shared.
  const options = asOfMs > newest ? { asOfMs } : {}
  // Days are on the fitness clock: a day is the local one, as the runs' are.
  const asOfDay = dayOfMs(asOfMs) + dayShiftFor({ startMs: asOfMs })
  const statuses = fitnessStatuses(digests, input.setAside, options)
  const histories = fitnessHistories(digests, input.setAside, options)
  const sport = (s: Sport): Years['sports'][Sport] => ({
    referenceHr: histories[s].referenceHr,
    fitness:
      statuses[s].shortfall?.kind === 'unavailable'
        ? { kind: 'unavailable' }
        : hindsightOf({
            runs: histories[s].runs,
            activeDays: current
              .filter((d) => d.sport === s)
              .map((d) => dayOfMs(d.startMs) + dayShiftFor(d)),
            asOfDay,
            records: histories[s].records,
          }),
  })
  return {
    asOfMs,
    // A label on the day clock, read in UTC like the spans it ends.
    horizonMs: WEEK_ORIGIN_MS + horizonDay(asOfDay) * DAY_MS,
    sports: { run: sport('run'), ride: sport('ride') },
  }
}

const rememberedYears = memoByDigests<YearsInput, Years | null>(
  yearsOf,
  (a, b) => sameSet(a.setAside, b.setAside) && a.nowMs === b.nowMs && a.zone === b.zone,
)

type MilestonesInput = Pick<LookBackInput, 'settings' | 'gate' | 'zone'>

/** The settings a read of runs alone is given: a run's efforts never read the mass, so any would do. */
const SETTINGS_OF_RUNS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

/**
 * A run's best efforts over the years. They are priced by the run's pace alone, so they do not read the body mass or
 * the bike's, and a change of either leaves them as they were.
 */
const rememberedRunMilestones = memoByDigests<Pick<LookBackInput, 'zone'>, EffortMilestones[]>(
  (digests) => milestonesOf(digests, SETTINGS_OF_RUNS, undefined, ['run']).run,
  (a, b) => a.zone === b.zone,
)

/** A ride's best efforts over the years, priced by the athlete's mass, so remembered by the settings too. */
const rememberedRideMilestones = memoByDigests<MilestonesInput, EffortMilestones[]>(
  (digests, { settings, gate }) => milestonesOf(digests, settings, gate, ['ride']).ride,
  (a, b) =>
    a.gate === b.gate &&
    a.zone === b.zone &&
    a.settings.massKg === b.settings.massKg &&
    a.settings.bikeMassKg === b.settings.bikeMassKg &&
    a.settings.measurements === b.settings.measurements,
)

function compute(digests: ActivityDigest[], input: LookBackInput): LookBack {
  const years = rememberedYears(digests, input)
  if (years === null) return NO_LOOKBACK
  const milestones: Record<Sport, EffortMilestones[]> = {
    run: rememberedRunMilestones(digests, input),
    ride: rememberedRideMilestones(digests, input),
  }
  const sport = (s: Sport): SportLookBack => ({
    sport: s,
    ...years.sports[s],
    milestones: milestones[s],
  })
  return {
    asOfMs: years.asOfMs,
    horizonMs: years.horizonMs,
    sports: { run: sport('run'), ride: sport('ride') },
  }
}

const remembered = memoByDigests<LookBackInput, LookBack>(
  compute,
  (a, b) =>
    sameSet(a.setAside, b.setAside) &&
    a.nowMs === b.nowMs &&
    a.gate === b.gate &&
    a.zone === b.zone &&
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
  return remembered(digests, {
    settings,
    setAside,
    nowMs,
    gate,
    zone: localZoneKey(),
  })
}

export { SPORTS as LOOKBACK_SPORTS }
