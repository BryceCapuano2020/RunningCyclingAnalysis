import { describe, expect, it, vi } from 'vitest'
import { layoutAnnotations, lineObstacles, markerObstacle, splitValue } from './annotations'
import type { Annotation, AnnotationSpace } from './annotations'
import { meetsBoxes } from './chartBoxes'
import type { Box } from './chartBoxes'
import { LINE_CLEARANCE_PX } from './sportCurveAnnotations'

const PLOT = { left: 56, right: 884, top: 28, bottom: 290 }
const SPACE: AnnotationSpace = { plot: PLOT, width: 1048, rootPx: 16 }

const callout = (id: string, x: number, y: number, extra: Partial<Annotation> = {}): Annotation =>
  ({
    kind: 'callout',
    id,
    at: { x, y },
    value: '6:37 /mi',
    label: '20 min',
    ...extra,
  }) as Annotation

function boxOf(placed: ReturnType<typeof layoutAnnotations>, id: string) {
  const found = placed.find((each) => each.id === id)
  if (found === undefined) throw new Error(`${id} was not placed`)
  return found
}

describe('splitValue', () => {
  it('sets the unit after the first space apart from the number', () => {
    expect(splitValue('6:37 /mi')).toEqual({ number: '6:37', unit: ' /mi' })
    expect(splitValue('250 W')).toEqual({ number: '250', unit: ' W' })
    expect(splitValue('64%')).toEqual({ number: '64%', unit: '' })
  })
})

describe('a callout', () => {
  it('sits above its point with a leader line, its value at display size between its eyebrow and caption', () => {
    const [placed] = layoutAnnotations([callout('best', 400, 200, { caption: '3.4 W/kg' })], SPACE)
    expect(placed?.preferred).toBe(true)
    expect(placed?.box.bottom).toBeLessThan(200)
    expect(placed?.texts.map((text) => text.role)).toEqual(['eyebrow', 'value', 'caption'])
    expect(placed?.texts[1]).toMatchObject({ text: '6:37', unit: ' /mi', px: 30 })
    // The leader runs from just above the point to the box's lower edge, and stops short of the point.
    expect(placed?.leader?.y1).toBeLessThan(200)
    expect(placed?.leader?.y1).toBeGreaterThan(placed?.leader?.y2 ?? 0)
  })

  it('goes below its point when there is no room above it', () => {
    const [placed] = layoutAnnotations([callout('best', 400, PLOT.top + 6)], SPACE)
    expect(placed?.box.top).toBeGreaterThan(PLOT.top + 6)
    expect(placed?.preferred).toBe(false)
  })

  it('keeps its box inside the plot sideways, so it never runs over the axis or the margin', () => {
    const near = layoutAnnotations([callout('left', PLOT.left + 2, 200)], SPACE)[0]
    const far = layoutAnnotations([callout('right', PLOT.right - 2, 200)], SPACE)[0]
    expect(near?.box.left).toBeGreaterThanOrEqual(PLOT.left)
    expect(far?.box.right).toBeLessThanOrEqual(PLOT.right)
  })

  it('sets a phone’s value a step smaller than a wide chart’s', () => {
    const wide = layoutAnnotations([callout('a', 400, 200)], SPACE)[0]
    const phone = layoutAnnotations([callout('a', 400, 200)], { ...SPACE, phone: true })[0]
    expect(phone?.texts[1]?.px).toBeLessThan(wide?.texts[1]?.px ?? 0)
  })

  it('is nudged off another callout, so two bests close together do not overlap', () => {
    const placed = layoutAnnotations([callout('a', 400, 200), callout('b', 430, 205)], SPACE)
    const [a, b] = [boxOf(placed, 'a'), boxOf(placed, 'b')]
    expect(meetsBoxes(a.box, [b.box], 0)).toBe(false)
    expect(a.preferred).toBe(true)
    expect(b.preferred).toBe(false)
    expect(b.crowded).toBe(false)
  })

  it('keeps off the data: its text is moved clear of a line that would run through it', () => {
    // A flat line just above the point, where the callout first goes.
    const line = lineObstacles([
      { x: PLOT.left, y: 150 },
      { x: PLOT.right, y: 150 },
    ])
    const [placed] = layoutAnnotations([callout('best', 400, 200)], { ...SPACE, obstacles: line })
    expect(meetsBoxes(placed!.box, line, 0)).toBe(false)
    expect(placed?.preferred).toBe(false)
  })

  it('breaks a line at a point that is not a finite number, with no boxes made from it', () => {
    const boxes = lineObstacles([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 10 },
      { x: 20, y: Number.POSITIVE_INFINITY },
      { x: 30, y: 30 },
    ])
    expect(boxes).toEqual([])
  })

  it('says it is crowded, and takes the least bad place, where no place is free', () => {
    const everywhere = [{ left: 0, right: 2000, top: 0, bottom: 2000 }]
    const [placed] = layoutAnnotations([callout('best', 400, 200)], {
      ...SPACE,
      obstacles: everywhere,
    })
    expect(placed?.crowded).toBe(true)
    expect(placed?.box).toBeDefined()
  })
})

