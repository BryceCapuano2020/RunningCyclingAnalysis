import { DAY_MS } from '../constants'
import { mulberry32 } from '../math'
import type { Activity, Sport } from '../types'
import { DEFAULT_ATHLETE } from './athlete'
import type { SyntheticAthlete } from './athlete'
import { generateActivity } from './generate'
import { raceOfDistance } from './noise/library'
import { weeklyLevel } from './noise/level'
import { NOISE_PRESETS } from './noise/presets'
import { studentT5 } from './noise/random'
import type { NoiseModel } from './noise/types'
import { noiseWith } from './noise/variants'
import { withRecordGap } from './sampleRecording'
import type { RecordGap } from './sampleRecording'
import { FULL_WEEKS, isFeatured, nameOf, slotFor, variantOf } from './sampleSlots'
import type { ActivitySpec } from './spec'

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
 *
 * It is drawn from the generator's sensor and behaviour model (the `measured` preset: a wrist watch's heart rate
 * and a watch's GPS, hard efforts that vary, an easy week that wanders) and holds the awkward recordings a real
 * library does: two treadmill runs, a run with no heart rate, a stretch the watch did not record, a 5K that is
 * 5.0 km. Its hard efforts (tests, tempo, intervals, a race, a time trial) reach the top of the athlete's heart
 * rate, so the effort gate passes. The ride's fitness card is the one honest "not enough" state.
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

/**
 * The seeds, of the first 40, whose season tells the sample's whole story on every clock tried: the shipped detector
 * finds the planted easy slip with a range clear of zero, the ride's fitness card says it has too few steady rides to
 * compare, both sports' best efforts pass the effort gate with a margin, and every threshold and stand-out profile
 * has what it needs. A seed is another draw of the same athlete, and most do not: the detector fires on about
 * seven in ten, the gate on most, and the rest of the story on a few (five of forty). The sample uses the first, which
 * also keeps the chart labels of the 200% text e2e apart (a threshold label can meet a tick label on a phone).
 * `sampleSeason.sim.test.ts` replays the list.
 */
export const SAMPLE_SEEDS: readonly number[] = [15, 26, 4, 31, 37]
export const SAMPLE_SEED = SAMPLE_SEEDS[0]!

/**
 * The sample athlete's body: the default athlete with a heart-rate line that puts easy running near 80% of a
 * maximum of 176 bpm and threshold running near 90%, so the zones from pace and from heart rate sit within one of each other.
 */
export const SAMPLE_ATHLETE: SyntheticAthlete = {
  ...DEFAULT_ATHLETE,
  grossEfficiency: 0.185,
  hrIntercept: 44,
  hrSlope: 7,
  hrMax: 176,
}

/**
 * The watch and the athlete's habits: the `measured` model, the one every synthetic tier shares, on a route with
 * few lights (up to two stops of 5 to 30 s) and a wrist sensor that rarely loses the pulse for long (at most one
 * gap, and one in three of those under the 10 s that flags a run). The model's own ranges flag most runs, which is
 * a harsher watch than the sample means to show.
 */
export const SAMPLE_NOISE: NoiseModel = noiseWith(NOISE_PRESETS.measured, {
  gps: { stops: { max: 2, minS: 5, maxS: 30 } },
  heartRate: { dropouts: { max: 1, minS: 3, maxS: 14 } },
})
/** The same athlete on a treadmill: belt speed, no altitude, no route. */
const TREADMILL_NOISE: NoiseModel = noiseWith(SAMPLE_NOISE, { behaviour: { treadmillShare: 1 } })

/** One planned activity: what to generate and with which athlete, before any samples exist. */
export interface SampleEntry {
  spec: ActivitySpec
  /** The athlete's form on that day: the same body, with the threshold the season had reached. */
  athlete: SyntheticAthlete
  seed: number
  /** The sensor and behaviour model the recording is drawn with. */
  noise: NoiseModel
  /** A race recorded from the start line over exactly this distance, m. */
  raceM?: number
  /** A stretch the watch did not record. */
  gap?: RecordGap
}

/** The season's length: the early history ends this many weeks before its last Sunday. */
const SEASON_WEEKS = 56
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
const EASY_SLIP = { startWeeks: 9, fallWeeks: 4, depth: 0.14 }
/**
 * A real athlete's easy pace is not a straight line. The model's weekly level wanders (AR(1), the same for every
 * run of a week) and each run adds its own Student t draw, both from seeded streams, so the season is the same on
 * every load and the status reads a slip through some noise.
 */
const EASY_LEVEL = { weeklySeed: 17, runSeed: 29 }
/** The sports whose easy running carries the slip and the wander, a table so no sport is named in the plan. */
const EASY_COST_MOVES: Record<Sport, boolean> = { run: true, ride: false }

