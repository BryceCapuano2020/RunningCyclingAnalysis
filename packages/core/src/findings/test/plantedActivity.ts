import { DURABILITY_AFTER_S, DURATIONS_S } from '../../constants'
import { normal } from '../../math'
import { flatSpeedToMetabolic } from '../../metabolic'
import { withBlocks, heartRatesOf } from '../../digest/test/sameHeartRateFixture'
import type {
  ActivityDigest,
  DigestCurvePoint,
  DigestDistribution,
  DigestDurabilityPoint,
  DigestSplit,
  Sport,
} from '../../types'
import { normalCdf } from '../stats'

/** A session in an athlete's week: easy most days, one hard day, one long one. */
export type SessionKind = 'easy' | 'hard' | 'long'

/** The state of an athlete in the week an activity falls in, after the planted effects and nuisances. */
export interface Conditions {
  /** Multiplies output at the same heart rate; 1 is the baseline fitness. */
  efficiency: number
  /** What the device reports of output (power) against the truth; 1 unless the meter changed. */
  reading: number
  /** Multiplies every session's time. */
  volume: number
  /** The chance an activity has no heart rate at all. */
  hrLost: number
  /** The chance an activity's heart rate is wrong in places (a spike). */
  spikeRate: number
  /** Beats per minute the easy sessions are run above the plan. */
  easyCreepBpm: number
  /** Added to the share of output per heart rate lost between the halves of a long steady effort. */
  decouplingShift: number
  /** Added to the share of fresh output kept after hours on the move. */
  retentionShift: number
  /** What the strap reads above the truth. */
  hrOffsetBpm: number
  /** Relative spread of one day against another, and of one block against another. */
  noise: number
  /** Whether a day's spread comes from a heavy-tailed distribution (Student's t on 3 degrees of freedom) rather than a normal. */
  heavyTails: boolean
}

/** The athlete before anything is planted. */
export const BASELINE: Conditions = {
  efficiency: 1,
  reading: 1,
  volume: 1,
  hrLost: 0,
  spikeRate: 0,
  easyCreepBpm: 0,
  decouplingShift: 0,
  retentionShift: 0,
  hrOffsetBpm: 0,
  noise: 0.02,
  heavyTails: false,
}

/** A Student's t draw on 3 degrees of freedom scaled to unit variance: a day now and then far from the others. */
function heavyDraw(random: () => number): number {
  const chi = normal(random) ** 2 + normal(random) ** 2 + normal(random) ** 2
  return normal(random) / Math.sqrt(chi / 3) / Math.sqrt(3)
}

/** What fresh legs do for 5 and 20 minutes, raw (m/s, W): the best a hard day shows. */
const FRESH_S = [300, 1200] as const

interface Model {
  /** Output (m/s, W) at a heart rate at the baseline fitness, and the heart rate that gives an output. */
  output: (heartRate: number) => number
  heartRate: (output: number) => number
  /** Output per bpm, so a shift in bpm can be turned into one in output. */
  perBpm: number
  /** Planned output and minutes of each kind of session. */
  plans: Record<SessionKind, { output: number; minutes: number }>
  fresh: Record<(typeof FRESH_S)[number], number>
  /** A raw output as a curve point holds it: metabolic W/kg for a run, watts for a ride. */
  curveValue: (output: number) => number
  /** Spread of output inside one session, raw. */
  sessionSd: number
  distribution: 'speed' | 'power'
  binWidth: number
  kmSplits: boolean
  powerSource: ActivityDigest['powerSource']
  /** Metres covered at an output in a second. */
  metresPerSecond: (output: number) => number
}

const MODELS: Record<Sport, Model> = {
  run: {
    output: (hr) => 2.86 + 0.02 * (hr - 145),
    heartRate: (v) => 145 + (v - 2.86) / 0.02,
    perBpm: 0.02,
    plans: {
      easy: { output: 2.7, minutes: 45 },
      hard: { output: 3.3, minutes: 35 },
      long: { output: 2.62, minutes: 100 },
    },
    fresh: { 300: 4.3, 1200: 3.9 },
    curveValue: flatSpeedToMetabolic,
    sessionSd: 0.12,
    distribution: 'speed',
    binWidth: 0.05,
    kmSplits: true,
    powerSource: 'none',
    metresPerSecond: (v) => v,
  },
  ride: {
    output: (hr) => 180 + 2 * (hr - 145),
    heartRate: (p) => 145 + (p - 180) / 2,
    perBpm: 2,
    plans: {
      easy: { output: 150, minutes: 75 },
      hard: { output: 225, minutes: 60 },
      long: { output: 165, minutes: 150 },
    },
    fresh: { 300: 320, 1200: 260 },
    curveValue: (p) => p,
    sessionSd: 25,
    distribution: 'power',
    binWidth: 5,
    kmSplits: false,
    powerSource: 'measured',
    metresPerSecond: (p) => 5 + p / 40,
  },
}

