import type { RawRecord } from '../fit/resample'

const MIN_HEART_RATE = 25
const MAX_HEART_RATE = 250
const MAX_POWER_W = 3000

/** Below the Dead Sea shore and above Everest by margins that leave only absurd values out. */
const MIN_ALTITUDE_M = -1000
const MAX_ALTITUDE_M = 10_000
const MAX_CADENCE = 300
const MIN_TEMPERATURE_C = -80
const MAX_TEMPERATURE_C = 80

/**
 * Drops impossible sensor values, counting the speed, heart rate and power ones for the import
 * report. Altitude, cadence and temperature are dropped without being counted: the report's
 * figures stay what they were before those streams were read.
 */
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
    altitude: keepWithin(record.altitude, MIN_ALTITUDE_M, MAX_ALTITUDE_M),
    heartRate: keepWithin(record.heartRate, MIN_HEART_RATE, MAX_HEART_RATE, counts),
    power: keepWithin(record.power, 0, MAX_POWER_W, counts),
    cadence: keepWithin(record.cadence, 0, MAX_CADENCE),
    temperature: keepWithin(record.temperature, MIN_TEMPERATURE_C, MAX_TEMPERATURE_C),
  }
  if (counts.dropped > 0) drops.set(cleaned, counts.dropped)
  return cleaned
}

function keepWithin(
  value: number | undefined,
  min: number,
  max: number,
  counts?: { dropped: number },
): number | undefined {
  if (value === undefined || (value >= min && value <= max)) return value
  if (counts !== undefined) counts.dropped++
  return undefined
}
