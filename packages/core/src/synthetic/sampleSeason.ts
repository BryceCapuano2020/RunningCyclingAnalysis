import { DAY_MS } from '../constants'
import { mulberry32 } from '../math'
import type { Activity, Sport } from '../types'
import { DEFAULT_ATHLETE } from './athlete'
import type { SyntheticAthlete } from './athlete'
import { generateActivity } from './generate'
import type { ActivitySpec, Effort, Terrain } from './spec'

/**
 * The sample athlete's season, drawn relative to a clock so the sample always reads as recent: a
 * steady training week for the last twelve weeks, a lighter one before that, and a thin early
 * history that reaches past a year, so 12 weeks, 12 months and All time each show something different.
 * The ride threshold rises through the season. Everything is deterministic for a clock and a seed.
 *
 * The season ends on the most recent Sunday on or before yesterday, and every draw is keyed to the number
 * of days before that Sunday, not before today. So the plan, its sessions and every figure from it are the
 * same on each day of a week and in every week: only the dates move, a week at a time. The newest activity
 * is therefore up to a week old, which the sample's own period dates say.
 */

/** The clock the sample uses when none is given, so tests and fixtures see the same season each run. */
/** A Sunday, so its season ends the Sunday before it. */
export const SAMPLE_REFERENCE_NOW_MS = Date.UTC(2026, 9, 25, 12, 0, 0)

export interface SampleClock {
  /** The present, epoch ms. The season ends on the latest Sunday on or before the day before the day this names. */
  nowMs: number
  /**
   * Minutes east of UTC at an instant. The default is UTC, so a clock alone gives the same season in
   * every time zone. The app passes the device's zone so a 6:40 am start reads as 6:40 am to the visitor.
   */
  utcOffsetMinutes?: (ms: number) => number
}

export const SAMPLE_CLOCK: SampleClock = { nowMs: SAMPLE_REFERENCE_NOW_MS }

/** One planned activity: what to generate and with which athlete, before any samples exist. */
export interface SampleEntry {
  spec: ActivitySpec
  /** The athlete's form on that day: the same body, with the threshold the season had reached. */
  athlete: SyntheticAthlete
  seed: number
}

/** The season's length: the early history ends this many weeks before its last Sunday. */
const SEASON_WEEKS = 56
/** Weeks back from the last Sunday that hold the full training week, then the lighter one. */
const FULL_WEEKS = 12
const STEADY_WEEKS = 35
/**
 * How far the season has come, as the share of today's value each quantity started at: the thresholds,
 * the bike's gross efficiency, and the running cost (which falls as economy improves, so it starts above 1).
 * Heart rate follows the metabolic power alone, so only efficiency and economy move the output at a
 * given heart rate: the climb the same-heart-rate view shows.
 */
const START_SHARE = { cpRun: 0.965, cpRide: 0.9, grossEfficiency: 0.91, runEconomyScale: 1.05 }
/**
 * A slip in easy running, planted so the sample shows the fitness status something to find: the cost of
 * running easily rises by `depth` over `fallWeeks`, starting `startWeeks` before the season's end, and stays
 * up. Heart rate follows the metabolic power alone, so a dearer step is the same heart rate at a slower pace,
 * which is what the status reads. Only easy runs carry it: the tests, the race, the tempo and the intervals are
 * drawn from the threshold as before, so the bests and the grades do not move by it. (The heart-rate
 * cross-check reads every run's pace against its heart rate, so the lean between the sports moves a little.)
 */
const EASY_SLIP = { startWeeks: 9, fallWeeks: 4, depth: 0.11 }
/**
 * A real athlete's easy pace is not a straight line: its cost wobbles by up to `amplitude` from one week to the
 * next, the same for every easy run of a week, from a seeded draw for the week, so the season is the same on every
 * load and the status reads a slip through some noise.
 */
const EASY_WOBBLE = { amplitude: 0.012, seed: 17 }
/** The sports whose easy running carries the slip and the wobble, a table so no sport is named in the plan. */
const EASY_COST_MOVES: Record<Sport, boolean> = { run: true, ride: false }