/** The share of the season's climb made by the start of the last twelve weeks: the build is steeper after it. */
const CLIMB_BEFORE_BUILD = 0.5
/** How far a day's form sits off the season's line, up or down. */
const FORM_SPREAD = 0.015
const SKIP_CHANCE = 0.08

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
    return SAMPLE_ATHLETE[key] * line * (1 + (2 * form - 1) * FORM_SPREAD)
  }
  return {
    ...SAMPLE_ATHLETE,
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

/** The model's weekly level (log units, up is fitter) for the weeks of the season, the first week first. */
const WEEKLY_LEVEL = weeklyLevel(
  SAMPLE_NOISE.level,
  SEASON_WEEKS,
  mulberry32(EASY_LEVEL.weeklySeed),
)

/** The week's wander in an easy run's cost, the same on every day of the week: a few percent either way. */
export function easyWobbleOn(daysAgo: number): number {
  const week = Math.min(SEASON_WEEKS - 1, Math.floor(daysAgo / 7))
  return Math.exp(-WEEKLY_LEVEL[SEASON_WEEKS - 1 - week]!) - 1
}

/** One easy run's own draw (Student t, the model's run-to-run spread) in its cost, from a stream of its day. */
export function easyRunDrawOn(daysAgo: number): number {
  const t = studentT5(mulberry32(EASY_LEVEL.runSeed * 1000 + daysAgo))
  return Math.exp(-SAMPLE_NOISE.level.runSd * t) - 1
}

/** An easy run's cost on a day, against the season's line: the slip, the week's wander and the run's own draw. */
export function easyCostOn(daysAgo: number): number {
  return (1 + easySlipOn(daysAgo)) * (1 + easyWobbleOn(daysAgo)) * (1 + easyRunDrawOn(daysAgo))
}

function offsetOf(clock: SampleClock): (ms: number) => number {
  return clock.utcOffsetMinutes ?? (() => 0)
}

/** The instant a local clock reading names: the clock's own milliseconds, less the zone's offset then. */
function instantOf(localMs: number, offsetAt: (ms: number) => number): number {
  const guess = localMs - offsetAt(localMs) * 60_000
  return localMs - offsetAt(guess) * 60_000
}

/**
 * The season's activities, oldest first, as a plan: no samples are generated until an entry is. The last
 * Sunday on or before the day before `clock.nowMs`'s day ends it. Ids are numbered in time order.
 */
export function samplePlan(clock: SampleClock = SAMPLE_CLOCK, seed = SAMPLE_SEED): SampleEntry[] {
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
    const [skip, pick, hourDraw, lengthDraw, seedDraw, nameDraw] = [
      rand(),
      rand(),
      rand(),
      rand(),
      rand(),
      rand(),
    ]
    const form = athleteOn(daysBefore, rand(), rand())
    // The anchor is a Sunday, so a day's weekday follows from its distance from it alone.
    const weekday = (7 - (daysBefore % 7)) % 7
    const weeksAgo = Math.floor(daysBefore / 7)
    const planned = variantOf(slotFor(weekday, weeksAgo, pick), weekday, weeksAgo)
    if (planned === null || (skip < SKIP_CHANCE && !isFeatured(planned))) continue
    const [hour, spread] = planned.hour
    const [shortest, longest] = planned.minutes
    const startHour = hour + spread * hourDraw
    const startLocalMs = anchorLocalMs - daysBefore * DAY_MS + Math.round(startHour * 60) * 60_000
    entries.push({
      spec: {
        id: `sample-${String(entries.length + 1).padStart(3, '0')}`,
        name: nameOf(planned, startHour, nameDraw),
        sport: planned.sport,
        startMs: instantOf(startLocalMs, offsetAt),
        durationS: (shortest + Math.round(lengthDraw * (longest - shortest))) * 60,
        effort: planned.effort,
        terrain: planned.terrain,
        withPower: planned.withPower,
        withHeartRate: planned.withHeartRate,
        hrGlitch: planned.hrGlitch,
      },
      athlete:
        EASY_COST_MOVES[planned.sport] && planned.effort === 'easy'
          ? { ...form, runEconomyScale: form.runEconomyScale * easyCostOn(daysBefore) }
          : form,
      seed: Math.floor(seedDraw * 0x100000000),
      noise: planned.treadmill ? TREADMILL_NOISE : SAMPLE_NOISE,
      ...(planned.raceM === undefined ? {} : { raceM: planned.raceM }),
      ...(planned.gap === undefined ? {} : { gap: planned.gap }),
    })
  }
  return entries
}

/** Generates one planned activity, second by second. */
export function generateSampleActivity(entry: SampleEntry): Activity {
  const drawn = generateActivity(entry.athlete, entry.spec, entry.seed, entry.noise)
  const raced = entry.raceM === undefined ? drawn : raceOfDistance(drawn, entry.raceM)
  return entry.gap === undefined ? raced : withRecordGap(raced, entry.gap)
}

/**
 * The sample athlete's season for the "See a sample athlete" button. `athlete` is today's form, the
 * ground truth the newest efforts are drawn from.
 */
export function sampleSeason(
  clock: SampleClock = SAMPLE_CLOCK,
  seed = SAMPLE_SEED,
): { athlete: SyntheticAthlete; activities: Activity[] } {
  return {
    athlete: SAMPLE_ATHLETE,
    activities: samplePlan(clock, seed).map(generateSampleActivity),
  }
}
