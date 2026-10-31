import type { Sport } from '../types'
import { sampleName } from './sampleNames'
import type { NameKind } from './sampleNames'
import type { RecordGap } from './sampleRecording'
import type { Effort, Terrain } from './spec'

/**
 * The sample's week: which session each weekday holds, in the full weeks, the lighter ones and the thin early
 * history, and the few sessions the season's story rests on (the tests, the race, the glitch, the recordings
 * that are not clean). sampleSeason.ts draws the athlete and the numbers; this says what is on the calendar.
 */

/** Weeks back from the last Sunday that hold the full training week, then the lighter one. */
export const FULL_WEEKS = 12
const STEADY_WEEKS = 35

/** The weeks back that hold a threshold test, which anchors the fit: the newest is in the default period. */
const RUN_TEST_WEEKS: readonly number[] = [3, 16, 34, 52]
const RIDE_TEST_WEEKS: readonly number[] = [2, 15, 33, 51]
/** The week back that holds the 5K race, run harder than the tests, so one best stands apart from the rest. */
const RACE_WEEK = 1
const TIME_TRIAL_WEEK = 4
const GLITCH_WEEK = 5
/**
 * How often the thin early history holds a long ride, in weeks. A runner who took up riding this year has too few
 * steady rides from before the last 8 weeks for the ride's fitness card to compare with: its honest "not enough".
 */
const RIDE_EARLY_EVERY = 5
const RIDE_LIGHT_EVERY = 4
const RIDE_FULL_WEEKS = 9
/** The weeks back, from the newest, that hold the short rides too. */
const RIDE_DAILY_WEEKS = 8
const NO_POWER_WEEKS: readonly number[] = [6, 22, 41]
/** The weeks back whose Tuesday easy run is on a treadmill, and the week whose one has no heart rate. */
const TREADMILL_WEEKS: readonly number[] = [7, 10]
const NO_HEART_RATE_WEEK = 2
/** The week whose Sunday long run has a stretch the watch did not record (it loses its signal under cover). */
const RECORD_GAP_WEEK = 6
const RECORD_GAP: RecordGap = { atShare: 0.45, lengthS: 75 }
/** A 5K recorded from the start line is 5.0 km; the generated race is longer, so the distance can be cut to. */
const RACE_M = 5000

/** What a session is called: a pool for its kind, or one name the season's story rests on. */
type Title = { kind: NameKind } | { fixed: string }

export interface Slot {
  title: Title
  sport: Sport
  effort: Effort
  terrain: Terrain
  /** Shortest and longest length, minutes. */
  minutes: readonly [number, number]
  /** The hour the start falls in (24 h clock) and how far past it may drift, hours. */
  hour: readonly [number, number]
  withPower?: boolean
  hrGlitch?: boolean
  withHeartRate?: boolean
  treadmill?: boolean
  raceM?: number
  gap?: RecordGap
}

const slot = (
  title: Title,
  sport: Sport,
  effort: Effort,
  terrain: Terrain,
  minutes: readonly [number, number],
  hour: readonly [number, number],
  extra: Partial<Pick<Slot, 'withPower' | 'hrGlitch' | 'raceM'>> = {},
): Slot => ({ title, sport, effort, terrain, minutes, hour, ...extra })
const kind = (name: NameKind): Title => ({ kind: name })
const fixed = (name: string): Title => ({ fixed: name })

const MORNING: readonly [number, number] = [6, 1]
const LUNCH: readonly [number, number] = [12, 0.6]
const EVENING: readonly [number, number] = [17.4, 1.4]
const WEEKEND: readonly [number, number] = [7.3, 1.9]

const EASY_RUN = slot(kind('easyRun'), 'run', 'easy', 'flat', [38, 48], MORNING)
const LUNCH_RUN = slot(kind('easyRun'), 'run', 'easy', 'flat', [35, 45], LUNCH)
const LONG_RUN = slot(kind('longRun'), 'run', 'easy', 'rolling', [76, 98], WEEKEND)
const TEMPO_RUN = slot(kind('tempoRun'), 'run', 'tempo', 'flat', [45, 55], EVENING)
const TRACK = slot(kind('intervalRun'), 'run', 'intervals', 'flat', [46, 55], EVENING)
// Long enough to reach 5.0 km at the slowest pace the generator allows; the recording is cut there.
const RACE_5K = slot(fixed('Parkrun 5K'), 'run', 'race', 'flat', [62, 62], WEEKEND, {
  raceM: RACE_M,
})
const RACE_TT = slot(fixed('Club Time Trial'), 'ride', 'race', 'flat', [44, 46], WEEKEND)
const RUN_TEST = slot(
  fixed('Threshold test: 3, 6, 12 and 20 minute efforts'),
  'run',
  'test',
  'flat',
  [98, 102],
  EVENING,
)
const LONG_RIDE = slot(kind('longRide'), 'ride', 'easy', 'rolling', [126, 150], WEEKEND)
const TEMPO_RIDE = slot(kind('tempoRide'), 'ride', 'tempo', 'rolling', [62, 78], EVENING)
const VO2_RIDE = slot(kind('intervalRide'), 'ride', 'intervals', 'flat', [56, 66], EVENING)
const CLIMB = slot(kind('climbRide'), 'ride', 'tempo', 'climb', [82, 100], WEEKEND)
const HILLS = slot(kind('intervalRide'), 'ride', 'intervals', 'climb', [68, 80], WEEKEND)
const RIDE_TEST = slot(fixed('Power Test'), 'ride', 'test', 'flat', [108, 112], WEEKEND)
const NO_POWER_CLIMB = slot(kind('climbRide'), 'ride', 'tempo', 'climb', [76, 90], WEEKEND, {
  withPower: false,
})
// The short rides of a rider's week, in the last RIDE_DAILY_WEEKS: Monday, Friday, odd Thursdays, and a Tuesday evening commute
// after the day's run. They are what makes the last 12 weeks hold enough rides for the ride page to say things.
const EASY_RIDE = slot(kind('easyRide'), 'ride', 'easy', 'rolling', [48, 78], LUNCH)
const FRIDAY_RIDE = slot(kind('easyRide'), 'ride', 'easy', 'rolling', [52, 84], EVENING)
const COMMUTE = slot(kind('commute'), 'ride', 'easy', 'flat', [26, 40], EVENING)
const GLITCH_RIDE = slot(fixed('Evening Ride'), 'ride', 'tempo', 'rolling', [84, 96], EVENING, {
  hrGlitch: true,
})

