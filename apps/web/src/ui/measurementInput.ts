import { MEASUREMENT_LIMITS } from '@rca/contract'
import { MEASUREMENT_KINDS, MEASUREMENT_SPORTS } from '@rca/core/athlete'
import type { Measurement, MeasurementKind } from '@rca/core/athlete'
import type { Sport } from '@rca/core/types'
import { METRES_PER_KM, METRES_PER_MILE, formatPace, formatPaceValue } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT } from '@rca/core/units'
import { displayWeight, readWeight, weightUnit } from './athlete'
import { SPORT_ACTIVITY } from './sports'

/** The name of each kind of dated setting, as the form and the list say it. */
const KIND_LABEL: Record<MeasurementKind, string> = {
  massKg: 'Body weight',
  maxHeartRate: 'Max heart rate',
  thresholdPower: 'Threshold power',
  thresholdPace: 'Threshold pace',
}

/** The setting for a kind and sport, as a name: "Max heart rate (run)", or "Body weight" for no sport. */
export function settingLabel(kind: MeasurementKind, sport: Sport | undefined): string {
  return sport === undefined ? KIND_LABEL[kind] : `${KIND_LABEL[kind]} (${SPORT_ACTIVITY[sport]})`
}

/** One setting the form can add: a kind, and the sport it is for when the kind has one. */
export interface SettingChoice {
  id: string
  kind: MeasurementKind
  sport?: Sport
  label: string
}

/** Every setting the form offers, in the order the list shows them. */
export const SETTING_CHOICES: SettingChoice[] = MEASUREMENT_KINDS.flatMap(
  (kind): SettingChoice[] => {
    const sports = MEASUREMENT_SPORTS[kind]
    if (sports.length === 0) return [{ id: kind, kind, label: settingLabel(kind, undefined) }]
    return sports.map((sport) => ({
      id: `${kind}.${sport}`,
      kind,
      sport,
      label: settingLabel(kind, sport),
    }))
  },
)

/** The position of a setting in SETTING_CHOICES, so a list can group by setting. */
export function settingOrder(entry: Pick<Measurement, 'kind' | 'sport'>): number {
  return SETTING_CHOICES.findIndex(
    (choice) => choice.kind === entry.kind && choice.sport === entry.sport,
  )
}

/** The unit written beside the field a setting is typed in. */
export function settingUnit(kind: MeasurementKind, units: UnitSystem): string {
  return {
    massKg: weightUnit(units),
    maxHeartRate: 'bpm',
    thresholdPower: 'W',
    thresholdPace: PACE_UNIT[units],
  }[kind]
}

const WHOLE_NUMBER = /^\d{2,3}$/
const PACE_TEXT = /^(\d{1,2}):([0-5]\d)$/

export type SettingReading = { value: number } | { error: string }

type Reader = (text: string, units: UnitSystem) => SettingReading

function readWhole(kind: MeasurementKind): Reader {
  const { min, max } = MEASUREMENT_LIMITS[kind]
  return (text) => {
    const trimmed = text.trim()
    const value = Number(trimmed)
    if (WHOLE_NUMBER.test(trimmed) && value >= min && value <= max) return { value }
    return { error: `Enter a whole number from ${min} to ${max}` }
  }
}

/** A pace such as 5:30 per kilometre or per mile, as a speed in m/s. */
const readPace: Reader = (text, units) => {
  const { min, max } = MEASUREMENT_LIMITS.thresholdPace
  const match = PACE_TEXT.exec(text.trim())
  const metres = units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM
  const value = match === null ? Number.NaN : metres / (Number(match[1]) * 60 + Number(match[2]))
  if (value >= min && value <= max) return { value }
  const range = `${formatPaceValue(max, units)} to ${formatPaceValue(min, units)} ${PACE_UNIT[units]}`
  return { error: `Enter a pace from ${range}, such as 5:30` }
}

const READERS: Record<MeasurementKind, Reader> = {
  massKg: (text, units) => {
    const read = readWeight(text, 'body', units)
    return 'error' in read ? read : { value: read.kg }
  },
  maxHeartRate: readWhole('maxHeartRate'),
  thresholdPower: readWhole('thresholdPower'),
  thresholdPace: readPace,
}

/** The value typed for a setting, in its stored unit, or why the text cannot be used. */
export function readSetting(
  kind: MeasurementKind,
  text: string,
  units: UnitSystem,
): SettingReading {
  return READERS[kind](text, units)
}

/** A value as the list shows it: "82.5 kg", "188 bpm", "250 W" or "5:30 /km". */
export function displaySetting(kind: MeasurementKind, value: number, units: UnitSystem): string {
  if (kind === 'thresholdPace') return formatPace(value, units)
  const text = kind === 'massKg' ? displayWeight(value, units) : String(Math.round(value))
  return `${text} ${settingUnit(kind, units)}`
}
