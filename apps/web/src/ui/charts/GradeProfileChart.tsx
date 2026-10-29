import { useMemo, useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { GradeProfile } from '../gradeProfile'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { SportLabels } from './GradeProfileLabels'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { ChartAnnotations } from './ChartAnnotations'
import { endGutter, profileView } from './gradeProfileEnds'
import { DURATION_AXIS_TITLE, rowsOf } from './gradeProfileLayout'
import type { SportMarks } from './gradeProfileLayout'
import {
  GRADE_PROFILE_EMPTY,
  GRADE_PROFILE_NOTE,
  GRADE_PROFILE_TITLE,
  descriptionOf,
  legendOf,
  tableOf,
  tooltipFor,
} from './gradeProfileText'
import { gappedBandPath, linePath } from './paths'
import { axisFontSize } from './ticks'
import './ChartSeries.css'

export interface GradeProfileChartProps {
  profile: GradeProfile
  /** The sentence the chart supports, set under its title; left out where the page says it above the chart. */
  finding?: string
}

/**
 * Each sport's age grade at every duration from 3 min to 3 h, on one scale, titled by its finding. A recorded
 * grade is a solid line with dots. An estimate, as a ride's is, is a line with a ring at each duration and a
 * band for its range, drawn under the run. The 20 minute grade, the one the balance is taken at, is the larger
 * mark, and is labelled directly.
 */
export function GradeProfileChart({ profile, finding }: GradeProfileChartProps) {
  const rows = useMemo(() => rowsOf(profile), [profile])
  // The gutter for the end labels is worked out once for each width, not on every render.
  const gutter = useMemo(() => cachedByWidth(endGutter(rows, profile)), [rows, profile])
  const hasData = rows.length >= 2
  const [active, setActive] = useState<number | null>(null)
  const viewOf = sizedOnce((size: ChartSize) => profileView(rows, profile, size))
  const layoutOf = (size: ChartSize) => viewOf(size)?.layout ?? null
  const anyRange = rows.some((row) =>
    Object.values(row.grades).some((grade) => grade.range !== null),
  )

  return (
    <ChartFrame
      title={finding ?? GRADE_PROFILE_TITLE}
      description={descriptionOf(profile)}
      legend={hasData ? legendOf(profile) : undefined}
      note={hasData && anyRange ? GRADE_PROFILE_NOTE : undefined}
      table={tableOf(rows, profile)}
      empty={hasData ? undefined : GRADE_PROFILE_EMPTY}
      plotRightMargin={gutter}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => {
              const row = rows[index]
              return row ? tooltipFor(row, x, y, profile) : null
            },
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const view = viewOf(size)
        if (view === null) return null
        const m = view.layout
        const { marker, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const radiusAt = (index: number) =>
          index === active || rows[index]?.durationS === HEADLINE_DURATION_S ? activeR : marker
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={size.plot}
              title={DURATION_AXIS_TITLE}
              fontSize={axisFontSize(size.width)}
            />
            <ChartYAxis
              ticks={m.yTicks}
              plot={size.plot}
              title="Age grade"
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={size.plot} /> : null}
            {m.marks
              .filter((marks) => marks.ranged)
              .map((marks) => (
                <path
                  key={marks.sport}
                  data-testid="profile-band"
                  data-sport={marks.sport}
                  className={`chart-series__band--${marks.sport}`}
                  d={gappedBandPath(marks.high, marks.low)}
                />
              ))}
            {/* The run is the recorded line, so it is drawn last, over the estimate and its band. */}
            {[...m.marks].reverse().map((marks) => (
              <SportLayer key={marks.sport} marks={marks} radiusAt={radiusAt} />
            ))}
            <SportLabels labels={m.labels} />
            <ChartAnnotations annotations={view.ends} size={size} obstacles={view.obstacles} />
          </>
        )
      }}
    </ChartFrame>
  )
}

interface SportLayerProps {
  marks: SportMarks
  radiusAt: (index: number) => number
}

/** One sport's line and its mark at each duration: a dot for a recorded grade, a ring for an estimate. */
function SportLayer({ marks, radiusAt }: SportLayerProps) {
  const { sport, ranged } = marks
  return (
    <>
      <path
        data-testid="profile-line"
        data-sport={sport}
        className={`chart-series__line chart-series__line--${sport}`}
        d={linePath(marks.centre)}
      />
      {marks.centre.map((point, index) =>
        point === null ? null : (
          <circle
            key={point.x}
            data-testid={ranged ? 'profile-ring' : 'profile-marker'}
            data-sport={sport}
            className={
              ranged
                ? `chart-series__ring--${sport}`
                : `chart-series__marker chart-series__marker--${sport}`
            }
            cx={point.x}
            cy={point.y}
            r={radiusAt(index)}
          />
        ),
      )}
    </>
  )
}

/** A margin function that remembers its answer for each width. */
function cachedByWidth(margin: (width: number) => number | undefined) {
  const known = new Map<number, number | undefined>()
  return (width: number): number | undefined => {
    if (!known.has(width)) known.set(width, margin(width))
    return known.get(width)
  }
}