describe('a reference line', () => {
  const reference = (extra: Partial<Annotation> = {}): Annotation =>
    ({
      kind: 'reference',
      id: 'threshold',
      y: 150,
      label: 'Threshold',
      value: '7:12 /mi',
      ...extra,
    }) as Annotation

  it('spans the plot and puts its label and value in the right margin where there is room', () => {
    const [placed] = layoutAnnotations(
      [reference({ detail: 'Range 7:07 to 7:18 /mi' } as Partial<Annotation>)],
      {
        ...SPACE,
        width: PLOT.right + 180,
      },
    )
    expect(placed?.rule).toEqual({ x1: PLOT.left, x2: PLOT.right, y: 150 })
    expect(placed?.box.left).toBeGreaterThan(PLOT.right)
    expect(placed?.texts.map((text) => text.role)).toEqual(['eyebrow', 'value', 'caption'])
  })

  it('writes one line along the rule, inside the plot, where the margin is too narrow', () => {
    const [placed] = layoutAnnotations([reference()], { ...SPACE, width: PLOT.right + 16 })
    expect(placed?.box.right).toBeLessThanOrEqual(PLOT.right)
    expect(placed?.texts).toHaveLength(1)
    expect(placed?.texts[0]?.text).toBe('Threshold 7:12 /mi')
  })

  it('carries its range as a band, and keeps other annotations off the rule and the band', () => {
    const placed = layoutAnnotations(
      [
        reference({ band: { top: 140, bottom: 160 } } as Partial<Annotation>),
        callout('best', 400, 150),
      ],
      { ...SPACE, width: PLOT.right + 16 },
    )
    expect(boxOf(placed, 'threshold').band).toEqual({ top: 140, bottom: 160 })
    const box = boxOf(placed, 'best').box
    expect(box.bottom <= 138 || box.top >= 162).toBe(true)
  })

  it('is placed before a callout, which then moves round it', () => {
    const placed = layoutAnnotations([callout('best', PLOT.right - 40, 150), reference()], {
      ...SPACE,
      width: PLOT.right + 16,
    })
    expect(meetsBoxes(boxOf(placed, 'best').box, [boxOf(placed, 'threshold').box], 0)).toBe(false)
  })
})

describe('an optional annotation', () => {
  const everywhere = [{ left: 0, right: 2000, top: 0, bottom: 2000 }]

  it('is left out, not drawn over another mark, where it has no clear place', () => {
    const placed = layoutAnnotations([callout('a', 400, 200, { optional: true })], {
      ...SPACE,
      obstacles: everywhere,
    })
    expect(placed).toEqual([])
  })

  it('is still drawn where there is a place, and a required one is drawn crowded rather than dropped', () => {
    expect(
      layoutAnnotations([callout('a', 400, 200, { optional: true })], SPACE).map((each) => each.id),
    ).toEqual(['a'])
    const [required] = layoutAnnotations([callout('a', 400, 200)], {
      ...SPACE,
      obstacles: everywhere,
    })
    expect(required?.crowded).toBe(true)
  })

  it('is placed after the required ones of its kind, so the headline keeps its place and the others give way', () => {
    // Both want the same spot: the one listed first is optional, but the required one is placed first.
    const placed = layoutAnnotations(
      [callout('optional', 400, 200, { optional: true }), callout('required', 405, 200)],
      SPACE,
    )
    expect(boxOf(placed, 'required').preferred).toBe(true)
    expect(boxOf(placed, 'optional').preferred).toBe(false)
    expect(placed.map((each) => each.id)).toEqual(['optional', 'required'])
  })
})