/** How much of fresh output the best effort after this many seconds on the move keeps, at baseline. */
const RETENTION: Record<number, number> = { 3600: 0.96, 5400: 0.93, 7200: 0.9 }
/** The share of output per heart rate a long steady effort loses between its halves, at baseline. */
const BASE_DECOUPLING = 0.04

/** Seconds in bins of `width` about a normal with this mean and spread: counts are whole seconds, edges trimmed. */
function distributionOf(
  mean: number,
  sd: number,
  width: number,
  totalS: number,
): DigestDistribution {
  const first = Math.max(0, Math.floor((mean - 3 * sd) / width))
  const last = Math.floor((mean + 3 * sd) / width)
  const counts: number[] = []
  for (let bin = first; bin <= last; bin++) {
    const share = normalCdf(((bin + 1) * width - mean) / sd) - normalCdf((bin * width - mean) / sd)
    counts.push(Math.round(totalS * share))
  }
  let lead = 0
  while (lead < counts.length - 1 && counts[lead] === 0) lead++
  while (counts.length - 1 > lead && counts.at(-1) === 0) counts.pop()
  return { offset: first + lead, counts: counts.slice(lead) }
}

function curveOf(model: Model, level: number, read: number, random: () => number, noise: number) {
  return DURATIONS_S.map<DigestCurvePoint>((durationS) => {
    const fresh = model.fresh[durationS as (typeof FRESH_S)[number]]
    const value =
      fresh === undefined
        ? Number.NaN
        : model.curveValue(fresh * level * read * (1 + noise * normal(random)))
    return { durationS, value, startIndex: 0, windowS: durationS, heartRate: null, terms: null }
  })
}

function durabilityOf(
  model: Model,
  movingS: number,
  level: number,
  read: number,
  cond: Conditions,
  random: () => number,
): DigestDurabilityPoint[] {
  const points: DigestDurabilityPoint[] = []
  for (const afterS of DURABILITY_AFTER_S) {
    for (const durationS of FRESH_S) {
      if (afterS + durationS > movingS) continue
      const kept = RETENTION[afterS]! + cond.retentionShift + 0.02 * normal(random)
      points.push({
        afterS,
        durationS,
        value: model.curveValue(model.fresh[durationS] * level * read * kept),
      })
    }
  }
  return points
}

function splitsOf(
  model: Model,
  distanceM: number,
  speed: number,
  level: number,
  cond: Conditions,
  hasHeartRate: boolean,
  spiked: boolean,
  random: () => number,
): DigestSplit[] {
  const km: DigestSplit[] = []
  for (let k = 0; k < Math.floor(distanceM / 1000); k++) {
    const kmSpeed = speed * (1 + 0.012 * normal(random))
    const heartRate = model.heartRate(kmSpeed / level) + cond.hrOffsetBpm + 1.5 * normal(random)
    const seconds = 1000 / kmSpeed
    km.push({
      distanceM: 1000,
      seconds: Math.round(seconds * 100) / 100,
      gradeAdjustedSeconds: Math.round(seconds * (1 + 0.004 * normal(random)) * 100) / 100,
      elevationGainM: Math.round(Math.max(0, 2 + 2 * normal(random)) * 10) / 10,
      avgHeartRate: hasHeartRate
        ? Math.round((heartRate + (spiked && k % 4 === 0 ? 25 : 0)) * 10) / 10
        : null,
    })
  }
  return km
}

export interface ActivityArgs {
  sport: Sport
  id: string
  startMs: number
  kind: SessionKind
  /** Numbers the blocks' heart rates, so that activities differ a little. */
  index: number
  cond: Conditions
  /** Draws for this activity alone, so that planting an effect never moves another activity's noise. */
  random: () => number
}

