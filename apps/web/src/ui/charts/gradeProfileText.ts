import type { Sport } from '@rca/core/types'
import { formatGrade } from '../gradeFormat'
import type { GradeProfile } from '../gradeProfile'
import { gradeLevelText, gradeRangeText } from '../grades'
import type { SportGrade } from '../grades'
import { effortLabel } from '../records'
import { SPORT_LABEL } from '../sports'
import type { ChartLegendEntry } from './ChartLegend'
import type { ChartTableData, TooltipContent, TooltipRow } from './chartTypes'
import { drawnSports, isRanged } from './gradeProfileLayout'
import type { ProfileRow } from './gradeProfileLayout'

export const GRADE_PROFILE_TITLE = 'Grade by duration'
export const GRADE_PROFILE_EMPTY =
  'Add runs and rides of 3 minutes or more to compare them by duration.'

/** Said under the plot: what each point is, and what the shading around an estimate shows. */
export const GRADE_PROFILE_NOTE =
  'Each point is your best effort of that length. Shading is the 90% range of an estimated grade.'

/** What the chart shows, for a screen reader: the sports on one scale, and how each is drawn. */
export function descriptionOf(profile: GradeProfile): string {
  const sports = drawnSports(profile)
  const how = sports.map((sport) =>
    isRanged(profile, sport)
      ? `${SPORT_LABEL[sport]} is estimated through its running equivalent, drawn with rings and a band for its range.`
      : `${SPORT_LABEL[sport]} is as recorded.`,
  )
  const names = sports.map((sport) => SPORT_LABEL[sport]).join(' and ')
  return `${names} age grades of the best effort at each duration, on one scale. Duration is on a log scale. ${how.join(' ')}`
}

/** A sport's name where it is graded: an estimate says so. */
function nameOf(sport: Sport, ranged: boolean): string {
  return ranged ? `${SPORT_LABEL[sport]}, estimated` : SPORT_LABEL[sport]
}

/** The key: each drawn sport, a line for a recorded grade and a ring for an estimate. */
export function legendOf(profile: GradeProfile): ChartLegendEntry[] {
  return drawnSports(profile).map((sport) => {
    const ranged = isRanged(profile, sport)
    return {
      label: ranged ? nameOf(sport, true) : `${SPORT_LABEL[sport]}, as recorded`,
      kind: sport,
      swatch: ranged ? 'ring' : 'line',
    }
  })
}

/** A grade as the table writes it: the whole percent, and an estimate's range in brackets. */
function gradeCell(grade: SportGrade): string {
  const value = formatGrade(grade.centre.grade)
  return grade.range === null ? value : `${value} (${gradeRangeText(grade.range)})`
}

export function tableOf(rows: readonly ProfileRow[], profile: GradeProfile): ChartTableData {
  const sports = drawnSports(profile)
  return {
    caption:
      'Each grade is the best effort of that length, at the age on the day of that effort. An estimated grade shows its range in brackets.',
    columns: [
      'Duration',
      ...sports.map(
        (sport) => `${SPORT_LABEL[sport]} grade${isRanged(profile, sport) ? ', estimated' : ''}`,
      ),
    ],
    rows: rows.map((row) => [
      effortLabel(row.durationS),
      ...sports.map((sport) => {
        const grade = row.grades[sport]
        return grade === undefined ? '—' : gradeCell(grade)
      }),
    ]),
  }
}

/** A duration's tooltip: each drawn sport's grade and level, or a dash and why there is none. */
export function tooltipFor(
  row: ProfileRow,
  x: number,
  y: number,
  profile: GradeProfile,
): TooltipContent {
  const rows = drawnSports(profile).map((sport): TooltipRow => {
    const grade = row.grades[sport]
    const label = nameOf(sport, isRanged(profile, sport))
    if (grade === undefined) {
      const none = `No ${SPORT_LABEL[sport].toLowerCase()} grade at ${effortLabel(row.durationS)}`
      return { kind: sport, label, value: '—', note: none }
    }
    const level = gradeLevelText(grade)
    return {
      kind: sport,
      label,
      value: formatGrade(grade.centre.grade),
      note: grade.range === null ? level : `${level}, range ${gradeRangeText(grade.range)}`,
    }
  })
  return { x, y, title: effortLabel(row.durationS), rows }
}
