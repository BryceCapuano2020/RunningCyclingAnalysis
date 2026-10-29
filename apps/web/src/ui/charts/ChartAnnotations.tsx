import { useMemo } from 'react'
import { layoutAnnotations, valuePx } from './annotations'
import type { Annotation, AnnotationSpace, PlacedAnnotation, PlacedText } from './annotations'
import type { ChartSize } from './chartTypes'
import { DEFAULT_ROOT_PX, rootFontPx } from './rootFont'
import { NARROW_WIDTH } from './ticks'
import './ChartAnnotations.css'

export interface ChartAnnotationsProps {
  annotations: readonly Annotation[]
  size: ChartSize
  /** The data's marks as boxes the text keeps off: see lineObstacles. */
  obstacles?: AnnotationSpace['obstacles']
}

/** The radius, px, of the hollow ring that ends an estimated line. */
const RING_R = 5

function textElement(placed: PlacedAnnotation, text: PlacedText, phone: boolean, index: number) {
  const display = text.role === 'value'
  return (
    <text
      key={`${placed.id}-${index}`}
      className={`annot__text annot__text--${text.role}`}
      x={text.x}
      y={text.y}
      textAnchor={text.anchor}
      style={
        display ? { fontSize: `${(text.px ?? valuePx(phone)) / DEFAULT_ROOT_PX}rem` } : undefined
      }
    >
      {text.text}
      {text.unit ? <tspan className="annot__unit">{text.unit}</tspan> : null}
    </text>
  )
}

function Mark({ placed, phone }: { placed: PlacedAnnotation; phone: boolean }) {
  const { rule, band, leader } = placed
  const bracket = placed.kind === 'bracket' && rule !== null
  return (
    <g
      className={`annot annot--${placed.kind} annot--${placed.tone}`}
      data-annotation={placed.id}
      data-crowded={placed.crowded || undefined}
    >
      {band !== null && rule !== null ? (
        <rect
          className="annot__band"
          x={rule.x1}
          y={band.top}
          width={rule.x2 - rule.x1}
          height={Math.max(1, band.bottom - band.top)}
        />
      ) : null}
      {rule !== null && !bracket ? (
        <line
          className={placed.estimated ? 'annot__rule annot__rule--estimated' : 'annot__rule'}
          x1={rule.x1}
          x2={rule.x2}
          y1={rule.y}
          y2={rule.y}
        />
      ) : null}
      {rule !== null && placed.estimated ? (
        <circle className="annot__ring" cx={rule.x2} cy={rule.y} r={RING_R} />
      ) : null}
      {bracket ? (
        <path
          className="annot__bracket"
          d={`M${rule.x1} ${rule.y - 5}V${rule.y}H${rule.x2}V${rule.y - 5}`}
        />
      ) : null}
      {leader !== null ? (
        <line
          className="annot__leader"
          x1={leader.x1}
          y1={leader.y1}
          x2={leader.x2}
          y2={leader.y2}
        />
      ) : null}
      {placed.texts.map((text, i) => textElement(placed, text, phone, i))}
    </g>
  )
}

/**
 * Draws a chart's annotations, placed so that their text keeps off one another and off the data. Opt-in:
 * a chart builds the list of marks it wants labelled and renders this inside its drawing, above the data.
 * Every text carries a halo in the card colour, so it reads over gridlines and washes.
 */
export function ChartAnnotations({ annotations, size, obstacles }: ChartAnnotationsProps) {
  const phone = size.width < NARROW_WIDTH
  // The layout is kept while its inputs are: a chart's size object is stable between renders at one size.
  const placed = useMemo(
    () =>
      layoutAnnotations(annotations, {
        plot: size.plot,
        width: size.width,
        rootPx: rootFontPx(),
        obstacles,
        phone,
      }),
    [annotations, size.plot, size.width, obstacles, phone],
  )
  return (
    <g className="annotations">
      {placed.map((each) => (
        <Mark key={each.id} placed={each} phone={phone} />
      ))}
    </g>
  )
}
