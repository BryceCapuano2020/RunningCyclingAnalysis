import type { Zone, ZoneMeasure, ZoneSet, ZoneSource } from '@rca/core/zones'
import { formatClock, formatPaceValue, formatPower, PACE_UNIT, paceSeconds } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { SPORT_LABEL, SPORT_PLURAL } from './sports'

/** What each measure is called in a table's title. */
const MEASURE_TITLE: Record<ZoneMeasure, string> = {
  power: 'power',
  heartRate: 'heart rate',
  pace: 'pace',
}

/** Where a zone set's reference came from, in the words under its title. */
const SOURCE_TEXT: Record<ZoneSource, (set: ZoneSet) => string> = {
  entered: () => 'You entered',
  estimated: (set) =>
    `From your ${set.estimatedFrom.map((sport) => SPORT_PLURAL[sport]).join(' and ')}`,
}

/**
 * Whether a measure's zones in the app's own estimate need the athlete's weight: a ride's threshold is
 * found as energy per kilogram and becomes watts only at a body weight.
 */
export const NEEDS_WEIGHT: Record<ZoneMeasure, boolean> = {
  power: true,
  heartRate: false,
  pace: false,
}

export function sourceText(set: ZoneSet): string {
  return SOURCE_TEXT[set.source](set)
}

/** How a zone's edges are written in each measure's unit, from the edges as numbers. */
interface Edges {
  low: number
  high: number | null
}

type RangeText = (edges: Edges, units: UnitSystem) => string

/**
 * Watts and beats are whole numbers, and a zone holds the whole numbers from its floor up to the one
 * before the next zone's floor, so no number is in two zones. The first zone has no floor to name and
 * the last no ceiling.
 */
function wholeRange(unit: string): RangeText {
  return ({ low, high }) => {
    if (high === null) return `${Math.round(low)} ${unit} or more`
    if (low === 0) return `Under ${Math.round(high)} ${unit}`
    return `${Math.round(low)}–${Math.round(high) - 1} ${unit}`
  }
}

/**
 * Speeds shown as paces, which run the other way: a higher speed is a shorter pace. Paces are whole
 * seconds. A zone holds its slow edge and not its fast one, so a pace is in one zone only: the fast
 * edge belongs to the zone above.
 */
const paceRange: RangeText = ({ low, high }, units) => {
  const unit = PACE_UNIT[units]
  const seconds = (speed: number) => Math.round(paceSeconds(speed, units))
  if (high === null) return `${formatClock(seconds(low))} ${unit} or faster`
  if (low === 0) return `Slower than ${formatClock(seconds(high))} ${unit}`
  return `${formatClock(seconds(high) + 1)}–${formatClock(seconds(low))} ${unit}`
}

const RANGE_TEXT: Record<ZoneMeasure, RangeText> = {
  power: wholeRange('W'),
  heartRate: wholeRange('bpm'),
  pace: paceRange,
}

export function zoneRange(measure: ZoneMeasure, zone: Zone, units: UnitSystem): string {
  return RANGE_TEXT[measure](zone, units)
}

/** The reference a zone set was cut from, such as "250 W", "188 bpm" or "5:30 /km". */
const REFERENCE_TEXT: Record<ZoneMeasure, (reference: number, units: UnitSystem) => string> = {
  power: (watts) => formatPower(watts),
  heartRate: (bpm) => `${Math.round(bpm)} bpm`,
  pace: (speed, units) => `${formatPaceValue(speed, units)} ${PACE_UNIT[units]}`,
}

export interface ZoneTable {
  /** "Ride power zones". */
  title: string
  /** Where the reference came from and what it was: "From your rides: threshold power 250 W". */
  detail: string
  citation: string
  columns: string[]
  rows: string[][]
}

const REFERENCE_NAME: Record<ZoneMeasure, string> = {
  power: 'threshold power',
  heartRate: 'max heart rate',
  pace: 'threshold pace',
}

/** A zone set as a table: one row a zone, with its number, name and range. */
export function zoneTable(set: ZoneSet, units: UnitSystem): ZoneTable {
  return {
    title: `${SPORT_LABEL[set.sport]} ${MEASURE_TITLE[set.measure]} zones`,
    detail: `${sourceText(set)}: ${REFERENCE_NAME[set.measure]} ${REFERENCE_TEXT[set.measure](set.reference, units)}`,
    citation: set.citation,
    columns: ['Zone', 'Name', 'Range'],
    rows: set.zones.map((zone) => [
      String(zone.level),
      zone.name,
      zoneRange(set.measure, zone, units),
    ]),
  }
}
