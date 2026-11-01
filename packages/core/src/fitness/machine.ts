import { dayShiftFor, WEEK_MS, WEEK_ORIGIN_MS, weekEndInstant } from '../calendar'
import { DAY_MS } from '../constants'
import { episodeStep, openEpisode, troughOf } from './episode'
import { riseStep } from './rise'
import type { Episode, EpisodeLevel, Trough } from './episode'
import { fitSeason, negatedSeason, withoutSeason } from './season'
import type { Season } from './season'
import { FITNESS } from './params'
import {
  levelOf,
  locateOnset,
  lowLastYear,
  referenceOf,
  sigmaAt,
  slice,
  slipAndRiseAt,
} from './windows'
import type { Dip, RunPoint, Slip } from './windows'

const M = FITNESS.monitor

/** Weeks count from the Monday `calendar.ts` names, so they line up for every library and match the findings engine's. */
export const weekOfMs = (ms: number): number => Math.floor((ms - WEEK_ORIGIN_MS) / WEEK_MS)
/** The week an instant is in, in the viewer's zone. */
export const localWeekOf = (ms: number): number =>
  weekOfMs(ms + dayShiftFor({ startMs: ms }) * DAY_MS)
/** The end of a week, Sunday 23:59:59.999 UTC, as the findings engine's weeks end. */
export const weekEndOf = (week: number): number => WEEK_ORIGIN_MS + (week + 1) * WEEK_MS - 1
/** The days since the origin at which a week's evaluation is made: the start of the next Monday. */
export const dayOfWeekEnd = (week: number): number => (week + 1) * 7
export const dayOfMs = (ms: number): number => (ms - WEEK_ORIGIN_MS) / DAY_MS
/** A day on the clock as a label: the midnight that starts it, counted as if the local day were the UTC one. */
export const msOfDay = (day: number): number => WEEK_ORIGIN_MS + day * DAY_MS
/** The same midnight as the instant it is in the viewer's zone. */
export const instantOfDay = (day: number): number => weekEndInstant(msOfDay(day) - 1) + 1

export type MachineState =
  | 'nodata'
  | 'thin'
  | 'holding'
  | 'holding-below'
  | 'slipping'
  | 'recovering'
  | 'back'
  | 'improving'
  | 'improved'

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
  /** The stretch the episode that closed this week after reaching "back" covered: a real dip, left out of the learned floor. */
  dip: Dip | null
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
  dip: null,
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
  up = false,
): number {
  if (slip === null || !slip.fire) return 0
  if (checkYear && lowLastYear(runs, day, slip, sigma, up)) return 0
  const week = slice(runs, day - 7, day)
  if (week.length === 0) return streak
  const moved = levelOf(week, slip.reference, sigma)!.m - slip.reference
  return (up ? moved : -moved) >= M.confirmShare * M.delta ? streak + 1 : 0
}

/** Whether a rise may be opened this week: no episode closed within the weeks it is compared with, and none declared lately. */
function riseBlocked(records: readonly WeekRecord[], day: number, guardUntil: number): boolean {
  if (day < guardUntil) return true
  const from = day - FITNESS.monitor.refStartWeeks * 7
  const to = day - FITNESS.monitor.refEndWeeks * 7
  return records.some((r) => r.closes !== null && r.closes < to && dayOfWeekEnd(r.w) >= from)
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
  let riseStreak = 0
  /** No new rise is opened before this day (see `FITNESS.monitor.riseGuardWeeks`). */
  let riseGuard = Number.NEGATIVE_INFINITY
  let season: Season | null = null
  const dips: Dip[] = []
  /** The runs with their sign turned, which a rise is followed in; made when the first rise needs them. */
  let negated: RunPoint[] | null = null
  /** The week the swing was last fitted: it is refitted every few weeks, so a card's level can step by a fraction of a per cent when it is. */
  let fitted: number | null = null
  for (let w = from; w <= to; w++) {
    const day = dayOfWeekEnd(w)
    // The tests read the runs with the athlete's season taken out; an open episode keeps the swing it began with.
    if (ep !== null) season = ep.season
    else if (fitted === null || w - fitted >= FITNESS.season.refitWeeks) {
      season = fitSeason(runs, day)
      fitted = w
    }
    const lookback = day - FITNESS.season.lookbackWeeks * 7
    const seen = withoutSeason(runs, season, lookback, day)
    const sigma = sigmaAt(seen, day)
    /** The tests of this week when a rise has just given way to a slip, so they are not run twice. */
    let given: ReturnType<typeof slipAndRiseAt> | null = null
    if (ep?.up) {
      // A rise gives way to a slip: the slip test firing two weeks running ends it, so a rise that was never real
      // cannot hold the monitor from a loss that is.
      const tests = slipAndRiseAt(seen, day, sigma, dips)
      streak = nextStreak(streak, tests.slip, seen, day, sigma, season === null)
      if (tests.slip !== null && streak >= M.consecutive) {
        ep = null
        given = tests
      } else {
        negated ??= runs.map((r) => ({ ...r, x: -r.x }))
        const seenDown = withoutSeason(negated, negatedSeason(season), lookback, day)
        const { record: step, ended } = riseStep(seenDown, day, w, ep, records.at(-1))
        records.push(record(w, step.state, step))
        // A rise that settled leaves its earlier weeks in the baselines of the longer scales; one that faded leaves nothing.
        if (step.state === 'improved' && step.fresh) {
          riseGuard = (ep.onsetDay ?? day) + M.riseGuardWeeks * 7
        }
        if (ended) {
          ep = null
          streak = 0
          riseStreak = 0
        }
        continue
      }
    }
    if (ep === null) {
      const earlier = referenceOf(seen, day)
      if (earlier === null) {
        records.push(record(w, 'nodata'))
        continue
      }
      const { slip, rise } = given ?? slipAndRiseAt(seen, day, sigma, dips)
      if (given === null) {
        streak = nextStreak(streak, slip, seen, day, sigma, season === null)
      }
      riseStreak = nextStreak(riseStreak, rise, seen, day, sigma, season === null, true)
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
      } else if (
        rise !== null &&
        riseStreak >= M.consecutive &&
        !riseBlocked(records, day, riseGuard)
      ) {
        const onset = locateOnset(seen, day, sigma, true)
        // The rise is followed in negated units: its reference is the negative of the level before it.
        ep = openEpisode(
          w,
          sigma,
          -(onset?.reference ?? rise.reference),
          onset?.referenceRuns ?? earlier.n,
          onset?.day ?? null,
          season,
          { z: rise.z },
        )
        riseStreak = 0
        records.push(record(w, 'improving', { fresh: true, z: rise.z, delta: rise.delta }))
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
        dip: step.confirmed
          ? { fromDay: ep.onsetDay ?? dayOfWeekEnd(ep.startedWeek), toDay: day }
          : null,
      }),
    )
    if (step.confirmed) dips.push(records.at(-1)!.dip!)
    if (step.close) {
      ep = null
      streak = 0
    }
  }
  applyHold(records)
  return { records, season }
}