describe('an end label', () => {
  const end: Annotation = {
    kind: 'end',
    id: 'end',
    at: { x: PLOT.right, y: 200 },
    text: '8:51 /mi',
    sub: 'at 90 min',
  }

  it('starts to the right of its point, in the margin', () => {
    const [placed] = layoutAnnotations([end], SPACE)
    expect(placed?.texts[0]?.anchor).toBe('start')
    expect(placed?.box.left).toBeGreaterThan(PLOT.right)
    expect(placed?.texts.map((text) => text.text)).toEqual(['8:51 /mi', 'at 90 min'])
  })

  it('moves to the left of its point, above it, where the chart has no margin', () => {
    const [placed] = layoutAnnotations([end], { ...SPACE, width: PLOT.right + 8 })
    expect(placed?.texts[0]?.anchor).toBe('end')
    expect(placed?.box.right).toBeLessThanOrEqual(PLOT.right)
  })

  it('stays above the plot’s floor wherever its point is', () => {
    const [placed] = layoutAnnotations(
      [{ ...end, at: { x: PLOT.right, y: PLOT.bottom - 2 } }],
      SPACE,
    )
    expect(placed?.box.bottom).toBeLessThanOrEqual(PLOT.bottom + 2)
  })

  it('is nudged off a label already at the same height', () => {
    const placed = layoutAnnotations(
      [end, { ...end, id: 'other', at: { x: PLOT.right, y: 204 }, text: 'Previous' }],
      SPACE,
    )
    expect(meetsBoxes(boxOf(placed, 'end').box, [boxOf(placed, 'other').box], 0)).toBe(false)
  })
})

describe('layoutAnnotations on the marks of a real curve', () => {
  // A pace curve's points, as a chart lays them out: the line falls from left to right.
  const points = [
    { x: 56, y: 60 },
    { x: 180, y: 110 },
    { x: 300, y: 150 },
    { x: 520, y: 190 },
    { x: 700, y: 210 },
    { x: PLOT.right, y: 240 },
  ]
  const obstacles = [...lineObstacles(points), ...points.map((point) => markerObstacle(point, 7))]

  it('puts every text clear of every other and of the line, and inside the plot', () => {
    const list: Annotation[] = [
      callout('best-1200', 300, 150, { caption: '3.4 W/kg' }),
      callout('best-300', 180, 110, { optional: true, caption: '3.4 W/kg' }),
      callout('best-3600', 520, 190, { optional: true, caption: '3.4 W/kg' }),
      { kind: 'reference', id: 'threshold', y: 196, label: 'Threshold', value: '7:12 /mi' },
      {
        kind: 'end',
        id: 'end',
        optional: true,
        at: points[5]!,
        text: '8:51 /mi',
        sub: 'at 90 min',
      },
    ]
    const placed = layoutAnnotations(list, { ...SPACE, obstacles })
    expect(placed.length).toBeGreaterThanOrEqual(4)
    for (const [i, each] of placed.entries()) {
      expect(each.crowded, each.id).toBe(false)
      // Callouts stay inside the plot; the margin labels sit beside it, not above or below.
      expect(each.box.top, each.id).toBeGreaterThanOrEqual(PLOT.top - 6)
      expect(each.box.bottom, each.id).toBeLessThanOrEqual(PLOT.bottom + 6)
      if (each.kind === 'callout') {
        expect(each.box.left, each.id).toBeGreaterThanOrEqual(PLOT.left - 6)
        expect(each.box.right, each.id).toBeLessThanOrEqual(PLOT.right + 6)
      }
      if (each.kind !== 'reference') expect(meetsBoxes(each.box, obstacles, 0), each.id).toBe(false)
      for (const other of placed.slice(i + 1)) {
        expect(meetsBoxes(each.box, [other.box], 0), `${each.id} and ${other.id}`).toBe(false)
      }
    }
  })

  it('keeps a best off the threshold rule that runs through its point', () => {
    const [placed, threshold] = layoutAnnotations(
      [
        callout('best', 300, 150),
        { kind: 'reference', id: 'threshold', y: 150, label: 'Threshold', value: '7:12 /mi' },
      ],
      { ...SPACE, obstacles },
    )
    const rule = { left: PLOT.left, right: PLOT.right, top: 149, bottom: 151 }
    expect(meetsBoxes(placed!.box, [rule], 0)).toBe(false)
    expect(meetsBoxes(placed!.box, [threshold!.box], 0)).toBe(false)
  })
})

