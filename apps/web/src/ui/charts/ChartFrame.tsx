import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartLegend } from './ChartLegend'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartTable } from './ChartTable'
import type { ChartSize, ChartTableData } from './chartTypes'
import { PHONE_CHART_HEIGHT, isPhoneWidth, plotBoxOf } from './plotBox'
import { ReadoutContext } from './readoutContext'
import { useSize } from './useSize'
import './ChartFrame.css'

/** The one number a chart is about, with what it is and its unit: "20 min best", "6:37", "/mi". */
export interface ChartFocal {
  value: string
  unit?: string
  label?: string
}

export interface ChartFrameProps {
  title: string
  description: string
  /** One sentence under the title that says what the chart shows, such as its finding. */
  lede?: string
  /**
   * The finding as a sentence, set large under the title: the chart's headline. The title stays the chart's
   * name (and its accessible name), set small above it; the takeaway describes the figure.
   */
  takeaway?: string
  /** The chart's one figure at display size, beside the takeaway. */
  focal?: ChartFocal
  /** Height of the whole SVG, axis labels included. A phone gets PHONE_CHART_HEIGHT when this is left out. */
  height?: number
  /**
   * Shown above the plot, in a row that is kept whenever the chart has a legend, so a key appearing
   * does not move the plot. An empty legend keeps the row, and then keyNote can take it. A chart that
   * keeps its key's row while the key is empty passes an empty array rather than undefined.
   */
  legend?: ChartLegendEntry[]
  /** Muted text in the key row, where a key would be, such as why a previous period has no line. */
  keyNote?: string
  table: ChartTableData
  /** A short table shown above `table` in the text view, for totals that are not per point. */
  summary?: ChartTableData
  /**
   * What a phone's readout row says while no point is selected: the chart's latest or headline value, such as
   * "Latest: 64% run, 58% ride, week of 25 Oct". The row is one line then, and shows a point's full reading over it
   * only while one is selected. Left out, it says how to select a point.
   */
  idleReadout?: string
  /** Replaces the plot with a short message when set. */
  empty?: string
  /** Muted text under the plot, which shows even while the chart is empty, to say why it is. */
  note?: string
  /** Right margin of the plot, as a function of width. Default 16 px (12 on a phone); undefined keeps the default. */
  plotRightMargin?: (width: number) => number | undefined
  /** Bottom margin of the plot, which holds the x-axis title. A chart with no x title passes PLOT_BOTTOM_WITHOUT_X_TITLE. */
  plotBottomMargin?: number
  /** The static drawing: gridlines, axes and marks. Exposed to screen readers as one image. */
  children: (size: ChartSize) => ReactNode
  /** Interactive layer, drawn above the drawing: the focusable plot surface. */
  surface?: (size: ChartSize) => ReactNode
  /** HTML laid over the plot, such as a tooltip. */
  overlay?: (size: ChartSize) => ReactNode
}

/**
 * Whether a key is shown: two entries, or one line or dashed entry, which names a single series that the
 * plot would otherwise leave unnamed. A single dot or diamond is left out, as a point's shape needs no key.
 */
function showLegend(legend: ChartLegendEntry[] | undefined): boolean {
  if (legend === undefined) return false
  return (
    legend.length >= 2 ||
    legend.some((entry) => entry.swatch === 'dashed' || entry.swatch === 'line')
  )
}

const DEFAULT_HEIGHT = 320
/** Shown on a chart that can be read by keyboard, over the plot's top corner. The CSS reveals it while the plot has focus. */
const READING_HINT = 'Left and right arrows read values'
/** What a phone's readout row says with no point selected and no idleReadout from the chart. */
const SELECT_HINT = 'Select a point to read its value'
/** How far the hint sits below the top of the chart, in px: in the margin above the plot, which holds no data. */
const HINT_INSET = 2

