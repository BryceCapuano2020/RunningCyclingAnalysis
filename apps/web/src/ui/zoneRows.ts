import type { Sport } from '@rca/core/types'
import type { Zone, ZoneMeasure, ZoneSet, ZoneSource } from '@rca/core/zones'
import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import { formatClock, formatPaceValue, formatPower, PACE_UNIT, paceSeconds } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatMonth } from './format/date'
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
  estimated: (set) => {
    const from = `From your ${set.estimatedFrom.map((sport) => SPORT_PLURAL[sport]).join(' and ')}`
    // A pace or power from an older fit, because the half year before the date holds no hard, even effort to fit.
    return set.asOfMs === null ? from : `${from} up to ${formatMonth(set.asOfMs, true)}`
  },
}

/** The sport whose maximum a sport's other-sport reference is worked out from, as a phrase. */
const OTHER_MAX: Record<Sport, string> = {
  run: 'your cycling maximum',
  ride: `${RIDE_MAX_OFFSET_BPM} bpm below your running maximum`,
}

/**
 * Where an estimated max heart rate comes from, as the start of a sentence: its own sport's reference is the
 * highest value several separate days reached, since the date the stretch it was taken over begins; the other
 * sport's is worked out from the first. Null for an entered reference, or any measure but heart rate.
 */
export function maxHeartRateBasis(set: ZoneSet): string | null {
  if (set.measure !== 'heartRate' || set.source !== 'estimated') return null
  const bpm = `${Math.round(set.reference)} bpm`
  const from = set.maxHeartRateFrom
  if (from === null) return `${bpm}, ${OTHER_MAX[set.sport]}`
  const since = formatMonth(from.sinceMs, true)
  if (from.days <= 1) return `${bpm}, the highest you reached, on a single day since ${since}`
  return `${bpm}, the highest you reached on ${from.days} separate days since ${since}`
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
  /** Whether the figure is an estimated max heart rate, which the athlete can be asked to confirm or correct. */
  askable: boolean
  /** Where the reference came from and what it was: "From your rides: threshold power 250 W". */
  detail: string
  citation: string
  columns: string[]
  rows: string[][]
}

/**
 * What an estimated threshold is said to be beside its figure. The zones hold the threshold they had until a window's
 * fit moves by more than its own error and stays there, so it can differ by a second or a watt from the newest fit
 * the sport pages give; the words say which one this is. A heart rate is a maximum, not a fitted threshold.
 */
const HELD_NOTE: Record<ZoneMeasure, string> = {
  power: ', held until a real change',
  pace: ', held until a real change',
  heartRate: '',
}

const REFERENCE_NAME: Record<ZoneMeasure, string> = {
  power: 'threshold power',
  heartRate: 'max heart rate',
  pace: 'threshold pace',
}

/** A zone set as a table: one row a zone, with its number, name and range. */
export function zoneTable(set: ZoneSet, units: UnitSystem): ZoneTable {
  const basis = maxHeartRateBasis(set)
  return {
    title: `${SPORT_LABEL[set.sport]} ${MEASURE_TITLE[set.measure]} zones`,
    askable: basis !== null,
    // An estimated max heart rate says where it came from in place of the figure alone.
    detail:
      basis !== null
        ? `Max heart rate: ${basis}`
        : `${sourceText(set)}: ${REFERENCE_NAME[set.measure]} ${REFERENCE_TEXT[set.measure](set.reference, units)}${set.source === 'estimated' ? HELD_NOTE[set.measure] : ''}`,
    citation: set.citation,
    columns: ['Zone', 'Name', 'Range'],
    rows: set.zones.map((zone) => [
      String(zone.level),
      zone.name,
      zoneRange(set.measure, zone, units),
    ]),
  }
}
