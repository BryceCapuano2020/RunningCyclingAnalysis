import type { DistributionMeasure } from '../constants'
import { DISTRIBUTION_BINS } from '../constants'
import { EDGE_EPSILON } from '../math'
import type { ActivityDigest, DigestDistribution } from '../types'
import { ZONE_MEASURES } from './schemes'
import type { ZoneMeasure } from './schemes'
import type { Zone, ZoneSet, ZoneSource } from './zones'

/*
 * Time in zones for one activity. A digest keeps its seconds in bins of one heart-rate beat, five watts
 * or 0.05 m/s (DISTRIBUTION_BINS), and the zones in effect on its date cut those bins. The period view
 * (periodTime.ts) adds these per-activity answers up.
 */

/** The digest distribution each zone measure reads: a pace's zones are cut in speed. */
export const DISTRIBUTION_OF: Record<ZoneMeasure, DistributionMeasure> = {
  power: 'power',
  heartRate: 'heartRate',
  pace: 'speed',
}

/**
 * The seconds of a distribution in each zone, lowest effort first, so one number a zone. Every second is
 * kept: the zones add up to the distribution's total.
 *
 * A reading is in the zone it is at or above the floor of and below the ceiling of, as `traceTimeInZones`
 * places a recorded second. `zonesFor` cuts every zone on the edges of the measure's bins (beats, steps of 5 W,
 * and steps of 0.05 m/s), so a bin sits wholly in one zone, the one its floor is in, and its seconds go
 * there. Zones not cut that way would have a bin's seconds credited to its lower end.
 */
export function secondsByZone(
  zones: readonly Zone[],
  measure: ZoneMeasure,
  distribution: DigestDistribution,
): number[] {
  const width = DISTRIBUTION_BINS[DISTRIBUTION_OF[measure]].width
  const out = new Array<number>(zones.length).fill(0)
  let k = 0
  distribution.counts.forEach((seconds, i) => {
    if (seconds <= 0) return
    const floor = (distribution.offset + i) * width
    // Bins rise, so the first zone that can hold this bin never falls behind the last one's.
    while (k < zones.length - 1 && zones[k]!.high! <= floor + EDGE_EPSILON) k++
    out[k]! += seconds
  })
  return out
}

/** What one activity gives one measure's time in zones. */
export type ActivityMeasureTime =
  /** Its seconds in each zone, and whether the zones were entered or estimated, and from what reference. */
  | { kind: 'counted'; source: ZoneSource; reference: number; seconds: number[] }
  /** The digest keeps no distribution of the measure: an older digest, no heart rate, or no power meter. */
  | { kind: 'noData' }
  /** It has a heart rate, but the analysis set it aside as one a working sensor would not give. */
  | { kind: 'setAside' }
  /** It has the data, but no zones were in effect on its date: no reference was entered or estimated. */
  | { kind: 'noZones' }

/**
 * An activity's time in each zone of its sport's measures, by the zones in effect on its date. A
 * measure with data but without zones is `noZones`, and a measure without data is `noData` whatever
 * the zones, so the two are told apart. `heartRateSetAside` leaves heart rate out, as the analysis does
 * for a sensor that read implausibly.
 */
export function activityTimeInZones(
  digest: Pick<ActivityDigest, 'sport' | 'distributions'>,
  sets: readonly ZoneSet[],
  heartRateSetAside = false,
): Partial<Record<ZoneMeasure, ActivityMeasureTime>> {
  const out: Partial<Record<ZoneMeasure, ActivityMeasureTime>> = {}
  for (const measure of ZONE_MEASURES[digest.sport]) {
    const distribution = digest.distributions?.[DISTRIBUTION_OF[measure]]
    if (distribution === undefined) {
      out[measure] = { kind: 'noData' }
      continue
    }
    if (measure === 'heartRate' && heartRateSetAside) {
      out[measure] = { kind: 'setAside' }
      continue
    }
    const set = sets.find((each) => each.sport === digest.sport && each.measure === measure)
    out[measure] =
      set === undefined
        ? { kind: 'noZones' }
        : {
            kind: 'counted',
            source: set.source,
            reference: set.reference,
            seconds: secondsByZone(set.zones, measure, distribution),
          }
  }
  return out
}