/** The lighter weeks' ride: a Saturday ride every fourth week, a long one and a hilly one by turns. */
function lightRide(weekday: number, weeksAgo: number): Slot | null {
  if (weekday !== 6 || weeksAgo % RIDE_LIGHT_EVERY !== 0) return null
  return weeksAgo % (2 * RIDE_LIGHT_EVERY) === 0 ? HILLS : LONG_RIDE
}

/** A second session in a day: the Tuesday evening commute of a rider's week, after that day's run. */
export function extraFor(weekday: number, weeksAgo: number): Slot | null {
  return weekday === 2 && weeksAgo < RIDE_DAILY_WEEKS ? COMMUTE : null
}

/** The slot a day holds, or null for a rest day. `weekday` counts from Sunday = 0, as Date does. */
export function slotFor(weekday: number, weeksAgo: number, pick: number): Slot | null {
  const even = weeksAgo % 2 === 0
  if (weekday === 4 && RUN_TEST_WEEKS.includes(weeksAgo)) return RUN_TEST
  if (weekday === 6 && weeksAgo === RACE_WEEK) return RACE_5K
  if (weekday === 6 && weeksAgo === TIME_TRIAL_WEEK) return RACE_TT
  if (weekday === 6 && RIDE_TEST_WEEKS.includes(weeksAgo)) return RIDE_TEST
  if (weekday === 3 && weeksAgo === GLITCH_WEEK) return GLITCH_RIDE
  if (weekday === 6 && NO_POWER_WEEKS.includes(weeksAgo)) return NO_POWER_CLIMB
  if (weeksAgo >= STEADY_WEEKS) {
    // The early history: a runner who rides now and then, a long ride every fifth week.
    if (weekday === 6) return weeksAgo % RIDE_EARLY_EVERY === 1 ? LONG_RIDE : null
    return weekday === 0 && !even ? LONG_RUN : null
  }
  if (weeksAgo >= FULL_WEEKS) {
    // The lighter weeks: a long run every week and a ride every fourth week.
    if (weekday === 6) return lightRide(weekday, weeksAgo)
    return weekday === 0 ? LONG_RUN : null
  }
  // A runner who took up riding this autumn: the full ride week starts RIDE_FULL_WEEKS back, the lighter one before.
  if (weeksAgo >= RIDE_FULL_WEEKS && (weekday === 3 || weekday === 6))
    return lightRide(weekday, weeksAgo)
  switch (weekday) {
    case 2:
      return pick < 0.5 ? EASY_RUN : LUNCH_RUN
    case 3:
      return even ? TEMPO_RIDE : VO2_RIDE
    case 1:
      return weeksAgo < RIDE_DAILY_WEEKS ? EASY_RIDE : null
    case 5:
      return weeksAgo < RIDE_DAILY_WEEKS ? FRIDAY_RIDE : null
    case 4:
      if (!even) return weeksAgo < RIDE_DAILY_WEEKS ? FRIDAY_RIDE : null
      return weeksAgo % 4 === 0 ? TEMPO_RUN : TRACK
    case 6:
      return weeksAgo % 4 === 3 ? CLIMB : LONG_RIDE
    case 0:
      return LONG_RUN
    default:
      return null
  }
}

/** Whether a slot is one the season's story rests on, which a random skip never takes away. */
export function isFeatured(session: Slot): boolean {
  return (
    session.effort === 'test' ||
    session.effort === 'race' ||
    session.hrGlitch === true ||
    session.withPower === false ||
    session.treadmill === true ||
    session.withHeartRate === false ||
    session.gap !== undefined
  )
}

export function nameOf(planned: Slot, hour: number, draw: number): string {
  return 'fixed' in planned.title
    ? planned.title.fixed
    : sampleName(planned.title.kind, planned.sport, hour, draw)
}

/**
 * A day's slot with the season's less usual recordings laid over it: two treadmill runs, a run with no heart
 * rate, and a long run with a stretch the watch did not record. Each takes the place of a session that would be
 * there anyway, so the week's shape does not change.
 */
export function variantOf(planned: Slot | null, weekday: number, weeksAgo: number): Slot | null {
  if (planned === null) return null
  const easyDay = planned.effort === 'easy' && planned.sport === 'run' && weekday === 2
  if (easyDay && TREADMILL_WEEKS.includes(weeksAgo)) {
    return { ...planned, title: kind('treadmillRun'), terrain: 'flat', treadmill: true }
  }
  if (easyDay && weeksAgo === NO_HEART_RATE_WEEK) return { ...planned, withHeartRate: false }
  if (planned === LONG_RUN && weeksAgo === RECORD_GAP_WEEK) return { ...planned, gap: RECORD_GAP }
  return planned
}
