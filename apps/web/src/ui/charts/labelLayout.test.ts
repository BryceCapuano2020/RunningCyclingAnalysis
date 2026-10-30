// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { Box } from './chartBoxes'
import { labelLayout } from './labelLayout'
import type { LabelCandidate } from './labelLayout'
import { labelWidthPx, textEm } from './rootFont'
import { geometryScale, plotBoxOf } from './plotBox'

const BOUNDS: Box = { left: 0, right: 1100, top: 0, bottom: 40 }

/** A row of labels, one per x, drawn at this root size: the widths are the chart's own estimate. */
function row(rootPx: number): LabelCandidate[] {
  const text = [
    ['Threshold 4:17 /km', 0, 300],
    ['5 min best 3:36 /km', 1, 100],
    ['20 min best 3:56 /km', 1, 480],
    ['60 min best 4:12 /km', 1, 740],
    ['End 8:51 /km', 0, 1000],
  ] as const
  return text.map(([label, priority, x]) => {
    const width = labelWidthPx(label, rootPx)
    return {
      id: label,
      priority,
      box: { left: x - width / 2, right: x + width / 2, top: 10, bottom: 10 + 0.75 * rootPx },
    }
  })
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function setRoot(styles: Partial<Record<'fontSize' | 'letterSpacing' | 'wordSpacing', string>>) {
  Object.assign(document.documentElement.style, styles)
}

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('labelLayout', () => {
  it('keeps every label that fits, and no two of those it keeps overlap, at 1x and at 2x', () => {
    for (const rootPx of [16, 32]) {
      const labels = row(rootPx)
      const { kept, dropped } = labelLayout(labels, BOUNDS)
      const boxes = labels.filter((label) => kept.includes(label.id)).map((label) => label.box)
      boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
      expect(kept.length + dropped.length).toBe(labels.length)
    }
    expect(labelLayout(row(16), BOUNDS).dropped).toEqual([])
  })

  it('drops the lowest priority label that would collide, never a threshold or an end label', () => {
    const { kept, dropped } = labelLayout(row(32), BOUNDS)
    expect(dropped.length).toBeGreaterThan(0)
    expect(kept).toContain('Threshold 4:17 /km')
    expect(kept).toContain('End 8:51 /km')
    // Every label dropped is a best (priority 1), the one taken last going first, and the clear one stays.
    expect(dropped).toEqual(['20 min best 3:56 /km', '5 min best 3:36 /km'])
    expect(kept).toContain('60 min best 4:12 /km')
  })

  it('drops a label that lies outside the bounds, and keeps the order it was given', () => {
    const labels: LabelCandidate[] = [
      { id: 'a', priority: 1, box: { left: 10, right: 50, top: 0, bottom: 10 } },
      { id: 'out', priority: 0, box: { left: 1090, right: 1140, top: 0, bottom: 10 } },
      { id: 'b', priority: 0, box: { left: 100, right: 140, top: 0, bottom: 10 } },
    ]
    const { kept, dropped } = labelLayout(labels, BOUNDS)
    expect(kept).toEqual(['a', 'b'])
    expect(dropped).toEqual(['out'])
  })

  it('keeps a clearance between two labels, so touching boxes are not both drawn', () => {
    const labels: LabelCandidate[] = [
      { id: 'a', priority: 0, box: { left: 0, right: 50, top: 0, bottom: 10 } },
      { id: 'b', priority: 1, box: { left: 50, right: 100, top: 0, bottom: 10 } },
    ]
    expect(labelLayout(labels, BOUNDS).dropped).toEqual(['b'])
  })
})

describe('text size and spacing in the chart estimates', () => {
  it("widens a label by the reader's letter and word spacing, and by nothing at the default", () => {
    expect(textEm('5 min best')).toBeCloseTo(10 * 0.6, 5)
    setRoot({ fontSize: '16px', letterSpacing: '2px', wordSpacing: '3px' })
    // 10 characters at 2 px and 2 spaces at 3 px, over the 16 px root, on top of the glyphs.
    expect(textEm('5 min best')).toBeCloseTo(10 * 0.6 + (10 * 2 + 2 * 3) / 16, 5)
    setRoot({ fontSize: '16px', letterSpacing: '0px', wordSpacing: '0px' })
    const plain = labelWidthPx('5 min best', 16)
    setRoot({ fontSize: '16px', letterSpacing: '2px', wordSpacing: '3px' })
    expect(labelWidthPx('5 min best', 16)).toBeGreaterThan(plain)
  })

  it("grows the plot's margins and height with the root font size, and never shrinks them", () => {
    expect(geometryScale()).toBe(1)
    const base = plotBoxOf(800, 320)
    setRoot({ fontSize: '32px' })
    expect(geometryScale()).toBe(2)
    const zoomed = plotBoxOf(800, 640)
    expect(zoomed.left).toBe(base.left * 2)
    expect(zoomed.top).toBe(base.top * 2)
    expect(640 - zoomed.bottom).toBe((320 - base.bottom) * 2)
    setRoot({ fontSize: '12px' })
    expect(geometryScale()).toBe(1)
  })
})
