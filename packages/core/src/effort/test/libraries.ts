import { DAY_MS, PRIORS, RESTING_W_PER_KG } from '../../constants'
import { mulberry32 } from '../../math'
import { generateActivity } from '../../synthetic'
import type { Effort, SyntheticAthlete } from '../../synthetic'
import { DEFAULT_ATHLETE } from '../../synthetic'
import type { Activity, Sport } from '../../types'

/** The kinds of training a synthetic library follows, week after week. */
export type LibraryKind =
  | 'easy'
  | 'tempo'
  | 'tempoEasy'
  | 'mixed'
  | 'hard'
  | 'hardHeavy'
  | 'raceMix'
  | 'hardSparse'
  | 'testOnly'

export const LIBRARY_KINDS: readonly LibraryKind[] = [
  'easy',
  'tempo',
  'tempoEasy',
  'mixed',
  'hard',
  'hardHeavy',
  'raceMix',
  'hardSparse',
  'testOnly',
]

/** Monday 4 January 2021, noon UTC: the library's first day. */
const FIRST_MONDAY_MS = Date.UTC(2021, 0, 4, 12)

/** One session of a library: the effort, and the day of the week it falls on (0 is Monday). */
interface Session {
  effort: Effort
  day: number
}

/** A week's sessions for a kind. `week` varies the monthly test and the races. */
function weekOf(kind: LibraryKind, week: number): Session[] {
  const easy = (day: number): Session => ({ effort: 'easy', day })
  switch (kind) {
    case 'easy':
      return [easy(0), easy(2), easy(4), easy(6)]
    case 'tempo':
      return [
        { effort: 'tempo', day: 0 },
        { effort: 'tempo', day: 2 },
        { effort: 'tempo', day: 4 },
      ]
    case 'tempoEasy':
      return [easy(0), { effort: 'tempo', day: 2 }, easy(4), easy(6)]
    case 'mixed':
      return [easy(0), { effort: 'tempo', day: 2 }, { effort: 'intervals', day: 4 }, easy(6)]
    case 'hard':
      return [
        easy(0),
        { effort: 'intervals', day: 2 },
        week % 4 === 3 ? { effort: 'test', day: 4 } : { effort: 'tempo', day: 4 },
        easy(6),
      ]
    case 'hardHeavy':
      return [
        { effort: 'intervals', day: 0 },
        easy(1),
        { effort: 'intervals', day: 3 },
        week % 3 === 2 ? { effort: 'test', day: 5 } : { effort: 'tempo', day: 5 },
      ]
    case 'raceMix':
      return [easy(0), easy(2), easy(4), week % 4 === 3 ? { effort: 'race', day: 6 } : easy(6)]
    case 'hardSparse':
      return [
        easy(0),
        easy(2),
        week % 2 === 1 ? { effort: 'intervals', day: 4 } : easy(4),
        week === 6 ? { effort: 'test', day: 6 } : easy(6),
      ]
    case 'testOnly':
      return week === 5 ? [{ effort: 'test', day: 2 }] : []
  }
}

/** Minutes an activity of an effort lasts, before the draw of up to 20 more. */
const MINUTES: Record<Effort, number> = { easy: 45, tempo: 55, intervals: 60, test: 100, race: 40 }

/**
 * How far a day's form moves the effort of a session, as a share of the athlete's critical power: the lowest and
 * highest factor. An easy day is a little harder or easier, a test is never quite all-out.
 */
const FORM: Record<Effort, readonly [low: number, high: number]> = {
  easy: [0.88, 1.12],
  tempo: [0.95, 1.05],
  intervals: [0.98, 1.02],
  test: [0.94, 1],
  race: [0.98, 1.02],
}

/** What varies between athletes: the arm of the sweep. */
export interface AthleteOptions {
  /** Maximum heart rate range, bpm. */
  hrMax?: readonly [low: number, high: number]
  /** Heart rate at critical power over maximum. */
  atCp?: readonly [low: number, high: number]
}

/** An athlete near the default, with the truth varied the way real athletes vary. */
export function athleteFor(seed: number, options: AthleteOptions = {}): SyntheticAthlete {
  const rand = mulberry32(seed * 7919 + 13)
  const between = (low: number, high: number) => low + (high - low) * rand()
  const cpRun = between(13, 20)
  const hrMax = between(...(options.hrMax ?? [165, 200]))
  const hrIntercept = between(45, 70)
  const atCp = between(...(options.atCp ?? [0.88, 0.95]))
  return {
    ...DEFAULT_ATHLETE,
    cpRun,
    cpRide: cpRun * between(0.85, 1.05),
    wPrime: between(900, 1600),
    hrMax,
    hrIntercept,
    hrSlope: (hrMax * atCp - hrIntercept) / cpRun,
  }
}