/** The share of the season's climb made by the start of the last twelve weeks: the build is steeper after it. */
const CLIMB_BEFORE_BUILD = 0.5
/** How far a day's form sits off the season's line, up or down. */
const FORM_SPREAD = 0.015
const SKIP_CHANCE = 0.08

/** The weeks back that hold a threshold test, which anchors the fit: the newest is in the default period. */
const RUN_TEST_WEEKS: readonly number[] = [3, 16, 34, 52]
const RIDE_TEST_WEEKS: readonly number[] = [2, 15, 33, 51]
/** The week back that holds the 5K race, run harder than the tests, so one best stands apart from the rest. */
const RACE_WEEK = 1
const TIME_TRIAL_WEEK = 4
const GLITCH_WEEK = 5
const NO_POWER_WEEKS: readonly number[] = [6, 22, 41]

interface Slot {
  name: string
  sport: Sport
  effort: Effort
  terrain: Terrain
  /** Shortest and longest length, minutes. */
  minutes: readonly [number, number]
  /** The hour the start falls in (24 h clock) and how far past it may drift, hours. */
  hour: readonly [number, number]
  withPower?: boolean
  hrGlitch?: boolean
}

const slot = (
  name: string,
  sport: Sport,
  effort: Effort,
  terrain: Terrain,
  minutes: readonly [number, number],
  hour: readonly [number, number],
  extra: Pick<Slot, 'withPower' | 'hrGlitch'> = {},
): Slot => ({ name, sport, effort, terrain, minutes, hour, ...extra })

const MORNING: readonly [number, number] = [6, 1]
const LUNCH: readonly [number, number] = [12, 0.6]
const EVENING: readonly [number, number] = [17.4, 1.4]
const WEEKEND: readonly [number, number] = [7.3, 1.9]

const EASY_RUN = slot('Morning Run', 'run', 'easy', 'flat', [38, 48], MORNING)
const LUNCH_RUN = slot('Lunch Run', 'run', 'easy', 'flat', [35, 45], LUNCH)
const LONG_RUN = slot('Sunday Long Run', 'run', 'easy', 'rolling', [76, 98], WEEKEND)
const TEMPO_RUN = slot('Tempo Run', 'run', 'tempo', 'flat', [45, 55], EVENING)
const TRACK = slot('Track Intervals', 'run', 'intervals', 'flat', [46, 55], EVENING)
const RACE_5K = slot('Parkrun 5K', 'run', 'race', 'flat', [34, 36], WEEKEND)
const RACE_TT = slot('Club Time Trial', 'ride', 'race', 'flat', [44, 46], WEEKEND)
const RUN_TEST = slot(
  'Threshold test: 3, 6, 12 and 20 minute efforts',
  'run',
  'test',
  'flat',
  [98, 102],
  EVENING,
)
const LONG_RIDE = slot('Saturday Long Ride', 'ride', 'easy', 'rolling', [126, 150], WEEKEND)
const TEMPO_RIDE = slot('Tempo Ride', 'ride', 'tempo', 'rolling', [62, 78], EVENING)
const VO2_RIDE = slot('VO2 Intervals', 'ride', 'intervals', 'flat', [56, 66], EVENING)
const CLIMB = slot('Canyon Climb', 'ride', 'tempo', 'climb', [82, 100], WEEKEND)
const HILLS = slot('Hill Repeats', 'ride', 'intervals', 'climb', [68, 80], WEEKEND)
const RIDE_TEST = slot('Power Test', 'ride', 'test', 'flat', [108, 112], WEEKEND)
const NO_POWER_CLIMB = slot('Mountain Climb', 'ride', 'tempo', 'climb', [76, 90], WEEKEND, {
  withPower: false,
})
const GLITCH_RIDE = slot('Evening Ride', 'ride', 'tempo', 'rolling', [84, 96], EVENING, {
  hrGlitch: true,
})

