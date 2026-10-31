import { describe, expect, it } from 'vitest'
import { layoutAnnotations } from './annotations'
import type { Annotation, AnnotationSpace } from './annotations'
import { meetsBoxes } from './chartBoxes'
import type { Box } from './chartBoxes'

/**
 * Annotations at 200% text on a phone have no free place, and the axis's labels are not to be written over: where
 * nothing is free, an annotation moves among its places, and where none clears the axis it is left out (a reference
 * keeps its rule). These cases failed when the layout took the cheapest overlap instead.
 */
const PLOT = { left: 40, right: 360, top: 20, bottom: 240 }
const PHONE: AnnotationSpace = { plot: PLOT, width: 380, rootPx: 32, phone: true }

const reference: Annotation = {
  kind: 'reference',
  id: 'threshold',
  y: 120,
  label: 'Threshold',
  value: '239 W',
}

/** The whole plot's left strip, where a phone sets its tick labels. */
const STRIP: Box[] = [{ left: PLOT.left, right: PLOT.right, top: PLOT.top, bottom: PLOT.bottom }]
const textBoxes = (placed: ReturnType<typeof layoutAnnotations>[number]): Box[] =>
  placed.texts.map((text) => ({
    left: text.anchor === 'end' ? text.x - 150 : text.x,
    right: text.anchor === 'end' ? text.x : text.x + 150,
    top: text.y - 24,
    bottom: text.y,
  }))

describe('with nothing free', () => {
  it('keeps a bracket’s label above the plot’s floor, where the x axis’s labels begin', () => {
    // The place above the bar is taken by data, so the label can only go under it, at every height of the bar.
    for (let y = 196; y <= PLOT.bottom; y += 4) {
      const bracket: Annotation = {
        kind: 'bracket',
        id: 'span',
        x1: 100,
        x2: 300,
        y,
        label: 'No separate 20–45 min effort: this stretch uses your 45 min best',
      }
      const data: Box[] = [{ left: PLOT.left, right: PLOT.right, top: PLOT.top, bottom: y - 4 }]
      for (const placed of layoutAnnotations([bracket], { ...PHONE, obstacles: data })) {
        expect(placed.box.bottom, `bar at ${y}`).toBeLessThanOrEqual(PLOT.bottom)
      }
    }
  })

  it('leaves a reference line’s words off where every place meets an axis label, and keeps its rule', () => {
    const [placed] = layoutAnnotations([reference], { ...PHONE, ticks: STRIP })
    expect(placed?.rule).toEqual({ x1: PLOT.left, x2: PLOT.right, y: 120 })
    expect(placed?.texts).toEqual([])
    expect(placed?.crowded).toBe(true)
  })

  it('never puts a reference line’s words over an axis label that leaves one place clear', () => {
    // A label just under the rule: the words go above it.
    const tick: Box = { left: PLOT.left, right: PLOT.left + 90, top: 124, bottom: 160 }
    const [placed] = layoutAnnotations([reference], { ...PHONE, ticks: [tick] })
    expect(placed).toBeDefined()
    for (const box of textBoxes(placed!)) expect(meetsBoxes(box, [tick], 0)).toBe(false)
  })

  it('leaves a callout out where every place meets an axis label, drawn or not', () => {
    const callout: Annotation = {
      kind: 'callout',
      id: 'best',
      at: { x: 200, y: 120 },
      value: '263 W',
      label: '20 min',
    }
    expect(layoutAnnotations([callout], { ...PHONE, ticks: STRIP })).toEqual([])
  })

  it('keeps an end label inside the chart’s width, or leaves it out', () => {
    const end: Annotation = {
      kind: 'end',
      id: 'end',
      optional: true,
      at: { x: 20, y: 120 },
      text: 'A very long label that cannot fit at this size',
    }
    for (const placed of layoutAnnotations([end], PHONE)) {
      expect(placed.box.left).toBeGreaterThanOrEqual(0)
      expect(placed.box.right).toBeLessThanOrEqual(PHONE.width)
    }
  })
})
