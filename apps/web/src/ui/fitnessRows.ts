import type { Sport } from '@rca/core/types'
import { PACE_UNIT, formatPaceValue, formatWatts } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from './components/property'
import type { FitnessView } from './fitnessModel'
import { FITNESS_WORDS } from './fitnessWords'
import { SPORT_FORMAT } from './sports'

/** A level's range as its two ends in the sport's own unit, the faster pace first for a run. */
const RANGE: Record<Sport, (low: number, high: number, units: UnitSystem) => string> = {
  run: (low, high, units) =>
    `${formatPaceValue(high, units)}–${formatPaceValue(low, units)} ${PACE_UNIT[units]}`,
  ride: (low, high) => `${formatWatts(low)}–${formatWatts(high)} W`,
}

/** The ending every "what a trend needs" sentence carries; the row says it as "Needs ...". */
const TREND_TAIL = / to see a trend\.$/

/** What a trend needs as a row's value: "Needs 2 more earlier rides". Any other sentence stands as it is. */
function trendValue(needs: string): string {
  return TREND_TAIL.test(needs)
    ? `Needs ${needs.charAt(0).toLowerCase()}${needs.slice(1).replace(TREND_TAIL, '')}`
    : needs
}

/** The month a break's level was taken in, "October", with its year when it is not the year of the status. */
function monthOf(ms: number, asOfMs: number): string {
  const month = new Date(ms).toLocaleString('en', { month: 'long', timeZone: 'UTC' })
  const year = new Date(ms).getUTCFullYear()
  return year === new Date(asOfMs).getUTCFullYear() ? month : `${month} ${year}`
}

/**
 * A fitness row's Details as a detail panel's rows (docs/design/system.md, Detail panels): the level at its heart rate, its
 * range where the status has one, the other changes, the steady activities it rests on, what a trend needs, how old the
 * status is, whether warm days were adjusted for, and when a change was new. The measure is on Method.
 */
export function fitnessRows(
  view: FitnessView,
  units: UnitSystem,
  { level: showLevel, warm }: { level: boolean; warm: boolean },
): Property[] {
  const { status, sport } = view
  const words = FITNESS_WORDS[sport]
  const level = showLevel ? (status.now ?? status.level?.value ?? null) : null
  const steady = status.evidence?.recent.runs ?? status.level?.runs ?? null
  return [
    ...(level === null
      ? []
      : [
          {
            label: `${words.output} at ${status.referenceHr} bpm`,
            value: SPORT_FORMAT[sport].formatted(level, units),
          },
        ]),
    ...(status.shortfall?.kind === 'break' && status.level !== undefined
      ? [{ label: 'Level taken in', value: monthOf(status.level.toMs, status.asOfMs) }]
      : []),
    ...(!showLevel || status.level === undefined
      ? []
      : [{ label: 'Range', value: RANGE[sport](status.level.low, status.level.high, units) }]),
    ...view.changes.slice(1).map((change) => ({ label: 'Also', value: change.replace(/\.$/, '') })),
    ...(steady === null
      ? []
      : [
          {
            label: words.steadyPlural.replace(/^./, (c) => c.toUpperCase()),
            value: String(steady),
          },
        ]),
    ...(view.needs === '' ? [] : [{ label: 'Trend', value: trendValue(view.needs) }]),
    ...(view.ago === null ? [] : [{ label: 'Latest activity', value: view.ago }]),
    ...(warm ? [{ label: 'Warm days', value: 'Adjusted for' }] : []),
    ...(view.fresh === null ? [] : [{ label: 'New since', value: view.fresh }]),
  ]
}
