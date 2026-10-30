import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { GradeProfile } from '../gradeProfile'
import { formatGrade } from '../gradeFormat'
import { gradeRangeText } from '../grades'
import { SPORT_LABEL } from '../sports'
import { lineObstacles, markerObstacle } from './annotations'
import type { Annotation } from './annotations'
import { smallWidth } from './annotationTypes'
import type { Box } from './chartBoxes'
import type { ChartSize } from './chartTypes'
import { DEFAULT_HEIGHT } from './ChartFrame'
import { bandBoxes } from './directLabelFit'
import { drawnSports, profileLayout } from './gradeProfileLayout'
import type { ProfileLayout, ProfileRow } from './gradeProfileLayout'
import { isPhoneWidth, plotBoxOf } from './plotBox'
import { rootFontPx } from './rootFont'

/** The room an end label needs beyond its text: 10 px from the plot and 4 px from the chart's edge. */
const END_LABEL_MARGIN_PX = 14

/**
 * From this chart width, px, a grade chart whose 20 minute labels cannot sit clear of its lines names each sport
 * where its line ends instead, in a gutter at the right. Narrower, the phone readout and the key carry the values
 * and an unplaceable label is left out.
 */
export const END_LABEL_MIN_WIDTH_PX = 600

/** The thickness, px, of a line and the radius of a marker as obstacles to an end label. */
const LINE_PX = 8
const MARKER_R = 7

/** One sport's end label: its name and last grade, and under it an estimate's range. */
interface EndText {
  sport: 'run' | 'ride'
  text: string
  sub: string | undefined
}

/** The last grade each sport has, as its end label says it. */
function endTexts(profile: GradeProfile): EndText[] {
  return drawnSports(profile).flatMap((sport) => {
    const last = profile[sport].at(-1)
    if (last === undefined) return []
    const { range } = last.grade
    return [
      {
        sport,
        text: `${SPORT_LABEL[sport]} ${formatGrade(last.grade.centre.grade)}`,
        sub: range === null ? undefined : `range ${gradeRangeText(range)}`,
      },
    ]
  })
}

/** How many sports are graded at the 20 minute duration, so how many direct labels the chart wants. */
function wantedLabels(rows: readonly ProfileRow[]): number {
  const row = rows.find((each) => each.durationS === HEADLINE_DURATION_S)
  return row === undefined ? 0 : Object.keys(row.grades).length
}

/**
 * Whether this chart width takes end labels: it is wide enough, and the 20 minute labels, laid out with no
 * gutter, cannot all be placed. Decided at the chart's default margins, so the gutter that holds the end labels
 * cannot change the answer that asked for it.
 */
export function usesEndLabels(rows: readonly ProfileRow[], profile: GradeProfile, width: number) {
  if (width < END_LABEL_MIN_WIDTH_PX || wantedLabels(rows) === 0) return false
  const height = DEFAULT_HEIGHT
  const plot = plotBoxOf(width, height, undefined, undefined, isPhoneWidth(width))
  const size: ChartSize = { width, height, plot, tooltipId: '', hintId: '', titleId: '' }
  const layout = profileLayout(rows, profile, size)
  return layout !== null && layout.labels.length < wantedLabels(rows)
}

/** The plot's right margin: the widest end label and its gap, where end labels are used; the default otherwise. */
export function endGutter(
  rows: readonly ProfileRow[],
  profile: GradeProfile,
): (width: number) => number | undefined {
  const texts = endTexts(profile).flatMap((each) => [each.text, each.sub ?? ''])
  return (width) => {
    if (!usesEndLabels(rows, profile, width)) return undefined
    const rootPx = rootFontPx()
    return (
      Math.ceil(Math.max(...texts.map((text) => smallWidth(text, rootPx)))) + END_LABEL_MARGIN_PX
    )
  }
}

/** The grade chart's drawing: its layout, and the end labels with what they keep off where end labels are used. */
export interface ProfileView {
  layout: ProfileLayout
  ends: Annotation[]
  obstacles: Box[]
}

/** The layout at this size; where end labels are used the direct labels are replaced by them. */
export function profileView(
  rows: readonly ProfileRow[],
  profile: GradeProfile,
  size: ChartSize,
): ProfileView | null {
  const layout = profileLayout(rows, profile, size)
  if (layout === null) return null
  if (!usesEndLabels(rows, profile, size.width)) return { layout, ends: [], obstacles: [] }
  const ends = endTexts(profile).flatMap((each): Annotation[] => {
    const marks = layout.marks.find((mark) => mark.sport === each.sport)
    const at = marks?.centre.findLast((point) => point !== null)
    if (at == null) return []
    return [
      {
        kind: 'end',
        id: `end-${each.sport}`,
        tone: each.sport,
        optional: true,
        at,
        text: each.text,
        ...(each.sub === undefined ? {} : { sub: each.sub }),
      },
    ]
  })
  const markers = layout.marks.flatMap((mark) =>
    mark.centre.flatMap((point) => (point === null ? [] : [markerObstacle(point, MARKER_R)])),
  )
  const lines = layout.marks.flatMap((mark) => lineObstacles(mark.centre, LINE_PX))
  const bands = layout.marks
    .filter((mark) => mark.ranged)
    .flatMap((mark) => bandBoxes(layout.xs, mark.high, mark.low))
  return { layout: { ...layout, labels: [] }, ends, obstacles: [...lines, ...markers, ...bands] }
}
