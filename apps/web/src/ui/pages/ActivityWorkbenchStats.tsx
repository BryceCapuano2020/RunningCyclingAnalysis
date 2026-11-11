import type { ActivityTrace } from '@rca/core/workbench'
import type { UnitSystem } from '@rca/core/units'
import { formatDistance, formatRecordTime } from '@rca/core/units'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { StatFigure } from '../components/StatFigure'
import { useMediaQuery } from '../useMediaQuery'
import { movingAverageSpeed, selectionOf } from './workbenchData'
import { SPORT_READING } from './workbenchFormat'

/** The figures of the interval, as tiles: its times as a clock reads them, as the brush does, its distance and its average pace or speed. */
function SelectionTiles({
  trace,
  summary,
  units,
  heading,
}: {
  trace: ActivityTrace
  summary: ReturnType<typeof selectionOf>
  units: UnitSystem
  heading: ReactNode
}) {
  const paused = summary.recordedS - summary.movingS
  const unrecorded = summary.elapsedS - summary.recordedS
  const tiles: [label: string, value: string][] = [
    ['Elapsed time', formatRecordTime(summary.elapsedS)],
  ]
  // Moving time is shown only where it differs from elapsed time, and a gap or pause only where there is one.
  if (paused > 0 || unrecorded > 0) tiles.push(['Moving time', formatRecordTime(summary.movingS)])
  if (paused > 0) tiles.push(['Paused time', formatRecordTime(paused)])
  if (unrecorded > 0) tiles.push(['Unrecorded time', formatRecordTime(unrecorded)])
  if (summary.distanceM !== null) tiles.push(['Distance', formatDistance(summary.distanceM, units)])
  // The activity header's figure for the interval: the distance over the moving time, stops included.
  const average = movingAverageSpeed(summary)
  if (average !== null) {
    const reading = SPORT_READING[trace.sport]
    tiles.push([`Average ${reading.speedLabel.toLowerCase()}`, reading.speedText(average, units)])
  }
  return (
    <div className="activity-workbench__stats activity-workbench__stats--tiles">
      {heading}
      {/* The same label over number as the page's own figures, so the interval reads as a part of them. */}
      <dl className="activity-workbench__summary">
        {tiles.map(([label, value]) => (
          <StatFigure
            key={label}
            label={label}
            value={value}
            className="activity-page__stat"
            labelClassName="meta"
            valueClassName="stat-number"
          />
        ))}
      </dl>
    </div>
  )
}

/** From this width the timeline and the figures stand side by side, and the interval's tiles go to the column beside it. */
const WIDE_MIN_WIDTH_PX = 1100

/**
 * The chosen interval's times, distance and average, beside the timeline from 1100 px and under it below that. The
 * whole activity draws none: the page's own figures are of it already, and the readout row gives each measure's average.
 */
export function SelectionStats({
  trace,
  startS,
  endS,
  units,
  tilesHost,
}: {
  trace: ActivityTrace
  startS: number
  endS: number
  units: UnitSystem
  /** The column beside the timeline, where the tiles are drawn when the page is wide enough to have one. */
  tilesHost?: HTMLElement | null
}) {
  const wide = useMediaQuery(`(min-width: ${WIDE_MIN_WIDTH_PX}px)`)
  const whole = startS === 0 && endS >= Math.floor(trace.durationS)
  if (whole) return null
  const summary = selectionOf(trace, startS, endS)
  const inColumn = wide && tilesHost !== null && tilesHost !== undefined
  const tiles = (
    <SelectionTiles
      trace={trace}
      summary={summary}
      units={units}
      heading={inColumn ? <h2>Selected interval</h2> : <h3>Selected interval</h3>}
    />
  )
  return inColumn ? createPortal(tiles, tilesHost) : tiles
}
