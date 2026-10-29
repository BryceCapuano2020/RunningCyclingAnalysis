import { DAY_MS } from '../constants'
import { episodeStep, openEpisode, troughOf } from './episode'
import type { Episode, EpisodeLevel, Trough } from './episode'
import { FITNESS } from './params'
import { locateOnset, referenceOf, sigmaAt, slipAt } from './windows'
import type { RunPoint } from './windows'

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
 * Runs the monitor week by week over `runs` (sorted by t) from week `from` to week `to`, each evaluation
 * seeing only the runs before the end of its week. With no episode open it tests for a slip; once one is
 * declared it follows the episode against its frozen reference until it closes. Deterministic.
 */
export function monitor(runs: readonly RunPoint[], from: number, to: number): WeekRecord[] {
  const records: WeekRecord[] = []
  let ep: Episode | null = null
  let streak = 0
  for (let w = from; w <= to; w++) {
    const day = dayOfWeekEnd(w)
    const sigma = sigmaAt(runs, day)
    if (ep === null) {
      const earlier = referenceOf(runs, day)
      if (earlier === null) {
        records.push(record(w, 'nodata'))
        continue
      }
      const slip = slipAt(runs, day, sigma)
      streak = slip?.fire ? streak + 1 : 0
      if (slip !== null && streak >= M.consecutive) {
        const onset = locateOnset(runs, day, sigma)
        ep = openEpisode(
          w,
          sigma,
          onset?.reference ?? slip.reference,
          onset?.referenceRuns ?? earlier.n,
          onset?.day ?? null,
        )
        streak = 0
        records.push(record(w, 'slipping', { fresh: true, z: slip.z, delta: slip.delta }))
      } else {
        records.push(record(w, 'holding', { delta: slip?.delta ?? 0 }))
      }
      continue
    }
    const step = episodeStep(runs, day, w, ep)
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
      record(w, state, { fresh: step.fresh, z: step.z, delta: step.delta, episode: view }),
    )
    if (step.close) {
      ep = null
      streak = 0
    }
  }
  applyHold(records)
  return records
}
