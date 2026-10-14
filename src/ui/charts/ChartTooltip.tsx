import { useLayoutEffect, useRef } from 'react'
import type { SeriesKind, TooltipContent } from './chartTypes'
import './ChartTooltip.css'

export interface ChartTooltipProps {
  content: TooltipContent | null
  /** Area the tooltip must stay inside, in SVG pixels. */
  bounds: { width: number; height: number }
}

const OFFSET = 12

function keyClass(kind: SeriesKind | undefined): string {
  return kind ? `chart-tooltip__key chart-tooltip__key--${kind}` : 'chart-tooltip__key'
}

/** Hidden while there is no content. Stays in the DOM so that its updates are announced. */
export function ChartTooltip({ content, bounds }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Runs after every render: the box's own size is only known once it has content.
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null || content === null) return
    const { offsetWidth: w, offsetHeight: h } = el
    let left = content.x + OFFSET
    if (left + w > bounds.width) left = content.x - OFFSET - w
    el.style.left = `${Math.max(0, Math.min(left, bounds.width - w))}px`
    el.style.top = `${Math.max(0, Math.min(content.y - h / 2, bounds.height - h))}px`
  })

  return (
    <div ref={ref} role="status" hidden={content === null} className="chart-tooltip">
      {content === null ? null : (
        <>
          <div className="chart-tooltip__title">{content.title}</div>
          {content.rows.map((row) => (
            <div key={row.label} className="chart-tooltip__row">
              <span aria-hidden="true" className={keyClass(row.kind)} />
              <span className="chart-tooltip__value">{row.value}</span>{' '}
              <span className="chart-tooltip__label">{row.label}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
