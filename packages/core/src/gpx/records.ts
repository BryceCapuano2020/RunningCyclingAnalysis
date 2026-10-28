import type { RawRecord } from '../fit/resample'
import { trackFromPoints } from '../import/trackpoints'
import type { LatLon } from '../import/trackpoints'

export interface GpxPoint {
  tMs: number
  position: LatLon | undefined
  altitude: number | undefined
  heartRate: number | undefined
  power: number | undefined
  /**
   * Garmin TrackPointExtension v1 has no cadence-unit field; keep `<cad>` unchanged and never apply
   * FIT scaling. https://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd
   */
  cadence: number | undefined
  temperature: number | undefined
}

/** Turns positioned trackpoints into distance and speed, retaining their measured sensor values. */
export function recordsOf(
  points: GpxPoint[],
  maxSpeedMs: number,
): { records: RawRecord[]; rejected: number } {
  const track = trackFromPoints(points, maxSpeedMs)
  const records: RawRecord[] = []
  let nearest = 0
  for (const point of points) {
    const record: RawRecord = {
      tMs: point.tMs,
      altitude: point.altitude,
      heartRate: point.heartRate,
      power: point.power,
      cadence: point.cadence,
      temperature: point.temperature,
    }
    if (point.position !== undefined && track.tMs.length > 0) {
      while (
        nearest + 1 < track.tMs.length &&
        Math.abs(track.tMs[nearest + 1]! - point.tMs) < Math.abs(track.tMs[nearest]! - point.tMs)
      ) {
        nearest++
      }
      record.distance = track.distanceM[nearest]!
      record.speed = track.speedMs[nearest]!
    }
    records.push(record)
  }
  return { records, rejected: track.rejected }
}
