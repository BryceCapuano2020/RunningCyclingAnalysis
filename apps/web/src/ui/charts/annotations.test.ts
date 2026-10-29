import { describe, expect, it } from 'vitest'
import { layoutAnnotations, lineObstacles, markerObstacle, splitValue } from './annotations'
import type { Annotation, AnnotationSpace } from './annotations'
import { meetsBoxes } from './chartBoxes'

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
    const [placed] = layoutAnnotations([callout('best', 400, 200, { caption: 'flat pace' })], SPACE)
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

describe('a bracket', () => {
  const bracket: Annotation = {
    kind: 'bracket',
    id: 'span',
    x1: 300,
    x2: 500,
    y: 280,
    label: 'No effort of 20 to 60 min on file',
  }

  it('labels its span above the bar, centred on it', () => {
    const [placed] = layoutAnnotations([bracket], SPACE)
    expect(placed?.rule).toEqual({ x1: 300, x2: 500, y: 280 })
    expect(placed?.box.bottom).toBeLessThan(280)
    const mid = ((placed?.box.left ?? 0) + (placed?.box.right ?? 0)) / 2
    expect(mid).toBeCloseTo(400, 0)
  })

  it('keeps its label inside the plot where the span is at an edge', () => {
    const [placed] = layoutAnnotations([{ ...bracket, x1: 60, x2: 90 }], SPACE)
    expect(placed?.box.left).toBeGreaterThanOrEqual(PLOT.left - 6)
  })

  it('goes under its bar where the data is above it', () => {
    const data = [{ left: 0, right: 2000, top: 230, bottom: 255 }]
    const [placed] = layoutAnnotations([{ ...bracket, y: 250 }], { ...SPACE, obstacles: data })
    expect(placed?.box.top).toBeGreaterThan(250)
  })
})

describe('layoutAnnotations', () => {
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
