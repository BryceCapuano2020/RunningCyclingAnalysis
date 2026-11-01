import { digestActivity } from '../../digest/digestActivity'
import { MODEL_REVISION } from '../../digest/modelRevision'
import { NO_EFFORT_REFERENCE } from '../../effort'
import type { EffortReference } from '../../effort'
import { flatSpeedToMetabolic } from '../../metabolic'
import type { Activity, ActivityDigest, PowerSource, Sport } from '../../types'
import type { HistoryInput } from '../types'

/** A flat activity of 2501 s, digested once per sport; the helpers below override the parts a test reads. */
function activity(sport: Sport): Activity {
  const n = 2501
  return {
    id: 'base',
    name: 'Base',
    sport,
    startMs: 0,
    n,
    speed: new Float64Array(n).fill(4),
    distance: Float64Array.from({ length: n }, (_, i) => 4 * i),
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(NaN),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: sport === 'ride',
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
}

const BASE: Record<Sport, ActivityDigest> = {
  run: digestActivity(activity('run')),
  ride: digestActivity(activity('ride')),
}

export interface DigestFields {
  indoor?: boolean
  /** The highest 30 s heart rate, bpm; null for an activity with none. */
  maxHeartRate?: number | null
  /** Seconds spent at that peak, which a hard session needs enough of (default 600). */
  secondsAtPeak?: number
  avgHeartRate?: number | null
  distanceBests?: ActivityDigest['distanceBests']
  /** Where a ride's watts came from; a ride is measured unless it says otherwise. */
  powerSource?: PowerSource
}

/** The fields of a digest that a test sets, with the heart-rate distribution that goes with a peak. */
function withFields({ secondsAtPeak = 600, ...fields }: DigestFields): Partial<ActivityDigest> {
  const peak = fields.maxHeartRate
  return {
    ...fields,
    distributions:
      typeof peak === 'number'
        ? { heartRate: { offset: peak, counts: [secondsAtPeak] } }
        : undefined,
  }
}

/** A run whose best flat speed, m/s, at each duration (s) is given; every other duration has none. */
export function runDigest(
  id: string,
  startMs: number,
  speeds: Record<number, number> = {},
  fields: DigestFields = {},
): ActivityDigest {
  return {
    ...BASE.run,
    ...withFields(fields),
    id,
    startMs,
    modelRevision: MODEL_REVISION,
    curve: BASE.run.curve.map((p) =>
      Object.assign({}, p, {
        value: p.durationS in speeds ? flatSpeedToMetabolic(speeds[p.durationS]!) : NaN,
      }),
    ),
  }
}

/** A ride whose power-meter watts at each duration (s) is given; every other duration has none. */
export function rideDigest(
  id: string,
  startMs: number,
  watts: Record<number, number> = {},
  fields: DigestFields = {},
): ActivityDigest {
  return {
    ...BASE.ride,
    powerSource: 'measured',
    ...withFields(fields),
    id,
    startMs,
    modelRevision: MODEL_REVISION,
    curve: BASE.ride.curve.map((p) =>
      Object.assign({}, p, {
        value: p.durationS in watts ? watts[p.durationS]! : NaN,
        terms: null,
      }),
    ),
  }
}

/** A reference heart rate of 190 bpm for both sports, which a peak of 171 bpm reaches hard. */
export const TRUSTED: EffortReference = {
  referenceHr: { run: 190, ride: 190 },
  reading: { run: 'trusted', ride: 'trusted' },
  source: { run: 'entered', ride: 'entered' },
  from: { run: null, ride: null },
}

export const HARD_BPM = 185
export const EASY_BPM = 140

export const INPUT: HistoryInput = {
  settings: { massKg: 70, bikeMassKg: 9 },
  setAside: new Set<string>(),
  nowMs: Date.UTC(2030, 0, 1),
  gate: null,
  effortReference: TRUSTED,
}

/** The same input for a library with no heart rate judged. */
export const UNJUDGED: HistoryInput = { ...INPUT, effortReference: NO_EFFORT_REFERENCE }

export const at = (year: number, month = 6, day = 1) => Date.UTC(year, month - 1, day, 12)
