import { useCallback, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { areaPath, linePath } from './timeSeriesModel'
import type { SeriesColumns } from './timeSeriesModel'
import { STACK_MARGIN } from './timeSeriesModel'
import type { ChannelColour } from './timeSeriesTypes'
import { clamp, draggedRange } from './timeBrushModel'
import type { BrushRange, Drag, Part } from './timeBrushModel'
import { useSize } from './useSize'
import './TimeBrush.css'

/** One channel drawn small over the whole activity, so the window sits against something. */
export interface BrushOverview {
  columns: SeriesColumns
  low: number
  high: number
  colour: ChannelColour
}

export interface TimeBrushProps {
  /** The activity's whole seconds. */
  max: number
  selection: BrushRange
  onChange: (selection: BrushRange) => void
  overview: BrushOverview | null
  /** A time as it is spoken, such as 12 min 30 s. */
  spokenTime: (seconds: number) => string
}

const HEIGHT = 40
/** A drag that has not moved this far is a click, which changes nothing. */
const DRAG_THRESHOLD_PX = 3
/** Presses of an arrow that cross the whole activity. */
const PRESSES_ACROSS = 200

/**
 * An overview of the whole activity with a window over it. Dragging an end, the window or the empty track
 * sets the selection; each end is also a slider, so the keyboard sets it by the second with named values.
 */
export function TimeBrush({ max, selection, onChange, overview, spokenTime }: TimeBrushProps) {
  const [lane, width] = useSize()
  const laneRef = useRef<HTMLDivElement | null>(null)
  // One callback for the life of the brush: a new one each render would be called again, with null then the node.
  const laneNode = useCallback(
    (node: HTMLDivElement | null) => {
      laneRef.current = node
      lane(node)
    },
    [lane],
  )
  const drag = useRef<Drag | null>(null)
  const { startS, endS } = selection
  const x = (seconds: number) => (seconds / max) * width
  const secondAt = (event: PointerEvent) => {
    const box = laneRef.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return 0
    return ((event.clientX - box.left) / box.width) * max
  }

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-part]')
    const part = (target?.dataset.part as Part | undefined) ?? 'new'
    drag.current = {
      part,
      anchorS: secondAt(event),
      origin: selection,
      x: event.clientX,
      moved: part !== 'new',
    }
    // The pointer stays with the track when it leaves it, so a drag ends only when the finger or button does.
    if (typeof event.currentTarget.setPointerCapture === 'function')
      event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (current === null) return
    if (!current.moved && Math.abs(event.clientX - current.x) < DRAG_THRESHOLD_PX) return
    current.moved = true
    onChange(draggedRange(current.part, current.origin, current.anchorS, secondAt(event), max))
  }
  const end = () => {
    drag.current = null
  }

  const step = Math.max(1, Math.round(max / PRESSES_ACROSS))
  const keyed = (part: 'start' | 'end') => (event: KeyboardEvent<HTMLDivElement>) => {
    const amount = event.shiftKey ? step * 10 : step
    const edge = part === 'start' ? startS : endS
    let next: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = edge + amount
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = edge - amount
    else if (event.key === 'PageUp') next = edge + step * 10
    else if (event.key === 'PageDown') next = edge - step * 10
    else if (event.key === 'Home') next = part === 'start' ? 0 : startS + 1
    else if (event.key === 'End') next = part === 'start' ? endS - 1 : max
    else return
    event.preventDefault()
    onChange(draggedRange(part, selection, edge, next, max))
  }

  const path = overview === null || width === 0 ? null : overviewPaths(overview, width, max)
  return (
    <div
      className="ts-brush"
      style={{ paddingInline: `${STACK_MARGIN.left}px ${STACK_MARGIN.right}px` }}
    >
      <div
        className="ts-brush__track"
        style={{ height: HEIGHT }}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          ref={laneNode}
          className={`ts-brush__lane ts-ch ts-ch--${overview?.colour ?? 'neutral'}`}
        >
          {path !== null && (
            <svg className="ts-brush__overview" width={width} height={HEIGHT} aria-hidden="true">
              <path className="ts-stack__area" d={path.area} />
              <path className="ts-stack__line ts-brush__line" d={path.line} />
            </svg>
          )}
          <div className="ts-brush__shade" style={{ left: 0, width: x(startS) }} />
          <div className="ts-brush__shade" style={{ left: x(endS), right: 0 }} />
          <div
            className="ts-brush__window"
            data-part="move"
            style={{ left: x(startS), width: Math.max(2, x(endS) - x(startS)) }}
          />
          <Handle
            part="start"
            label="Selection start"
            left={x(startS)}
            value={startS}
            min={0}
            max={endS - 1}
            text={`Start ${spokenTime(startS)}`}
            onKeyDown={keyed('start')}
          />
          <Handle
            part="end"
            label="Selection end"
            left={x(endS)}
            value={endS}
            min={startS + 1}
            max={max}
            text={`End ${spokenTime(endS)}`}
            onKeyDown={keyed('end')}
          />
        </div>
      </div>
    </div>
  )
}

function Handle({
  part,
  label,
  left,
  value,
  min,
  max,
  text,
  onKeyDown,
}: {
  part: 'start' | 'end'
  label: string
  left: number
  value: number
  min: number
  max: number
  text: string
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className="ts-brush__handle"
      data-part={part}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      style={{ left }}
      onKeyDown={onKeyDown}
    >
      <span className="ts-brush__grip" aria-hidden="true" />
    </div>
  )
}

/** The overview's line and area at the track's width, from the activity's first second to its last. */
function overviewPaths(overview: BrushOverview, width: number, max: number) {
  const span = overview.high - overview.low || 1
  const map = {
    x: (timeS: number) => (timeS / max) * width,
    y: (value: number) => HEIGHT - 4 - clamp((value - overview.low) / span, 0, 1) * (HEIGHT - 8),
  }
  return {
    line: linePath(overview.columns, map),
    area: areaPath(overview.columns, map, HEIGHT),
  }
}
