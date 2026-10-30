import { DAY_MS, PRIORS, RESTING_W_PER_KG } from '../../constants'
import { mulberry32 } from '../../math'
import { generateActivity } from '../../synthetic'
import type { Effort, SyntheticAthlete } from '../../synthetic'
import { DEFAULT_ATHLETE } from '../../synthetic'
import type { Activity, Sport } from '../../types'

/** The kinds of training a synthetic library follows, week after week. */
export type LibraryKind =
  'easy' | 'tempo' | 'tempoEasy' | 'mixed' | 'hard' | 'raceMix' | 'hardSparse' | 'testOnly'

export const LIBRARY_KINDS: readonly LibraryKind[] = [
  'easy',
  'tempo',
  'tempoEasy',
  'mixed',
  'hard',
  'raceMix',
  'hardSparse',
  'testOnly',
]

const WEEKS = 12
/** Monday 4 January 2021, noon UTC. */
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

/** Minutes an activity of an effort lasts, before the draw of up to 20 more. */
const MINUTES: Record<Effort, number> = { easy: 45, tempo: 55, intervals: 60, test: 100, race: 40 }

/** An athlete near the default, with the truth varied the way real athletes vary. */
export function athleteFor(seed: number): SyntheticAthlete {
  const rand = mulberry32(seed * 7919 + 13)
  const between = (low: number, high: number) => low + (high - low) * rand()
  const cpRun = between(13, 20)
  const hrMax = between(165, 200)
  const hrIntercept = between(45, 70)
  const atCp = between(0.88, 0.95)
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

/** The library's activities of one sport for a kind of training and an athlete, 12 weeks, deterministic. */
export function libraryOf(
  kind: LibraryKind,
  athlete: SyntheticAthlete,
  seed: number,
  sport: Sport = 'run',
): Activity[] {
  const rand = mulberry32(seed * 104729 + 7)
  const activities: Activity[] = []
  // Heart rate at critical power is the athlete's, whichever sport holds it: the heart-rate line is cut to the sport's.
  const body: SyntheticAthlete = {
    ...athlete,
    hrSlope:
      (athlete.hrSlope * athlete.cpRun) / (sport === 'ride' ? athlete.cpRide : athlete.cpRun),
  }
  for (let week = 0; week < WEEKS; week++) {
    for (const session of weekOf(kind, week)) {
      const minutes = MINUTES[session.effort] + Math.floor(rand() * 20)
      // The day's form moves every effort: an easy day can be a little harder or easier, a hard one barely so.
      const [low, high] = FORM[session.effort]
      const form = low + (high - low) * rand()
      const today = { ...body, cpRun: body.cpRun * form, cpRide: body.cpRide * form }
      activities.push(
        generateActivity(
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
        ),
      )
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
