import { DURATIONS_S } from '../constants'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { digestActivity } from './digestActivity'

/** The sample's digests, and a ride and a run from them as templates for test digests. */
export const SAMPLE_DIGESTS = sampleDataset().activities.map((activity) => digestActivity(activity))
export const RIDE_TEMPLATE = SAMPLE_DIGESTS.find((d) => d.sport === 'ride')!
export const RUN_TEMPLATE = SAMPLE_DIGESTS.find((d) => d.sport === 'run')!

export const DAY = 86_400_000
export const START = Date.UTC(2026, 5, 1, 9)

/** A power-meter ride whose best is watts(durationS) at every duration, with this heart rate beside it. */
export function meterRide(
  id: string,
  startMs: number,
  watts: (durationS: number) => number,
  heartRate: (watts: number) => number | null = () => null,
): ActivityDigest {
  const curve: DigestCurvePoint[] = DURATIONS_S.map((durationS) => ({
    durationS,
    value: watts(durationS),
    startIndex: 0,
    windowS: durationS,
    heartRate: heartRate(watts(durationS)),
    terms: null,
  }))
  return {
    ...RIDE_TEMPLATE,
    id,
    name: id,
    startMs,
    sport: 'ride',
    powerSource: 'measured',
    curve,
    hrBlocks: [],
    durability: undefined,
  }
}

/** A ride at a steady W/kg for a 70 kg rider at every duration. */
export const steadyRide = (id: string, startMs: number, wkg: number) =>
  meterRide(id, startMs, () => wkg * 70)
