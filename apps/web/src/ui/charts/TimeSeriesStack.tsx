import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChartSize, Point } from './chartTypes'
import type { NavigationKey } from './PlotSurface'
import { PlotSurface } from './PlotSurface'
import { ReadoutContext } from './readoutContext'
import { TimeSeriesCursor } from './TimeSeriesCursor'
import { TimeSeriesNote } from './TimeSeriesNote'
import { TimeSeriesReadout } from './TimeSeriesReadout'
import { TimeSeriesRows } from './TimeSeriesRows'
import { layoutOf } from './timeSeriesLayout'
import { NARROW_WIDTH } from './ticks'
import { STACK_MARGIN, stepCursor } from './timeSeriesModel'
import type { StackChannel, StackMark } from './timeSeriesTypes'
import type { CursorHead } from './timeSeriesTypes'
import { useSize } from './useSize'
import { useStackSelection } from './useStackSelection'
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
  /** Zooms to a stretch the pointer dragged across, in whole seconds. Absent: the plot does not select. */
  onSelect?: (startS: number, endS: number) => void
  /** Whether the window is a part of the activity, so there is something to reset. */
  zoomed?: boolean
  onReset?: () => void
  /** Drawn directly under the plot, before its note: the overview. */
  below?: ReactNode
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
  onSelect,
  zoomed = false,
  onReset,
  below,
}: TimeSeriesStackProps) {
  const [stageRef, width] = useSize()
  const id = useId()
  const [readoutHost, setReadoutHost] = useState<HTMLElement | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  // Whether the plot has keyboard focus, from when it gains it: the readout is read out while it does, so the
  // first step of the arrow is heard too, and not while a pointer sweeps or the averages change.
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const pressed = useRef(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const channels = useMemo(
    () =>
      build(
        Math.max(1, width - STACK_MARGIN.left - STACK_MARGIN.right),
        width < NARROW_WIDTH ? 2 : 3,
      ),
    [build, width],
  )
  const layout = useMemo(() => layoutOf(width, channels), [width, channels])
  const size: ChartSize = useMemo(
    () => ({
      width,
      height: layout.height,
      plot: layout.plot,
      tooltipId: `${id}-readout`,
      hintId: `${id}-hint`,
      titleId: `${id}-title`,
    }),
    [width, layout, id],
  )
  // The window can move under a cursor, as when a lap is chosen, so it is kept inside it.
  const inside = cursor === null ? null : Math.max(startS, Math.min(cursor, endS - 1))
  const { left, right } = layout.plot
  const selection = useStackSelection({
    svg: svgRef,
    width,
    plot: layout.plot,
    startS,
    endS,
    onSelect,
  })
  const { selecting } = selection
  const onPoint = useCallback(
    (point: Point | null) => {
      // While a range is dragged out the cursor stays where it was, and the highlight is what moves.
      if (selecting()) return
      if (point === null) return setCursor(null)
      const second = Math.floor(
        startS + ((point.x - left) / (right - left)) * Math.max(1, endS - startS),
      )
      setCursor(Math.max(startS, Math.min(second, endS - 1)))
    },
    [startS, endS, left, right, selecting],
  )
  const onKey = useCallback(
    (key: NavigationKey) =>
      setCursor((now) =>
        stepCursor(
          now === null ? null : Math.max(startS, Math.min(now, endS - 1)),
          key,
          startS,
          endS,
        ),
      ),
    [startS, endS],
  )
  const onBlur = useCallback(() => {
    setCursor(null)
    setKeyboardFocus(false)
    pressed.current = false
  }, [])
  // Focus that a press on the plot gives is not keyboard focus, which every other focus is. A press comes
  // first, so it is remembered until the focus it causes has been seen.
  const onPress = useCallback(() => {
    pressed.current = true
  }, [])
  const onFocus = useCallback(() => {
    setKeyboardFocus(!pressed.current)
    pressed.current = false
  }, [])

  return (
    <figure className="chart-frame ts-stack" aria-labelledby={size.titleId}>
      <figcaption id={size.titleId} className="chart-frame__title sr-only">
        {title}
      </figcaption>
      {/* The chart system's readout row, kept at every width; the readout draws into it. */}
      <div ref={setReadoutHost} className="chart-frame__readout ts-stack__readout" />
      <ReadoutContext.Provider value={readoutHost}>
        <TimeSeriesReadout
          id={size.tooltipId}
          channels={channels}
          cursor={inside}
          announce={keyboardFocus}
          head={head}
        />
      </ReadoutContext.Provider>
      {onSelect !== undefined && (
        <div className="ts-stack__tools">
          <p className="ts-stack__hint">
            <span className="ts-stack__hint--fine">Drag to zoom</span>
            <span className="ts-stack__hint--coarse">Hold, then drag, to zoom</span>
          </p>
          {zoomed && onReset !== undefined && (
            <button type="button" className="ts-stack__reset" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
      )}
      <div ref={stageRef} className="chart-frame__stage ts-stack__stage">
        <svg
          ref={svgRef}
          className="chart-frame__svg"
          width={width}
          height={layout.height}
          viewBox={`0 0 ${width} ${layout.height}`}
          onFocus={onFocus}
          onPointerDownCapture={onPress}
          onPointerDown={selection.handlers.onPointerDown}
          onPointerMove={selection.handlers.onPointerMove}
          onPointerUp={selection.handlers.onPointerUp}
          onPointerCancel={selection.handlers.onPointerCancel}
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
              hatchId={`${id}-hatch`}
            />
            {inside !== null && (
              <TimeSeriesCursor
                size={size}
                layout={layout}
                channels={channels}
                startS={startS}
                endS={endS}
                cursor={inside}
              />
            )}
          </g>
          {selection.range !== null && (
            <rect
              className="ts-stack__selection"
              aria-hidden="true"
              x={
                left +
                ((selection.range.from - startS) / Math.max(1, endS - startS)) * (right - left)
              }
              y={layout.plot.top}
              width={Math.max(
                2,
                ((selection.range.to - selection.range.from) / Math.max(1, endS - startS)) *
                  (right - left),
              )}
              height={layout.plot.bottom - layout.plot.top}
            />
          )}
          <PlotSurface size={size} onPoint={onPoint} onKey={onKey} onBlur={onBlur} />
        </svg>
        <p id={size.hintId} className="sr-only">
          {HINT}
        </p>
      </div>
      {below}
      <div className="ts-stack__foot">
        <TimeSeriesNote channels={channels} marks={marks} startS={startS} endS={endS} />
        <details className="chart-frame__details">
          <summary>View as table</summary>
          {tables}
        </details>
      </div>
    </figure>
  )
}
