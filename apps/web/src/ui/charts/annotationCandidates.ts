import type { Box } from './chartBoxes'
import type { PlotBox } from './chartTypes'
import {
  END_NUDGES,
  LABEL_LINE,
  LEADER_GAP,
  LEADER_LENGTHS,
  REFERENCE_VALUE_PX,
  scaleOf,
  smallWidth,
  splitValue,
  valuePx,
  valueWidth,
} from './annotationTypes'
import type {
  Annotation,
  AnnotationSpace,
  Bracket,
  Callout,
  EndLabel,
  PlacedAnnotation,
  PlacedText,
  ReferenceLine,
} from './annotationTypes'

export const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high))

export interface Candidate {
  box: Box
  texts: PlacedText[]
  leader?: PlacedAnnotation['leader']
}

export function inside(box: Box, plot: PlotBox, loose = false): boolean {
  const slack = loose ? 6 : 0
  return (
    box.left >= plot.left - slack &&
    box.right <= plot.right + slack &&
    box.top >= plot.top - slack &&
    box.bottom <= plot.bottom + slack
  )
}

function calloutCandidates(c: Callout, space: AnnotationSpace): Candidate[] {
  const { plot, rootPx } = space
  const px = valuePx(space.phone === true) * scaleOf(rootPx)
  const label = c.label === undefined ? 0 : LABEL_LINE * scaleOf(rootPx)
  const caption = c.caption === undefined ? 0 : LABEL_LINE * scaleOf(rootPx)
  const widths = [
    valueWidth(c.value, valuePx(space.phone === true), rootPx),
    c.label === undefined ? 0 : smallWidth(c.label, rootPx),
    c.caption === undefined ? 0 : smallWidth(c.caption, rootPx),
  ]
  const w = Math.max(...widths)
  const h = label + px * 0.9 + caption
  const sides = c.prefer === 'below' ? (['below', 'above'] as const) : (['above', 'below'] as const)
  const shifts = [0, -0.6, 0.6]
  const out: Candidate[] = []
  for (const length of LEADER_LENGTHS) {
    for (const side of sides) {
      for (const shift of shifts) {
        const left = clamp(c.at.x - w / 2 + shift * w, plot.left, plot.right - w)
        const top = side === 'above' ? c.at.y - length - h : c.at.y + length
        const box: Box = { left, right: left + w, top, bottom: top + h }
        const mid = left + w / 2
        const texts: PlacedText[] = []
        let y = top
        if (c.label !== undefined) {
          texts.push({ role: 'eyebrow', text: c.label, x: mid, y: y + label - 3, anchor: 'middle' })
          y += label
        }
        const { number, unit } = splitValue(c.value)
        texts.push({
          role: 'value',
          text: number,
          unit,
          x: mid,
          y: y + px * 0.85,
          anchor: 'middle',
          px: valuePx(space.phone === true),
        })
        y += px * 0.9
        if (c.caption !== undefined) {
          texts.push({
            role: 'caption',
            text: c.caption,
            x: mid,
            y: y + caption - 3,
            anchor: 'middle',
          })
        }
        // The leader meets the box at its near edge, under (or over) the point where the box reaches it.
        const edge = side === 'above' ? box.bottom + 1 : box.top - 1
        const toward = clamp(c.at.x, left + 6, left + w - 6)
        const gap = side === 'above' ? -LEADER_GAP : LEADER_GAP
        const leader = { x1: c.at.x, y1: c.at.y + gap, x2: toward, y2: edge }
        out.push({ box, texts, leader })
      }
    }
  }
  return out
}

