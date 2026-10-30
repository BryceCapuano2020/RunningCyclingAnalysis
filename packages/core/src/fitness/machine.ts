import { DAY_MS } from '../constants'
import { episodeStep, openEpisode, troughOf } from './episode'
import type { Episode, EpisodeLevel, Trough } from './episode'
import { fitSeason, withoutSeason } from './season'
import type { Season } from './season'
import { FITNESS } from './params'
import { levelOf, locateOnset, lowLastYear, referenceOf, sigmaAt, slice, slipAt } from './windows'
import type { RunPoint, Slip } from './windows'

const M = FITNESS.monitor

export const WEEK_MS = 7 * DAY_MS
/** A Monday at midnight UTC (5 January 1970): weeks count from it, so they line up for every library and match the findings engine's. */
export const WEEK_ORIGIN_MS = 4 * DAY_MS

export const weekOfMs = (ms: number): number => Math.floor((ms - WEEK_ORIGIN_MS) / WEEK_MS)
/** The end of a week, Sunday 23:59:59.999 UTC, as the findings engine's weeks end. */
export const weekEndOf = (week: number): number => WEEK_ORIGIN_MS + (week + 1) * WEEK_MS - 1
/** The days since the origin at which a week's evaluation is made: the start of the next Monday. */
export const dayOfWeekEnd = (week: number): number => (week + 1) * 7
export const dayOfMs = (ms: number): number => (ms - WEEK_ORIGIN_MS) / DAY_MS

export type MachineState =
  'nodata' | 'thin' | 'holding' | 'holding-below' | 'slipping' | 'recovering' | 'back'

/** The numbers an open episode's state is told with. */
export interface EpisodeView {
  reference: number
  referenceRuns: number
  onsetDay: number | null
  level: EpisodeLevel
  /** The lowest the episode has been, read only where it is told (recovering, back). */
  trough: Trough | null
}

export interface WeekRecord {
  /** Weeks since the origin. */
  w: number
  /** What the monitor says this week, before the display hold. */
  state: MachineState
  /** The state began this week. */
  fresh: boolean
  /** The statistic that began it, signed like the change; NaN when not fresh. */
  z: number
  /** The level against the reference (an episode), or the best contrast (no episode). */
  delta: number
  episode: EpisodeView | null
  /** The day the episode that closed this week began (its onset, else its first week): the dip it leaves in the weeks behind. */
  closes: number | null
  /** What is shown once a new state has held for the display hold. */
  shown: MachineState
}

const record = (w: number, state: MachineState, extra: Partial<WeekRecord> = {}): WeekRecord => ({
  w,
  state,
  fresh: false,
  z: Number.NaN,
  delta: Number.NaN,
  episode: null,
  closes: null,
  shown: state,
  ...extra,
})

/** Whether `holding` or `holding-below`: the athlete is not mid-change, and a state that begins then is shown at once. */
const calm = (s: MachineState): boolean => s === 'holding' || s === 'holding-below'

/**
 * The display hold: a new state is shown once it has held for two weekly evaluations, so a one-week flip
 * never reaches the screen. A state that begins when the athlete was calm is shown at once, and `thin`
 * and `nodata` show at once without changing what the hold is comparing against.
 */
export function applyHold(records: WeekRecord[]): void {
  let shown: MachineState | null = null
  let candidate: MachineState | null = null
  let run = 0
  for (const r of records) {
    if (r.state === 'nodata' || r.state === 'thin') {
      r.shown = r.state
      continue
    }
    if (shown === null) {
      shown = r.state
    } else if (r.state === shown) {
      candidate = null
      run = 0
    } else {
      run = candidate === r.state ? run + 1 : 1
      candidate = r.state
      if (run >= FITNESS.display.holdWeeks || (calm(shown) && !calm(r.state) && r.fresh)) {
        shown = r.state
        candidate = null
        run = 0
      }
    }
    r.shown = shown
  }
}

/**
 * The run of weekly evaluations that have fired: one more when this week's own runs read low against the
 * baseline of the scale judged, none when they do not or the scale does not fire, and unchanged in a week
 * without a steady run, which says nothing either way.
 */
function nextStreak(
  streak: number,
  slip: Slip | null,
  runs: readonly RunPoint[],
  day: number,
  sigma: number,
  checkYear: boolean,
): number {
  if (slip === null || !slip.fire) return 0
  if (checkYear && lowLastYear(runs, day, slip, sigma)) return 0
  const week = slice(runs, day - 7, day)
  if (week.length === 0) return streak
  const low = levelOf(week, slip.reference, sigma)!.m - slip.reference
  return low <= -M.confirmShare * M.delta ? streak + 1 : 0
}

/** The monitor's weeks, and the seasonal swing the last of them was read with (null when none has been found). */
export interface Replay {
  records: WeekRecord[]
  season: Season | null
}

/** The weeks of `replay` alone, for callers that do not read the runs again. */
export function monitor(runs: readonly RunPoint[], from: number, to: number): WeekRecord[] {
  return replay(runs, from, to).records
}

/**
 * Runs the monitor week by week over `runs` (sorted by t) from week `from` to week `to`, each evaluation
 * seeing only the runs before the end of its week, with the athlete's own season (once two years show one)
 * taken out of them. With no episode open it tests for a slip; once one is declared it follows the episode
 * against its frozen reference until it closes. Deterministic.
 */
export function replay(runs: readonly RunPoint[], from: number, to: number): Replay {
  const records: WeekRecord[] = []
  let ep: Episode | null = null
  let streak = 0
  let season: Season | null = null
  for (let w = from; w <= to; w++) {
    const day = dayOfWeekEnd(w)
    // The tests read the runs with the athlete's season taken out; an open episode keeps the swing it began with.
    season = ep === null ? fitSeason(runs, day) : ep.season
    const seen = withoutSeason(runs, season, day - FITNESS.season.lookbackWeeks * 7, day)
    const sigma = sigmaAt(seen, day)
    if (ep === null) {
      const earlier = referenceOf(seen, day)
      if (earlier === null) {
        records.push(record(w, 'nodata'))
        continue
      }
      const slip = slipAt(seen, day, sigma)
      streak = nextStreak(streak, slip, seen, day, sigma, season === null)
      if (slip !== null && streak >= M.consecutive) {
        const onset = locateOnset(seen, day, sigma)
        ep = openEpisode(
          w,
          sigma,
          onset?.reference ?? slip.reference,
          onset?.referenceRuns ?? earlier.n,
          onset?.day ?? null,
          season,
        )
        streak = 0
        records.push(record(w, 'slipping', { fresh: true, z: slip.z, delta: slip.delta }))
      } else {
        records.push(record(w, 'holding', { delta: slip?.delta ?? 0 }))
      }
      continue
    }
    const step = episodeStep(seen, day, w, ep)
    if (step.state === 'thin') {
      records.push(record(w, 'thin'))
      continue
    }
    const state: MachineState = step.low ? 'holding-below' : step.state
    const view: EpisodeView = {
      reference: ep.reference,
      referenceRuns: ep.referenceRuns,
      onsetDay: ep.onsetDay,
      level: step.level!,
      trough: step.state === 'recovering' || step.state === 'back' ? troughOf(ep) : null,
    }
    records.push(
      record(w, state, {
        fresh: step.fresh,
        z: step.z,
        delta: step.delta,
        episode: view,
        closes: step.close ? (ep.onsetDay ?? dayOfWeekEnd(ep.startedWeek)) : null,
      }),
    )
    if (step.close) {
      ep = null
      streak = 0
    }
  }
  applyHold(records)
  return { records, season }
}
