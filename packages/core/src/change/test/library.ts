import { DAY_MS, DURATIONS_S } from '../../constants'
import { digestActivity } from '../../digest/digestActivity'
import { mulberry32, normal } from '../../math'
import { NOISE_PRESETS } from '../../synthetic/noise/presets'
import { sampleDataset } from '../../synthetic'
import type { ActivityDigest, AthleteSettings, Sport } from '../../types'

/** The wander's weekly correlation, the synthetic tier's measured one. */
const WANDER_RHO = NOISE_PRESETS.measured.level.wanderRho

export const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

const TEMPLATES = sampleDataset().activities.map((activity) => digestActivity(activity))
const TEMPLATE: Record<Sport, ActivityDigest> = {
  run: TEMPLATES.find((digest) => digest.sport === 'run')!,
  ride: TEMPLATES.find((digest) => digest.sport === 'ride' && digest.powerSource === 'measured')!,
}

/** Monday 6 January 2025, midday UTC. */
export const MONDAY = Date.UTC(2025, 0, 6, 12)

/** The athlete's capability at a length, in the curve's own unit: metabolic W/kg for a run, watts for a ride. */
const CAPABILITY: Record<Sport, (durationS: number) => number> = {
  run: (durationS) => 22 * (durationS / 300) ** -0.07,
  ride: (durationS) => 330 * (durationS / 300) ** -0.1,
}

export interface Spec {
  sport: Sport
  /** Activities a week, drawn at random (Poisson) when `irregular`, else exactly this many. */
  perWeek: number
  weeks: number
  seed: number
  /** The log capability at a week: a step or a ramp planted by the scenario. */
  level?: (week: number) => number
  /** The spread, as a log sd, of how near the capability an effort lands (hard efforts). Default 0.04. */
  spread?: number
  /** Share of efforts that are hard: they land within `spread` of the capability; the rest land 8 to 20% under. Default 0.5. */
  hardShare?: number
  /** Meter error, a log sd on each point of a curve. Default 0.01. */
  meter?: number
  /** A log wander of the capability from week to week (the measured correlation, 0.9), as a log sd. */
  wander?: number
  /**
   * Real noise: when given, every effort lands exp(effortSd * N(0, 1)) round the capability, with no ceiling and no easy
   * share, and carries that through every length it reaches. A hard effort of a real library lands above and below
   * its athlete's curve alike (terrain, heat, sleep, pacing, a stray sensor), which `spread` with its ceiling does not
   * draw: at `spread` the best of a period sits at the ceiling and the noise a best has is 6 to 17 times smaller than
   * a real library's. About 0.10 matches a run's 20 minutes (equal-capability pairs of periods differ by a median of
   * 3.5 to 6% there), and about 0.3 a ride's 5 minutes (a median of 10 to 15%).
   *
   * This is not `NOISE_PRESETS.measured.behaviour.effortSd` (0.0765 a run, 0.212 a ride): that is fitted to six efforts a
   * half, this to the efforts of two 12-week periods. Swapping it in moves the recorded power (a +10% gain in a run, 4 a
   * week, is found by 39% of seeds at 0.10 and 60% at 0.0765), so the two stay apart.
   */
  effortSd?: number
  /**
   * The peak heart rate (30 s) a hard and an easy effort carry, bpm, with no seconds-by-heart-rate distribution so the peak
   * alone is judged. Absent, an activity has no heart rate (the template's is kept).
   */
  peakHeartRate?: { hard: number; easy: number }
}

function poisson(random: () => number, mean: number): number {
  let k = 0
  let p = Math.exp(-mean)
  let sum = p
  const u = random()
  while (u > sum && k < 60) {
    k++
    p *= mean / k
    sum += p
  }
  return k
}

/**
 * A library of one sport's activities with curves from a known capability. Each activity is one effort: it lands
 * a factor under the capability (a hard one within `spread`, an easy one 8 to 20% under) and carries that factor
 * through every length it reaches, so its curve is the capability's shape scaled, and the monotone envelope holds.
 */
export function effortLibrary(spec: Spec): ActivityDigest[] {
  const random = mulberry32(spec.seed * 104_729 + 7)
  const spread = spec.spread ?? 0.04
  const hardShare = spec.hardShare ?? 0.5
  const meter = spec.meter ?? 0.01
  const template = TEMPLATE[spec.sport]
  const out: ActivityDigest[] = []
  let wander = 0
  for (let week = 0; week < spec.weeks; week++) {
    wander =
      WANDER_RHO * wander + Math.sqrt(1 - WANDER_RHO ** 2) * normal(random) * (spec.wander ?? 0)
    const count = Number.isInteger(spec.perWeek) ? spec.perWeek : poisson(random, spec.perWeek)
    for (let i = 0; i < count; i++) {
      const hard = random() < hardShare
      const factor =
        spec.effortSd !== undefined
          ? spec.effortSd * normal(random)
          : hard
            ? Math.min(0, spread * normal(random) - 0.01)
            : -(0.08 + 0.12 * random())
      const level = (spec.level?.(week) ?? 0) + wander + factor
      // The longest length this effort reaches: a hard effort tends to be long enough to count at 20 min.
      const reaches = DURATIONS_S[Math.min(DURATIONS_S.length - 1, 8 + Math.floor(random() * 11))]!
      const startMs = MONDAY + (week * 7 + (i * 7) / Math.max(1, count)) * DAY_MS
      const values = DURATIONS_S.map((durationS) =>
        durationS <= reaches
          ? CAPABILITY[spec.sport](durationS) * Math.exp(level + meter * normal(random))
          : Number.NaN,
      )
      // Hold the envelope: a shorter length is at least any longer one.
      for (let k = values.length - 2; k >= 0; k--) {
        if (Number.isFinite(values[k + 1]!) && !(values[k]! >= values[k + 1]!))
          values[k] = values[k + 1]!
      }
      out.push({
        ...template,
        id: `${spec.sport}-${spec.seed}-${week}-${i}`,
        startMs: Math.round(startMs),
        indoor: false,
        ...(spec.peakHeartRate === undefined
          ? {}
          : {
              maxHeartRate: hard ? spec.peakHeartRate.hard : spec.peakHeartRate.easy,
              distributions: undefined,
            }),
        curve: template.curve.map((point, k) =>
          Object.assign({}, point, { value: values[k]!, terms: null }),
        ),
      })
    }
  }
  return out
}
