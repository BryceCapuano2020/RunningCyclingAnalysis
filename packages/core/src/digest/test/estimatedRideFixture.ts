import { DAY_MS, DEFAULT_BIKE_MODEL, DRIVETRAIN_EFFICIENCY, DURATIONS_S } from '../../constants'
import { sampleDataset } from '../../synthetic'
import type { ActivityDigest, AthleteSettings, DigestCurvePoint, PowerTerms } from '../../types'
import { digestActivity } from '../digestActivity'

export const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

/** A ride with a power meter from the sample, to copy. */
const TEMPLATE = sampleDataset()
  .activities.map((activity) => digestActivity(activity))
  .find((d) => d.sport === 'ride' && d.powerSource === 'measured')!

/** Monday 3 March 2025, midday UTC. */
const START_MS = Date.UTC(2025, 2, 3, 12)

/** One best window of a ride: its watts, as measured or as the default bike model prices its terms, and its mean heart rate. */
export interface Window {
  watts: number
  heartRate: number | null
}

/**
 * Terms of a stretch that is all air, with no climb: at any mass the default bike model prices them at
 * `watts`. A fast flat or a descent in a group is such a stretch.
 */
export function airTerms(watts: number): PowerTerms {
  return {
    gravityAccel: 0,
    rolling: 0,
    aero: (watts * DRIVETRAIN_EFFICIENCY) / DEFAULT_BIKE_MODEL.cda,
  }
}

/**
 * A ride whose curve holds the given windows, by duration, and no others. A power-meter ride carries them
 * as measured watts; one without carries their terms, which the default bike model prices at the same watts
 * (it has no calibration, so the model stays the default).
 */
export function ride(
  id: string,
  day: number,
  source: 'measured' | 'virtual',
  windows: Readonly<Record<number, Window>>,
  over: Partial<ActivityDigest> = {},
): ActivityDigest {
  const curve: DigestCurvePoint[] = DURATIONS_S.map((durationS) => {
    const window = windows[durationS]
    return {
      durationS,
      value: window !== undefined && source === 'measured' ? window.watts : Number.NaN,
      startIndex: window === undefined ? -1 : 0,
      windowS: durationS,
      heartRate: window?.heartRate ?? null,
      terms: window !== undefined && source === 'virtual' ? airTerms(window.watts) : null,
    }
  })
  return {
    ...TEMPLATE,
    id,
    name: id,
    startMs: START_MS + day * DAY_MS,
    powerSource: source,
    hasHeartRate: Object.values(windows).some((w) => w.heartRate !== null),
    indoor: false,
    curve,
    hrBlocks: [],
    calibration: null,
    climbSections: [],
    flags: [],
    flagCounts: {},
    ...over,
  }
}