/**
 * The year of birth an athlete's maximum heart rate implies, with the between-person spread of the age rule (sd 10 bpm)
 * on top, for a library that ends in 2021; null when that would be an age under 15 or over 85.
 */
export function birthYearFor(athlete: SyntheticAthlete, seed: number): number | null {
  const rand = mulberry32(seed * 31337 + 5)
  const noise = (rand() + rand() + rand() - 1.5) * 20
  const age = Math.round((208 - (athlete.hrMax + noise)) / 0.7)
  return age < 15 || age > 85 ? null : 2021 - age
}

/** How a library's sessions are drawn beyond their kind. */
export interface LibraryOptions {
  weeks?: number
  /** Easy sessions run at a heart rate of this share of maximum, instead of 65% of critical power. */
  easyShare?: readonly [low: number, high: number]
  /** The between-day spread of the heart rate's offset, bpm (heat, sleep, caffeine). */
  dayOffsetBpm?: number
  /** The share of easy sessions with strides: short bursts that lift the heart rate. */
  strides?: number
}

/** A standard normal draw. */
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
}

/** Lifts the heart rate in six 20 s bursts, as strides do. The stream is changed in place. */
function addStrides(activity: Activity, rand: () => number, hrMax: number): void {
  for (let k = 0; k < 6; k++) {
    const start = Math.floor(rand() * Math.max(1, activity.n - 40))
    for (let i = start; i < Math.min(activity.n, start + 20); i++) {
      activity.heartRate[i] = Math.min(hrMax, activity.heartRate[i]! + 14)
    }
  }
}

/** The library's activities of one sport for a kind of training and an athlete, 12 weeks, deterministic. */
export function libraryOf(
  kind: LibraryKind,
  athlete: SyntheticAthlete,
  seed: number,
  sport: Sport = 'run',
  options: LibraryOptions = {},
): Activity[] {
  const rand = mulberry32(seed * 104729 + 7)
  const activities: Activity[] = []
  // Heart rate at critical power is the athlete's, whichever sport holds it: the heart-rate line is cut to the sport's.
  const cp = sport === 'ride' ? athlete.cpRide : athlete.cpRun
  const body: SyntheticAthlete = {
    ...athlete,
    hrSlope: (athlete.hrSlope * athlete.cpRun) / cp,
  }
  for (let week = 0; week < (options.weeks ?? 12); week++) {
    for (const session of weekOf(kind, week)) {
      const minutes = MINUTES[session.effort] + Math.floor(rand() * 20)
      // The day's form moves every effort: an easy day can be a little harder or easier, a hard one barely so.
      const [low, high] = FORM[session.effort]
      let form = low + (high - low) * rand()
      let level = cp
      if (session.effort === 'easy' && options.easyShare !== undefined) {
        // The metabolic power that gives this heart rate, from the heart-rate line, over the easy run's 65% of critical power.
        const [lo, hi] = options.easyShare
        const share = lo + (hi - lo) * rand()
        level = (share * body.hrMax - body.hrIntercept) / body.hrSlope / 0.65
        form = 1
      }
      const offset = options.dayOffsetBpm === undefined ? 0 : options.dayOffsetBpm * normal(rand)
      const today = {
        ...body,
        cpRun: level * form * (athlete.cpRun / cp),
        cpRide: level * form * (athlete.cpRide / cp),
        hrIntercept: body.hrIntercept + offset,
      }
      const activity = generateActivity(
        today,
        {
          id: `${sport}-${week}-${session.day}`,
          name: `${session.effort} ${week}`,
          sport,
          startMs: FIRST_MONDAY_MS + (week * 7 + session.day) * DAY_MS,
          durationS: minutes * 60,
          effort: session.effort,
          terrain: sport === 'run' ? 'flat' : 'rolling',
        },
        Math.floor(rand() * 0x100000000),
      )
      if (session.effort === 'easy' && options.strides !== undefined && rand() < options.strides) {
        addStrides(activity, rand, athlete.hrMax)
      }
      activities.push(activity)
    }
  }
  return activities
}

/**
 * The athlete's critical power as the analysis would measure it: the generator prices a run at the
 * athlete's own economy, and the analysis at the prior mean, so the same speed reads as a different power.
 */
export function truthCp(athlete: SyntheticAthlete): number {
  const scale = PRIORS.runEconomyScale.mean / athlete.runEconomyScale
  return RESTING_W_PER_KG + scale * (athlete.cpRun - RESTING_W_PER_KG)
}
