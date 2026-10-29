import { useContext, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TooltipContent, TooltipRow } from './chartTypes'
import { ReadoutContext } from './readoutContext'
import { NARROW_WIDTH } from './ticks'
import './ChartTooltip.css'

export interface ChartTooltipProps {
  content: TooltipContent | null
  /**
   * Area the tooltip must stay inside, in SVG pixels. Given plotTop, the top of the plot, a tooltip stays
   * below it so it never covers the y-axis caption, and on a narrow chart sits there rather than on its point.
   */
  bounds: { width: number; height: number; plotTop?: number }
  /** Id the plot surface points at with aria-describedby. */
  id: string
}

const OFFSET = 12

/** A dashed key is an estimate, so it names its series only when it has one; the previous period's is a grey line. */
function keyClass({ kind, swatch }: TooltipRow): string {
  if (swatch === 'previous') return 'chart-tooltip__key chart-tooltip__key--previous'
  if (swatch === 'dashed') {
    const series = kind === 'run' || kind === 'ride' ? ` chart-tooltip__key--dashed-${kind}` : ''
    return `chart-tooltip__key chart-tooltip__key--dashed${series}`
  }
  return kind ? `chart-tooltip__key chart-tooltip__key--${kind}` : 'chart-tooltip__key'
}

/**
 * Empty while there is no content. It stays in the DOM and is never hidden, so a screen reader
 * announces each change to it; the CSS gives an empty box no size.
 */
export function ChartTooltip({ content, bounds, id }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const readout = useContext(ReadoutContext)

  // Runs after every render: the box's own size is only known once it has content.
  useLayoutEffect(() => {
    const el = ref.current
    // In a phone's readout row the box sits in the flow, so it has no position to set.
    if (el === null || content === null || readout !== null) return
    const { offsetWidth: w, offsetHeight: h } = el
    let left = content.x + OFFSET
    if (left + w > bounds.width) left = content.x - OFFSET - w
    el.style.left = `${Math.max(0, Math.min(left, bounds.width - w))}px`
    // A narrow chart with a plot top puts the tooltip there, so it does not cover the point it names.
    const plotTop = bounds.plotTop
    const top = plotTop !== undefined && bounds.width < NARROW_WIDTH ? plotTop : content.y - h / 2
    // Never above the plot, where the margin holds the y-axis caption; then never past the bottom; and never off the top.
    const floored = Math.max(plotTop ?? 0, top)
    el.style.top = `${Math.max(0, Math.min(floored, bounds.height - h))}px`
  })

  const tooltip = (
    <div ref={ref} id={id} role="status" className="chart-tooltip">
      {content === null ? null : (
        <>
          <div className="chart-tooltip__title">{content.title}</div>
          {content.rows.map((row) => (
            <div key={row.label} className="chart-tooltip__row">
              <span aria-hidden="true" className={keyClass(row)} />
              <span className="chart-tooltip__value">{row.value}</span>{' '}
              <span className="chart-tooltip__label">{row.label}</span>
              {row.note ? <div className="chart-tooltip__note">{row.note}</div> : null}
            </div>
          ))}
        </>
      )}
    </div>
  )
  // On a phone the values are read in the fixed row above the plot, which a finger does not cover.
  return readout === null ? tooltip : createPortal(tooltip, readout)
}