/**
 * One activity at the digest level, with the fields findings read: steady blocks, time, average heart
 * rate and output, distributions of both, kilometre splits for a run, durability points and drift for
 * a long effort. Output follows the sport's line, output = a + b (heart rate - 145), times the athlete's
 * efficiency and the day; pace or power is planned and the heart rate follows from it.
 */
export function plantedActivity(args: ActivityArgs): ActivityDigest {
  const { sport, id, startMs, kind, index, cond, random } = args
  const model = MODELS[sport]
  const plan = model.plans[kind]
  const read = cond.reading
  const day = cond.heavyTails ? heavyDraw(random) : normal(random)
  const level = cond.efficiency * (1 + cond.noise * day)
  const movingS = Math.round(plan.minutes * 60 * cond.volume * (0.85 + 0.3 * random()))
  const hasHeartRate = random() >= cond.hrLost
  const spiked = hasHeartRate && random() < cond.spikeRate
  const creep = kind === 'easy' ? cond.easyCreepBpm * model.perBpm * level : 0
  const output = plan.output * (1 + 0.015 * normal(random)) + creep
  const trueHr = model.heartRate(output / level) + 1.5 * normal(random)
  const avgHeartRate = trueHr + cond.hrOffsetBpm + (spiked ? 12 : 0)
  const distanceM = Math.round(model.metresPerSecond(output) * movingS)
  const blocks = heartRatesOf(index).map((hr, i) => ({
    heartRate: hr + cond.hrOffsetBpm + (spiked && i < 2 ? 30 : 0),
    output: model.output(hr) * level * read * (1 + cond.noise * normal(random)),
  }))
  const steady = kind !== 'hard' && movingS >= 3600
  const firstRatio = model.curveValue(output * read) / (avgHeartRate - 1.5)
  const decoupling =
    BASE_DECOUPLING + cond.decouplingShift + 0.015 * normal(random) + (spiked ? 0.2 : 0)
  return withBlocks(sport, id, startMs, hasHeartRate ? blocks : [], {
    name: `${kind} ${sport}`,
    durationS: Math.round(movingS * 1.03),
    movingS,
    distanceM,
    elevationGainM: Math.round(distanceM / 400),
    hasHeartRate,
    powerSource: model.powerSource,
    flags: [],
    flagCounts: {},
    maxHeartRate: hasHeartRate ? Math.round(avgHeartRate + 15) : null,
    avgHeartRate: hasHeartRate ? Math.round(avgHeartRate * 10) / 10 : null,
    avgPowerW: model.distribution === 'power' ? Math.round(output * read) : null,
    curve: curveOf(model, level, read, random, cond.noise),
    distributions: {
      heartRate: hasHeartRate
        ? distributionOf(avgHeartRate, kind === 'hard' ? 9 : 6, 1, movingS)
        : undefined,
      [model.distribution]: distributionOf(output * read, model.sessionSd, model.binWidth, movingS),
    },
    durability: durabilityOf(model, movingS, level, read, cond, random),
    drift:
      hasHeartRate && steady
        ? { firstRatio, secondRatio: firstRatio * (1 - decoupling), durationS: movingS - 600 }
        : null,
    splits: model.kmSplits
      ? {
          km: splitsOf(model, distanceM, output, level, cond, hasHeartRate, spiked, random),
          mile: [],
        }
      : undefined,
    distanceBests: undefined,
  })
}

/** The sport's planned heart rate for a session at the baseline fitness, for tests of what a library should show. */
export function plannedHeartRate(sport: Sport, kind: SessionKind): number {
  return MODELS[sport].heartRate(MODELS[sport].plans[kind].output)
}

/**
 * Beats per minute lower the heart rate is at a session's planned output after an efficiency gain of
 * `size` (0.05 is 5%): the conversion for a detector that reports heart rate at a pace, or at a power,
 * to the efficiency this harness plants, and back (divide by the number for 1% to get the efficiency of
 * a bpm). The model is output = a + b (heart rate - 145), so the heart rate at an output v is
 * 145 + (v / (1 + gain) - a) / b, and a gain of g takes v g / ((1 + g) b) off: 1.34 bpm per 1% for an
 * easy run (2.7 m/s, b = 0.02) and 0.74 bpm per 1% for an easy ride (150 W, b = 2).
 */
export function bpmForEfficiency(sport: Sport, kind: SessionKind, size: number): number {
  const { plans, perBpm } = MODELS[sport]
  return (plans[kind].output * size) / ((1 + size) * perBpm)
}
