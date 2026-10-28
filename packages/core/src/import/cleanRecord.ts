import type { RawRecord } from '../fit/resample'

const MIN_HEART_RATE = 25
const MAX_HEART_RATE = 250
const MAX_POWER_W = 3000

/** Drops impossible sensor values, preserving their count for the import report. */
export function cleanRecord(
  record: RawRecord,
  maxSpeed: number,
  drops: Map<RawRecord, number>,
): RawRecord {
  const counts = { dropped: 0 }
  const cleaned: RawRecord = {
    tMs: record.tMs,
    distance: record.distance,
    speed: keepWithin(record.speed, 0, maxSpeed, counts),
    altitude: record.altitude,
    heartRate: keepWithin(record.heartRate, MIN_HEART_RATE, MAX_HEART_RATE, counts),
    power: keepWithin(record.power, 0, MAX_POWER_W, counts),
    cadence: keepWithin(record.cadence, 0, 300, counts),
    temperature: keepWithin(record.temperature, -80, 80, counts),
  }
  if (counts.dropped > 0) drops.set(cleaned, counts.dropped)
  return cleaned
}

function keepWithin(
  value: number | undefined,
  min: number,
  max: number,
  counts: { dropped: number },
): number | undefined {
  if (value === undefined || (value >= min && value <= max)) return value
  counts.dropped++
  return undefined
}