/** The slot a day holds, or null for a rest day. `weekday` counts from Sunday = 0, as Date does. */
function slotFor(weekday: number, weeksAgo: number, pick: number): Slot | null {
  const even = weeksAgo % 2 === 0
  if (weekday === 4 && RUN_TEST_WEEKS.includes(weeksAgo)) return RUN_TEST
  if (weekday === 6 && weeksAgo === RACE_WEEK) return RACE_5K
  if (weekday === 6 && weeksAgo === TIME_TRIAL_WEEK) return RACE_TT
  if (weekday === 6 && RIDE_TEST_WEEKS.includes(weeksAgo)) return RIDE_TEST
  if (weekday === 3 && weeksAgo === GLITCH_WEEK) return GLITCH_RIDE
  if (weekday === 6 && NO_POWER_WEEKS.includes(weeksAgo)) return NO_POWER_CLIMB
  if (weeksAgo >= STEADY_WEEKS) {
    // The early history: one session a week, the sports taking turns.
    if (weekday === 6) return even ? LONG_RIDE : null
    return weekday === 0 && !even ? LONG_RUN : null
  }
  if (weeksAgo >= FULL_WEEKS) {
    // The lighter weeks: a long run every week and a ride every other.
    if (weekday === 6) return even ? (weeksAgo % 4 === 0 ? HILLS : LONG_RIDE) : null
    return weekday === 0 ? LONG_RUN : null
  }
  switch (weekday) {
    case 2:
      return pick < 0.5 ? EASY_RUN : LUNCH_RUN
    case 3:
      return even ? TEMPO_RIDE : VO2_RIDE
    case 4:
      return even ? (weeksAgo % 4 === 0 ? TEMPO_RUN : TRACK) : null
    case 6:
      return weeksAgo % 4 === 3 ? CLIMB : LONG_RIDE
    case 0:
      return LONG_RUN
    default:
      return null
  }
}

/** How far along the season is, 0 at its start and 1 on its last day: a slow climb, then a steeper build in the full weeks. */
function seasonProgress(daysAgo: number): number {
  const buildDays = FULL_WEEKS * 7
  if (daysAgo >= buildDays) {
    const earlier = (SEASON_WEEKS * 7 - daysAgo) / (SEASON_WEEKS * 7 - buildDays)
    return CLIMB_BEFORE_BUILD * Math.max(0, earlier)
  }
  return CLIMB_BEFORE_BUILD + (1 - CLIMB_BEFORE_BUILD) * (1 - daysAgo / buildDays)
}

/** The athlete on a day: the season's line from its start to today's values, plus the day's form. */
function athleteOn(daysAgo: number, runForm: number, rideForm: number): SyntheticAthlete {
  const progress = seasonProgress(daysAgo)
  const along = (key: keyof typeof START_SHARE, form = 0.5) => {
    const line = START_SHARE[key] + (1 - START_SHARE[key]) * progress
    return DEFAULT_ATHLETE[key] * line * (1 + (2 * form - 1) * FORM_SPREAD)
  }
  return {
    ...DEFAULT_ATHLETE,
    cpRun: along('cpRun', runForm),
    cpRide: along('cpRide', rideForm),
    grossEfficiency: along('grossEfficiency'),
    runEconomyScale: along('runEconomyScale'),
  }
}

/** How much dearer an easy run is on a day: 0 before the slip, `depth` once it has fallen, in a straight line between. */
export function easySlipOn(daysAgo: number): number {
  const { startWeeks, fallWeeks, depth } = EASY_SLIP
  const weeksIn = startWeeks - daysAgo / 7
  return depth * Math.min(1, Math.max(0, weeksIn / fallWeeks))
}

/** The week's wobble in an easy run's cost, from -`amplitude` to `amplitude`, the same on every day of the week. */
export function easyWobbleOn(daysAgo: number): number {
  const week = Math.floor(daysAgo / 7)
  return (2 * mulberry32(EASY_WOBBLE.seed * 1000 + week)() - 1) * EASY_WOBBLE.amplitude
}

/** An easy run's cost on a day, against the season's line: the slip and the week's wobble together. */
export function easyCostOn(daysAgo: number): number {
  return (1 + easySlipOn(daysAgo)) * (1 + easyWobbleOn(daysAgo))
}

