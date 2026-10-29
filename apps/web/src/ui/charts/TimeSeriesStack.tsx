import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChartSize, Point } from './chartTypes'
import { PlotSurface } from './PlotSurface'
import { ReadoutContext } from './readoutContext'
import { TimeSeriesNote } from './TimeSeriesNote'
import { TimeSeriesReadout } from './TimeSeriesReadout'
import { TimeSeriesRows } from './TimeSeriesRows'
import { layoutOf } from './timeSeriesLayout'
import { NARROW_WIDTH } from './ticks'
import { STACK_MARGIN, stepCursor } from './timeSeriesModel'
import type { StackChannel, StackMark } from './timeSeriesTypes'
import type { CursorHead } from './timeSeriesTypes'
import { useSize } from './useSize'
import './ChartFrame.css'
import './TimeSeriesStack.css'

export interface TimeSeriesStackProps {
  title: string
  /** What the drawing says to a screen reader: each channel's range over the window. */
  description: string
  /** The window, in whole seconds. Every channel shares it. */
  startS: number
  endS: number
  /**
   * The channels for a plot this many px wide, with about this many ticks on each value axis. It is called
   * again only when it changes or the width does, so it should be stable between renders.
   */
  channels: (plotWidthPx: number, tickCount: number) => StackChannel[]
  /** Laps shaded behind the rows, every second one. */
  laps: readonly { startS: number; endS: number }[]
  marks: readonly StackMark[]
  /** The words at the head of the readout for a whole second. */
  head: (second: number) => CursorHead
  /** The text twin, shown under "View as table". */
  tables: ReactNode
  /** Told the cursor's second, so a neighbour can follow it. Null when it leaves. */
  onCursor?: (second: number | null) => void
}

/** The hint a keyboard reader hears with the plot's name. */
const HINT =
  'Left and right arrows move the cursor. Home and End jump to the ends of the selection.'

/**
 * Several channels over one time axis, each in its own row at true pixel proportions, under one crosshair
 * and one readout. It follows ChartFrame's conventions: the drawing is one image for a screen reader, the
 * plot surface is the focusable layer, and the values are repeated in a table.
 */
export function TimeSeriesStack({
  title,
  description,
  startS,
  endS,
  channels: build,
  laps,
  marks,
  head,
  tables,
  onCursor,
}: TimeSeriesStackProps) {
  const [stageRef, width] = useSize()
  const id = useId()
  const [readoutHost, setReadoutHost] = useState<HTMLElement | null>(null)
  const [cursor, setCursorState] = useState<number | null>(null)
  const setCursor = (second: number | null) => {
    setCursorState(second)
    onCursor?.(second)
  }
  const channels = useMemo(
    () =>
      build(
        Math.max(1, width - STACK_MARGIN.left - STACK_MARGIN.right),
        width < NARROW_WIDTH ? 2 : 3,
      ),
    [build, width],
  )
  const layout = layoutOf(width, channels)
  const size: ChartSize = {
    width,
    height: layout.height,
    plot: layout.plot,
    tooltipId: `${id}-readout`,
    hintId: `${id}-hint`,
    titleId: `${id}-title`,
  }
  const span = Math.max(1, endS - startS)
  // The window can move under a cursor, as when a lap is chosen, so it is kept inside it.
  const inside = cursor === null ? null : Math.max(startS, Math.min(cursor, endS - 1))
  const secondAt = (point: Point) =>
    Math.floor(
      startS + ((point.x - layout.plot.left) / (layout.plot.right - layout.plot.left)) * span,
    )

  return (
    <figure className="chart-frame ts-stack" aria-labelledby={size.titleId}>
      <figcaption id={size.titleId} className="chart-frame__title sr-only">
        {title}
      </figcaption>
      {/* The chart system's readout row, kept at every width; the readout draws into it. */}
      <div ref={setReadoutHost} className="chart-frame__readout ts-stack__readout" />
      <ReadoutContext.Provider value={readoutHost}>
        <TimeSeriesReadout id={size.tooltipId} channels={channels} cursor={inside} head={head} />
      </ReadoutContext.Provider>
      <div ref={stageRef} className="chart-frame__stage ts-stack__stage">
        <svg
          className="chart-frame__svg"
          width={width}
          height={layout.height}
          viewBox={`0 0 ${width} ${layout.height}`}
        >
          <g role="img" aria-label={description}>
            <TimeSeriesRows
              size={size}
              layout={layout}
              channels={channels}
              startS={startS}
              endS={endS}
              laps={laps}
              marks={marks}
              cursor={inside}
              hatchId={`${id}-hatch`}
            />
          </g>
          <PlotSurface
            size={size}
            onPoint={(point) =>
              setCursor(
                point === null ? null : Math.max(startS, Math.min(secondAt(point), endS - 1)),
              )
            }
            onKey={(key) => setCursor(stepCursor(inside, key, startS, endS))}
            onBlur={() => setCursor(null)}
          />
        </svg>
        <p id={size.hintId} className="sr-only">
          {HINT}
        </p>
      </div>
      <TimeSeriesNote channels={channels} marks={marks} startS={startS} endS={endS} />
      <details className="chart-frame__details">
        <summary>View as table</summary>
        {tables}
      </details>
    </figure>
  )
}