/** The focal figure: its label small above, the value at display size, its unit smaller beside it. */
function ChartFocalFigure({ value, unit, label }: ChartFocal) {
  return (
    <p className="chart-frame__focal">
      {label ? <span className="chart-frame__focal-label">{label}</span> : null}
      <span className="chart-frame__focal-value">
        {value}
        {unit ? <span className="chart-frame__focal-unit">{unit}</span> : null}
      </span>
    </p>
  )
}

export function ChartFrame({
  title,
  description,
  lede,
  takeaway,
  focal,
  height: givenHeight,
  legend,
  table,
  summary,
  empty,
  keyNote,
  idleReadout,
  note,
  plotRightMargin,
  plotBottomMargin,
  children,
  surface,
  overlay,
}: ChartFrameProps) {
  const [stageRef, width] = useSize()
  const id = useId()
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  const takeawayId = `${id}-takeaway`
  const [readout, setReadout] = useState<HTMLElement | null>(null)
  const phone = isPhoneWidth(width)
  const height = givenHeight ?? (phone ? PHONE_CHART_HEIGHT : DEFAULT_HEIGHT)
  const rightMargin = plotRightMargin?.(width)
  // One object for a given size, so what is computed from it stays valid while a point is read.
  const size: ChartSize = useMemo(
    () => ({
      width,
      height,
      plot: plotBoxOf(width, height, rightMargin, plotBottomMargin, phone),
      tooltipId: `${id}-tooltip`,
      hintId,
      titleId,
    }),
    [width, height, rightMargin, plotBottomMargin, phone, id, hintId, titleId],
  )

  return (
    <figure
      className="chart-frame"
      aria-labelledby={titleId}
      aria-describedby={takeaway ? takeawayId : undefined}
    >
      <figcaption
        id={titleId}
        className={
          takeaway ? 'chart-frame__title chart-frame__title--eyebrow' : 'chart-frame__title'
        }
      >
        {title}
      </figcaption>
      {takeaway || focal ? (
        <div className="chart-frame__headline">
          {takeaway ? (
            <p id={takeawayId} className="chart-frame__takeaway">
              {takeaway}
            </p>
          ) : null}
          {focal ? <ChartFocalFigure {...focal} /> : null}
        </div>
      ) : null}
      {lede ? <p className="chart-frame__lede">{lede}</p> : null}
      {/* The row is kept whenever the chart may have a key, so a key appearing does not move the plot. */}
      {legend === undefined ? null : (
        <div className="chart-frame__legend">
          {showLegend(legend) ? (
            <ChartLegend entries={legend} />
          ) : keyNote ? (
            <p className="chart-frame__note">{keyNote}</p>
          ) : null}
        </div>
      )}
      {/* A phone's scrub readout: one line at rest, and a point's full reading over it, so the plot never moves. */}
      {phone && surface && !empty ? (
        <div
          ref={setReadout}
          className="chart-frame__readout chart-frame__readout--compact"
          data-testid="chart-readout"
          data-idle={idleReadout ?? SELECT_HINT}
        />
      ) : null}
      <ReadoutContext.Provider value={phone ? readout : null}>
        <div ref={stageRef} className="chart-frame__stage">
          {empty ? (
            <p className="chart-frame__empty">{empty}</p>
          ) : (
            <>
              <svg
                className="chart-frame__svg"
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
              >
                <g role="img" aria-label={description}>
                  {children(size)}
                </g>
                {surface?.(size)}
              </svg>
              <div className="chart-frame__overlay">
                {overlay?.(size)}
                {surface ? (
                  <p
                    id={hintId}
                    className="chart-frame__hint"
                    style={{ top: HINT_INSET, right: size.width - size.plot.right }}
                  >
                    {READING_HINT}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </ReadoutContext.Provider>
      {note ? <p className="chart-frame__note">{note}</p> : null}
      {!empty ? (
        <details className="chart-frame__details">
          <summary>View as table</summary>
          {summary ? <ChartTable {...summary} /> : null}
          <ChartTable {...table} />
        </details>
      ) : null}
    </figure>
  )
}
