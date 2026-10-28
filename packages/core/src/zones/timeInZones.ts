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

/** Absorbs the rounding of a zone edge that lands on a bin edge, such as 0.3 m/s, or on a whole number. */
export const EDGE_EPSILON = 1e-9

/**
 * The measures whose readings are whole numbers: a heart rate in beats and a power in watts. A bin of
 * one of them holds the whole numbers from its lower edge up to, not including, the next bin's (one
 * beat, or five watts), and nothing between them.
 */
const WHOLE_READINGS: Record<ZoneMeasure, boolean> = { power: true, heartRate: true, pace: false }

/**
 * The seconds of a distribution in each zone, lowest effort first, so one number a zone. Every second
 * is kept: the zones add up to the distribution's total.
 *
 * A reading is in the zone it is at or above the floor of and below the ceiling of, which is how the
 * activity page places a recorded second (`traceTimeInZones`) and how Profile writes a range ("138 to
 * 187 W"). So a heart rate or a power, which are whole numbers, is placed by its whole numbers: a bin
 * of 110 to 114 W cut at 110.55 W puts 110 W in the zone below and 111 to 114 W in the zone above, with
 * the bin's seconds shared evenly over its five watts. A bin of one beat is never split. Speed is not
 * a whole number, so a bin of it that straddles an edge is split in proportion to the width each side,
 * as if its seconds were spread evenly across it, which is under 0.05 m/s of error at each edge.
 */
export function secondsByZone(
  zones: readonly Zone[],
  measure: ZoneMeasure,
  distribution: DigestDistribution,
): number[] {
  const width = DISTRIBUTION_BINS[DISTRIBUTION_OF[measure]].width
  const whole = WHOLE_READINGS[measure]
  // Where a zone ends on the axis the bins are laid on: a whole number's zone ends at the first whole
  // number at or above the ceiling.
  const edgeOf = (zone: Zone): number =>
    zone.high === null ? Infinity : whole ? Math.ceil(zone.high - EDGE_EPSILON) : zone.high
  const edges = zones.map(edgeOf)
  const out = new Array<number>(zones.length).fill(0)
  let k = 0
  distribution.counts.forEach((seconds, i) => {
    if (seconds <= 0) return
    const lower = (distribution.offset + i) * width
    const upper = lower + width
    // Bins rise, so the first zone that can hold this bin never falls behind the last one's.
    while (k < zones.length - 1 && edges[k]! <= lower + EDGE_EPSILON) k++
    let from = lower
    for (let j = k; j < zones.length; j++) {
      const edge = edges[j]!
      if (upper <= edge + EDGE_EPSILON) {
        // A whole bin is added as it is, so rounding in the widths never takes a second from it.
        out[j]! += from === lower ? seconds : seconds * ((upper - from) / width)
        break
      }
      out[j]! += seconds * ((edge - from) / width)
      from = edge
    }
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
