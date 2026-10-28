import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { afterLabel, fadePercent } from '../lateInEffort'
import type { LateCell, LateGroup } from '../lateInEffort'
import { effortLabel } from '../records'
import { SPORT_FORMAT } from '../sports'
import type { ChartTableData } from './chartTypes'
import { formatNative } from './sportAxis'

/** A late best against the best overall, in words for a table: "6% below", "2% above", or "Within 1%". */
export function againstOverall(retention: number): string {
  const percent = fadePercent(retention)
  if (percent >= 1) return `${percent}% below`
  if (percent <= -1) return `${-percent}% above`
  return 'Within 1%'
}

/** The chart's name: both durations, overall and late, in the sport's own unit. */
export function durabilityTitle(sport: Sport, units: UnitSystem): string {
  return `Your best efforts overall and late, ${SPORT_FORMAT[sport].titleUnit(units)}`
}

/** What a screen reader hears of the drawing: every figure in it, one sentence for each duration. */
export function durabilityDescription(
  sport: Sport,
  groups: readonly LateGroup[],
  units: UnitSystem,
): string {
  return groups
    .map((group) => {
      const late = group.cells
        .map(
          (cell) =>
            `after ${afterLabel(cell.afterS)} ${formatNative(sport, cell.value, units)}, ${againstOverall(cell.retention)}`,
        )
        .join('; ')
      return `Best ${effortLabel(group.durationS)}: overall ${formatNative(sport, group.overall.value, units)}; ${late}.`
    })
    .join(' ')
}

/** The same figures as a table: a row for each overall best and each late one that is shown. */
export function durabilityTable(
  sport: Sport,
  groups: readonly LateGroup[],
  units: UnitSystem,
): ChartTableData {
  const row = (label: string, value: number, against: string, activities: number): string[] => [
    label,
    formatNative(sport, value, units),
    against,
    String(activities),
  ]
  return {
    columns: ['Effort', SPORT_FORMAT[sport].nativeLabel, 'Against overall', 'Activities'],
    rows: groups.flatMap((group) => [
      row(
        `${effortLabel(group.durationS)}, overall`,
        group.overall.value,
        '—',
        group.overall.supporters,
      ),
      ...group.cells.map((cell: LateCell) =>
        row(
          `${effortLabel(group.durationS)}, after ${afterLabel(cell.afterS)}`,
          cell.value,
          againstOverall(cell.retention),
          cell.supporters,
        ),
      ),
    ]),
    caption:
      'Best output by duration, overall and starting after time on the move. A late figure shows only with enough activities behind it.',
    phoneHidden: [3],
  }
}
