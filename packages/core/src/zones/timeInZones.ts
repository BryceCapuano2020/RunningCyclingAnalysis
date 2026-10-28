import type { DistributionMeasure } from '../constants'
import { DISTRIBUTION_BINS } from '../constants'
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

/** Absorbs the rounding of a zone edge that lands on a bin edge, such as 0.3 m/s. */
const EDGE_EPSILON = 1e-9

/**
 * The seconds of a distribution in each zone, lowest effort first, so one number a zone.
 *
 * A bin straddling a zone edge is split in proportion to how much of its width lies each side, as if
 * its seconds were spread evenly across it. Giving the whole bin to the zone that holds its centre
 * would move up to half a bin of time across an edge, and make a zone's time jump as an edge crosses
 * a centre. Either way every second is kept: the zones add up to the distribution's total. The error
 * of a split is under one bin's seconds at each edge, which is 1 bpm, 5 W or 0.05 m/s of moving time.
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
    const lower = (distribution.offset + i) * width
    const upper = lower + width
    // Bins rise, so the first zone that can hold this bin never falls behind the last one's.
    while (k < zones.length - 1 && zones[k]!.high! <= lower + EDGE_EPSILON) k++
    let from = lower
    for (let j = k; j < zones.length; j++) {
      const high = zones[j]!.high
      if (high === null || upper <= high + EDGE_EPSILON) {
        // A whole bin is added as it is, so rounding in the widths never takes a second from it.
        out[j]! += from === lower ? seconds : seconds * ((upper - from) / width)
        break
      }
      out[j]! += seconds * ((high - from) / width)
      from = high
    }
  })
  return out
}

/** What one activity gives one measure's time in zones. */
export type ActivityMeasureTime =
  /** Its seconds in each zone, and whether the zones were entered or estimated. */
  | { kind: 'counted'; source: ZoneSource; seconds: number[] }
  /** The digest keeps no distribution of the measure: older digests, no heart rate, no power meter, or a heart rate set aside. */
  | { kind: 'noData' }
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
    if (distribution === undefined || (measure === 'heartRate' && heartRateSetAside)) {
      out[measure] = { kind: 'noData' }
      continue
    }
    const set = sets.find((each) => each.sport === digest.sport && each.measure === measure)
    out[measure] =
      set === undefined
        ? { kind: 'noZones' }
        : {
            kind: 'counted',
            source: set.source,
            seconds: secondsByZone(set.zones, measure, distribution),
          }
  }
  return out
}