function endCandidates(e: EndLabel, space: AnnotationSpace): Candidate[] {
  const { rootPx, width } = space
  const line = LABEL_LINE * scaleOf(rootPx)
  const w = Math.max(
    smallWidth(e.text, rootPx),
    e.sub === undefined ? 0 : smallWidth(e.sub, rootPx),
  )
  const h = line * (e.sub === undefined ? 1 : 2)
  const roomRight = width - 4 - (e.at.x + 10) >= w
  return END_NUDGES.map((dy) => {
    const left = roomRight ? e.at.x + 10 : e.at.x - 8 - w
    const top = (roomRight ? e.at.y - line * 0.7 : e.at.y - 10 - h) + dy
    const anchor = roomRight ? 'start' : 'end'
    const x = roomRight ? left : left + w
    const texts: PlacedText[] = [{ role: 'label', text: e.text, x, y: top + line - 3, anchor }]
    if (e.sub !== undefined) {
      texts.push({ role: 'caption', text: e.sub, x, y: top + line * 2 - 3, anchor })
    }
    return { box: { left, right: left + w, top, bottom: top + h }, texts }
  })
}

function referenceCandidates(r: ReferenceLine, space: AnnotationSpace): Candidate[] {
  const { plot, rootPx, width } = space
  const px = REFERENCE_VALUE_PX * scaleOf(rootPx)
  const line = LABEL_LINE * scaleOf(rootPx)
  const lines = [
    smallWidth(r.label, rootPx),
    r.value === undefined ? 0 : valueWidth(r.value, REFERENCE_VALUE_PX, rootPx),
    r.detail === undefined ? 0 : smallWidth(r.detail, rootPx),
  ]
  const w = Math.max(...lines)
  const h = line + (r.value === undefined ? 0 : px * 0.9) + (r.detail === undefined ? 0 : line)
  const gutter = width - 4 - (plot.right + 10) >= w
  const out: Candidate[] = []
  if (gutter && r.value !== undefined) {
    for (const dy of END_NUDGES) {
      const left = plot.right + 10
      const top = clamp(r.y - h / 2 + dy, plot.top, plot.bottom - h)
      const texts: PlacedText[] = [
        { role: 'eyebrow', text: r.label, x: left, y: top + line - 3, anchor: 'start' },
      ]
      let y = top + line
      const { number, unit } = splitValue(r.value)
      texts.push({
        role: 'value',
        text: number,
        unit,
        x: left,
        y: y + px * 0.85,
        anchor: 'start',
        px: REFERENCE_VALUE_PX,
      })
      y += px * 0.9
      if (r.detail !== undefined) {
        texts.push({ role: 'caption', text: r.detail, x: left, y: y + line - 3, anchor: 'start' })
      }
      out.push({ box: { left, right: left + w, top, bottom: top + h }, texts })
    }
    return out
  }
  // No margin to hold it: one line along the rule, above it and then below it, at the plot's right end.
  const text = r.value === undefined ? r.label : `${r.label} ${r.value}`
  const tw = smallWidth(text, rootPx)
  for (const end of ['right', 'left'] as const) {
    for (const side of ['above', 'below'] as const) {
      const left = end === 'right' ? plot.right - 4 - tw : plot.left + 4
      const top = side === 'above' ? r.y - line - 2 : r.y + 3
      out.push({
        box: { left, right: left + tw, top, bottom: top + line },
        texts: [
          {
            role: 'label',
            text,
            x: end === 'right' ? left + tw : left,
            y: top + line - 3,
            anchor: end === 'right' ? 'end' : 'start',
          },
        ],
      })
    }
  }
  return out
}

function bracketCandidates(b: Bracket, space: AnnotationSpace): Candidate[] {
  const { plot, rootPx } = space
  const line = LABEL_LINE * scaleOf(rootPx)
  const w = smallWidth(b.label, rootPx)
  const mid = (b.x1 + b.x2) / 2
  const left = clamp(mid - w / 2, plot.left, plot.right - w)
  return (['above', 'below'] as const).map((side) => {
    const top = side === 'above' ? b.y - 7 - line : b.y + 4
    return {
      box: { left, right: left + w, top, bottom: top + line },
      texts: [
        { role: 'label', text: b.label, x: left + w / 2, y: top + line - 3, anchor: 'middle' },
      ],
    }
  })
}

export const CANDIDATES: {
  [K in Annotation['kind']]: (
    a: Extract<Annotation, { kind: K }>,
    s: AnnotationSpace,
  ) => Candidate[]
} = {
  callout: calloutCandidates,
  end: endCandidates,
  reference: referenceCandidates,
  bracket: bracketCandidates,
}
