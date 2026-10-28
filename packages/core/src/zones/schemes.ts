import type { Sport } from '../types'
import type { MeasurementKind } from '../athlete/measurements'

/** What a zone set is measured in: watts, heart rate or running speed (shown as pace). */
export type ZoneMeasure = 'power' | 'heartRate' | 'pace'

/**
 * A published way of cutting a measure into zones. `cuts` are the boundaries between neighbouring
 * zones, lowest effort first, as multiples of the reference value: threshold power, maximum heart
 * rate or threshold speed. n cuts make n + 1 zones. The sources are in docs/research/zones.md.
 */
export interface ZoneScheme {
  /** The names of the zones, lowest effort first. */
  names: readonly string[]
  cuts: readonly number[]
  /** Where the scheme is published, for the line under a zone table. */
  citation: string
}

/**
 * Ride power from threshold power. Allen and Coggan's seven levels cut at 55, 75, 90, 105, 120 and
 * 150% of functional threshold power. Their table writes whole percents (56-75, 76-90, ...); here
 * each zone starts where the one below ends, so every watt falls in one zone.
 */
const POWER: ZoneScheme = {
  names: [
    'Active recovery',
    'Endurance',
    'Tempo',
    'Lactate threshold',
    'VO2max',
    'Anaerobic capacity',
    'Neuromuscular power',
  ],
  cuts: [0.55, 0.75, 0.9, 1.05, 1.2, 1.5],
  citation: "Allen and Coggan, Training and Racing with a Power Meter (Coggan's seven levels)",
}

/**
 * Heart rate from maximum heart rate. The five zones of 50-60, 60-70, 70-80, 80-90 and 90-100% of
 * maximum (Edwards 1993; the names are Polar's). The first zone also takes readings under 50%, so
 * every reading falls in one zone.
 */
const HEART_RATE: ZoneScheme = {
  names: ['Very light', 'Light', 'Moderate', 'Hard', 'Maximum'],
  cuts: [0.6, 0.7, 0.8, 0.9],
  citation: 'Edwards, The Heart Rate Monitor Book (five zones of maximum heart rate)',
}

/**
 * Run pace from threshold pace. Friel's running pace zones are written as a percent of threshold
 * pace, where more than 100% is slower: zone 1 is slower than 129%, zone 2 is 114-129%, zone 3 is
 * 106-114%, zone 4 is 99-106% and zone 5 is faster than 99%. The cuts are speeds, so each is 100
 * over the percent. Friel splits zone 5 into three by effort length; they are one zone here.
 */
const PACE: ZoneScheme = {
  names: ['Recovery', 'Aerobic', 'Tempo', 'Sub-threshold', 'Above threshold'],
  cuts: [100 / 129, 100 / 114, 100 / 106, 100 / 99],
  citation: "Friel, The Triathlete's Training Bible (running pace zones from threshold pace)",
}

export const ZONE_SCHEMES: Record<ZoneMeasure, ZoneScheme> = {
  power: POWER,
  heartRate: HEART_RATE,
  pace: PACE,
}

/** The measures each sport has zones for. */
export const ZONE_MEASURES: Record<Sport, readonly ZoneMeasure[]> = {
  run: ['heartRate', 'pace'],
  ride: ['heartRate', 'power'],
}

/** The dated setting that overrides each measure's reference. */
export const ZONE_OVERRIDE: Record<ZoneMeasure, MeasurementKind> = {
  power: 'thresholdPower',
  heartRate: 'maxHeartRate',
  pace: 'thresholdPace',
}

/**
 * The measures read as whole numbers, a heart rate in beats and a power in watts. Their zones are cut on
 * whole-number edges (`zonesFor`), so a zone holds whole numbers and no reading sits between two zones.
 */
export const WHOLE_NUMBER_MEASURES: Record<ZoneMeasure, boolean> = {
  power: true,
  heartRate: true,
  pace: false,
}