function offsetOf(clock: SampleClock): (ms: number) => number {
  return clock.utcOffsetMinutes ?? (() => 0)
}

/** The instant a local clock reading names: the clock's own milliseconds, less the zone's offset then. */
function instantOf(localMs: number, offsetAt: (ms: number) => number): number {
  const guess = localMs - offsetAt(localMs) * 60_000
  return localMs - offsetAt(guess) * 60_000
}

/** Whether a slot is one the season's story rests on, which a random skip never takes away. */
function isFeatured(session: Slot): boolean {
  return (
    session.effort === 'test' ||
    session.effort === 'race' ||
    session.hrGlitch === true ||
    session.withPower === false
  )
}

/**
 * The season's activities, oldest first, as a plan: no samples are generated until an entry is. The last
 * Sunday on or before the day before `clock.nowMs`'s day ends it. Ids are numbered in time order.
 */
export function samplePlan(clock: SampleClock = SAMPLE_CLOCK, seed = 1): SampleEntry[] {
  const offsetAt = offsetOf(clock)
  const nowLocalMs = clock.nowMs + offsetAt(clock.nowMs) * 60_000
  const todayLocalMs = Math.floor(nowLocalMs / DAY_MS) * DAY_MS
  // Back from yesterday to the Sunday: Date's weekday counts Sunday as 0, so yesterday's weekday is the distance.
  const yesterdayWeekday = new Date(todayLocalMs - DAY_MS).getUTCDay()
  const anchorLocalMs = todayLocalMs - DAY_MS - yesterdayWeekday * DAY_MS
  const rand = mulberry32(seed)
  const entries: SampleEntry[] = []
  for (let daysBefore = SEASON_WEEKS * 7 - 1; daysBefore >= 0; daysBefore--) {
    // Five draws a day, used or not, so a rest day does not shift the days after it.
    const [skip, pick, hourDraw, lengthDraw, seedDraw] = [rand(), rand(), rand(), rand(), rand()]
    const form = athleteOn(daysBefore, rand(), rand())
    // The anchor is a Sunday, so a day's weekday follows from its distance from it alone.
    const weekday = (7 - (daysBefore % 7)) % 7
    const planned = slotFor(weekday, Math.floor(daysBefore / 7), pick)
    if (planned === null || (skip < SKIP_CHANCE && !isFeatured(planned))) continue
    const [hour, spread] = planned.hour
    const [shortest, longest] = planned.minutes
    const startLocalMs =
      anchorLocalMs - daysBefore * DAY_MS + Math.round((hour + spread * hourDraw) * 60) * 60_000
    entries.push({
      spec: {
        id: `sample-${String(entries.length + 1).padStart(3, '0')}`,
        name: planned.name,
        sport: planned.sport,
        startMs: instantOf(startLocalMs, offsetAt),
        durationS: (shortest + Math.round(lengthDraw * (longest - shortest))) * 60,
        effort: planned.effort,
        terrain: planned.terrain,
        withPower: planned.withPower,
        hrGlitch: planned.hrGlitch,
      },
      athlete:
        EASY_COST_MOVES[planned.sport] && planned.effort === 'easy'
          ? { ...form, runEconomyScale: form.runEconomyScale * easyCostOn(daysBefore) }
          : form,
      seed: Math.floor(seedDraw * 0x100000000),
    })
  }
  return entries
}

/** Generates one planned activity, second by second. */
export function generateSampleActivity(entry: SampleEntry): Activity {
  return generateActivity(entry.athlete, entry.spec, entry.seed)
}

/**
 * The sample athlete's season for the "See a sample athlete" button. `athlete` is today's form, the
 * ground truth the newest efforts are drawn from.
 */
export function sampleSeason(
  clock: SampleClock = SAMPLE_CLOCK,
  seed = 1,
): { athlete: SyntheticAthlete; activities: Activity[] } {
  return {
    athlete: DEFAULT_ATHLETE,
    activities: samplePlan(clock, seed).map(generateSampleActivity),
  }
}
