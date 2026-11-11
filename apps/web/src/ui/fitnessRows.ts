import { fitnessFigures } from '@rca/core/fitness'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from './components/property'
import type { FitnessView } from './fitnessModel'
import { FITNESS_WORDS } from './fitnessWords'
import { formatSpan } from './format/date'

/** A row's label starts with a capital: "Steady runs". */
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The ending every "what a trend needs" sentence carries; the row says it as "Needs ...". */
const TREND_TAIL = / to see a trend\.$/

/** What a trend needs as a row's value: "Needs 2 more earlier rides". Any other sentence stands as it is. */
function trendValue(needs: string): string {
  return TREND_TAIL.test(needs)
    ? `Needs ${needs.charAt(0).toLowerCase()}${needs.slice(1).replace(TREND_TAIL, '')}`
    : needs
}

/**
 * A fitness row's Details as a detail panel's rows (docs/design/system.md, Detail panels): the level at its heart rate, its
 * range where the status has one, the steady activities it rests on, what a trend needs, how old the
 * status is and whether warm days were adjusted for. The measure is on Method.
 */
export function fitnessRows(
  view: FitnessView,
  units: UnitSystem,
  { level: showLevel, warm }: { level: boolean; warm: boolean },
): Property[] {
  const { status, sport } = view
  const words = FITNESS_WORDS[sport]
  // The figures are core's, the ones its lines print.
  const figures = fitnessFigures(status, units)
  const recent = status.evidence?.recent
  return [
    ...(!showLevel || figures.level === null
      ? []
      : [{ label: `${words.output} at ${status.referenceHr} bpm`, value: figures.level }]),
    ...(figures.month === null ? [] : [{ label: 'Level taken in', value: figures.month }]),
    ...(!showLevel || figures.range === null
      ? []
      : [{ label: 'Range', value: `${figures.range} ${figures.unit}` }]),
    ...(figures.steady === null
      ? []
      : [{ label: cap(words.steadyPlural), value: String(figures.steady) }]),
    ...(recent === undefined || status.state === 'not-enough-evidence'
      ? []
      : [{ label: 'Between', value: formatSpan(recent.fromMs, recent.toMs) }]),
    ...(view.needs === '' ? [] : [{ label: 'Trend', value: trendValue(view.needs) }]),
    ...(view.ago === null ? [] : [{ label: 'Latest activity', value: view.ago }]),
    ...(warm ? [{ label: 'Warm days', value: 'Adjusted for' }] : []),
  ]
}