describe('layoutAnnotations', () => {
  it('keeps the first of two annotations with one id and warns in development, rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const placed = layoutAnnotations([callout('a', 300, 200), callout('a', 600, 200)], SPACE)
    expect(placed.map((each) => each.id)).toEqual(['a'])
    // The first stands: its box is about 300, not 600.
    expect(placed[0]!.box.left).toBeLessThan(400)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not warn for ids that are unique', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    layoutAnnotations([callout('a', 300, 200), callout('b', 600, 200)], SPACE)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns the annotations in the order given, whatever order they were placed in', () => {
    const list: Annotation[] = [
      callout('a', 300, 200),
      { kind: 'reference', id: 'r', y: 100, label: 'Threshold' },
      { kind: 'end', id: 'e', at: { x: PLOT.right, y: 220 }, text: '1' },
    ]
    expect(layoutAnnotations(list, SPACE).map((each) => each.id)).toEqual(['a', 'r', 'e'])
  })

  it('scales its boxes with the root font, so a larger text size is given the room it needs', () => {
    const small = layoutAnnotations([callout('a', 400, 200)], SPACE)[0]
    const large = layoutAnnotations([callout('a', 400, 200)], { ...SPACE, rootPx: 32 })[0]
    const width = (box?: { left: number; right: number }) => (box?.right ?? 0) - (box?.left ?? 0)
    expect(width(large?.box)).toBeGreaterThan(width(small?.box) * 1.5)
  })
})

describe('lineObstacles', () => {
  it('samples a diagonal along its length, so text keeps off it as it does off a flat line', () => {
    const boxes = lineObstacles([
      { x: 0, y: 0 },
      { x: 80, y: 80 },
    ])
    expect(boxes.length).toBeGreaterThan(10)
    // A box centred on the diagonal, anywhere along it, meets the line.
    expect(meetsBoxes({ left: 39, right: 41, top: 39, bottom: 41 }, boxes, 0)).toBe(true)
    expect(meetsBoxes({ left: 14, right: 16, top: 14, bottom: 16 }, boxes, 0)).toBe(true)
    // A box well off the diagonal meets none of it.
    expect(meetsBoxes({ left: 60, right: 70, top: 5, bottom: 15 }, boxes, 0)).toBe(false)
  })

  it('breaks at a gap rather than bridging it', () => {
    const boxes = lineObstacles([{ x: 0, y: 0 }, null, { x: 100, y: 0 }])
    expect(boxes).toHaveLength(0)
  })

  it('has a marker obstacle as wide as the marker', () => {
    expect(markerObstacle({ x: 10, y: 20 }, 7)).toEqual({ left: 3, right: 17, top: 13, bottom: 27 })
  })
})

describe('an end label with a leading mark', () => {
  const end = (glyph?: string): Annotation => ({
    kind: 'end',
    id: 'e',
    tone: 'ride',
    at: { x: PLOT.right, y: 150 },
    text: '58%',
    ...(glyph === undefined ? {} : { glyph }),
  })

  it('carries the mark into its text, and its box is wide enough to hold it', () => {
    const [plain] = layoutAnnotations([end()], SPACE)
    const [marked] = layoutAnnotations([end('○')], SPACE)
    expect(marked?.texts[0]).toMatchObject({ role: 'label', text: '58%', glyph: '○' })
    expect(plain?.texts[0]?.glyph).toBeUndefined()
    const width = (box: { left: number; right: number }) => box.right - box.left
    expect(width(marked!.box)).toBeGreaterThan(width(plain!.box))
  })
})

describe('a callout beside the curve’s own line', () => {
  /** The distance, px, from a point to a box: 0 inside it. */
  const distanceTo = (point: { x: number; y: number }, box: Box) =>
    Math.hypot(
      Math.max(box.left - point.x, 0, point.x - box.right),
      Math.max(box.top - point.y, 0, point.y - box.bottom),
    )

  /**
   * A steep line falling from the left of the plot to the right, as a curve does past its knee, sampled every pixel: the
   * text's first places lie close beside it.
   */
  const falling = Array.from({ length: 800 }, (_, i) => ({ x: 80 + i, y: 120 + i * 0.4 }))

  /** How close the callout at the middle of the line comes to the line. */
  function gapFor(thickness: number): number {
    const at = falling[400]!
    const placed = layoutAnnotations([callout('best', at.x, at.y)], {
      ...SPACE,
      obstacles: lineObstacles(falling, thickness),
    })
    const box = boxOf(placed, 'best').box
    return Math.min(...falling.map((point) => distanceTo(point, box)))
  }

  it('keeps its text clear of the line by more than the stroke, so the 20 and 60 minute values do not crowd it', () => {
    // The line is a 3 px stroke; its obstacle is wider, and the text keeps half that wide, and the layout's gap, from the line.
    expect(gapFor(LINE_CLEARANCE_PX)).toBeGreaterThanOrEqual(LINE_CLEARANCE_PX / 2)
  })

  it('has more room than a thin obstacle gave', () => {
    expect(gapFor(LINE_CLEARANCE_PX)).toBeGreaterThan(gapFor(5))
  })
})
