import { useLayoutEffect, useRef } from 'react'
import type { TooltipContent, TooltipRow } from './chartTypes'
import { NARROW_WIDTH } from './ticks'
import './ChartTooltip.css'

export interface ChartTooltipProps {
  content: TooltipContent | null
  /**
   * Area the tooltip must stay inside, in SVG pixels. plotTop is the top of the plot, where a tooltip
   * sits on a narrow chart rather than on its point.
   */
  bounds: { width: number; height: number; plotTop?: number }
  /** Id the plot surface points at with aria-describedby. */
  id: string
}

const OFFSET = 12

/** A dashed key is an estimate or the previous period, so it names its series only when it has one. */
function keyClass({ kind, swatch }: TooltipRow): string {
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

  // Runs after every render: the box's own size is only known once it has content.
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null || content === null) return
    const { offsetWidth: w, offsetHeight: h } = el
    let left = content.x + OFFSET
    if (left + w > bounds.width) left = content.x - OFFSET - w
    el.style.left = `${Math.max(0, Math.min(left, bounds.width - w))}px`
    // A narrow chart puts the tooltip at the top of its plot, so it does not cover the point it names.
    const top = bounds.width < NARROW_WIDTH ? (bounds.plotTop ?? 0) : content.y - h / 2
    el.style.top = `${Math.max(0, Math.min(top, bounds.height - h))}px`
  })

  return (
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
}
