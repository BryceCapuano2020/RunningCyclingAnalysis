import { describe, expect, it } from 'vitest'
import type { ScaleLane, ScaleModel } from './balanceScaleModel'
import { scaleLayout } from './balanceScaleLayout'
import type { Rect } from './balanceScaleLayout'

/** A recorded run, whatever its grade: a dot, no range. */
function run(centre: number): ScaleLane {
  return {
    sport: 'run',
    centre,
    low: null,
    high: null,
    level: 'Local',
    basis: 'recorded',
    basisText: 'recorded',
    effort: '6:37 /mi',
    pct: `${centre}%`,
    sub: 'Local · 6:37 /mi on your best 20 min',
    subShort: 'Local · 6:37 /mi',
    rangeLow: null,
    rangeHigh: null,
  }
}

/** An estimated ride: a ring over a band. */
function ride(centre: number, low: number, high: number): ScaleLane {
  return {
    sport: 'ride',
    centre,
    low,
    high,
    level: 'Recreational to Local',
    basis: 'estimated',
    basisText: 'estimated',
    effort: '246 W',
    pct: `${centre}%`,
    sub: 'Recreational to Local · 246 W on your best 20 min',
    subShort: 'Recreational to Local · 246 W',
    rangeLow: String(low),
    rangeHigh: `${high}%`,
  }
}

function model(lanes: ScaleLane[], withTarget = true): ScaleModel {
  const [first, second] = lanes as [ScaleLane, ScaleLane]
  const lower = first.centre < second.centre ? first : second
  const higher = lower === first ? second : first
  return {
    lanes,
    gap: {
      figure: `${Math.abs(first.centre - second.centre)} pts`,
      note: 'toward running · 90% range 1 to 12 points',
      noteShort: 'range 1 to 12 points',
      noteTiny: 'range 1 to 12',
      side: 'toward running',
      rangeValue: '1 to 12 points',
    },
    target: withTarget
      ? {
          sport: lower.sport,
          at: higher.centre,
          eyebrow: `To level with ${higher.sport === 'run' ? 'running' : 'cycling'}`,
          line: 'about 270 W (245 to 295 W) · now 246 W',
          sentence: 'To grade level with your running, your best ride would need about 270 W.',
        }
      : null,
    description: '',
    rows: [],
  }
}

const SAMPLE = model([run(64), ride(58, 52, 63)])
const WIDTHS = [288, 334, 420, 560, 760, 1000]

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('scaleLayout marks', () => {
  it('draws a recorded grade as a dot with no band, and an estimate as a ring over its range', () => {
    const { lanes } = scaleLayout(SAMPLE, 1000)
    const [first, second] = lanes
    expect(first).toMatchObject({ sport: 'run', kind: 'dot', band: null })
    expect(second).toMatchObject({ sport: 'ride', kind: 'ring' })
    expect(second?.band).not.toBeNull()
  })

  it('puts the band’s two ends where the range’s two percentages are on the axis', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const { axis } = layout
    const span = axis.max - axis.min
    const band = layout.lanes[1]?.band
    expect(band?.x1).toBeCloseTo(((52 - axis.min) / span) * 1000)
    expect(band?.x2).toBeCloseTo(((63 - axis.min) / span) * 1000)
    // The ring's centre is the grade, between them.
    const ring = layout.lanes[1]
    expect(ring?.x).toBeCloseTo(((58 - axis.min) / span) * 1000)
    expect(ring?.x ?? 0).toBeGreaterThan(band?.x1 ?? Infinity)
    expect(ring?.x ?? 0).toBeLessThan(band?.x2 ?? 0)
  })

  it('fits the axis to the data, not the whole 0 to 100% scale', () => {
    const { axis } = scaleLayout(SAMPLE, 1000)
    expect(axis).toEqual({ min: 40, max: 80 })
  })

  it('names the bands the axis shows, and drops a name its band is too narrow to hold', () => {
    const wide = scaleLayout(SAMPLE, 1000).bands.map((band) => band.label)
    expect(wide).toEqual(['Recreational', 'Local', 'Regional'])
    const narrow = scaleLayout(SAMPLE, 288).bands
    // At 288 px a ten point band is 72 px: too narrow for a name set in capitals at letter-spacing.
    expect(narrow.some((band) => band.label === null)).toBe(false)
    expect(narrow.find((band) => band.name === 'Recreational')?.label).toBe('Recreational')
  })
})

describe('scaleLayout connector', () => {
  it('joins the two marks with a stem from each and a bar between them, in the row between the lanes', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const [first, second] = layout.lanes
    const { connector } = layout
    expect(connector).toMatchObject({ x1: first?.x, x2: second?.x })
    expect(connector?.y).toBeGreaterThan(first?.y ?? Infinity)
    expect(connector?.y).toBeLessThan(second?.y ?? 0)
    // Each stem starts or ends clear of its mark's ring, so it is anchored to the dot and the ring, not drawn over them.
    expect(connector?.y1).toBeGreaterThan((first?.y ?? 0) + layout.metrics.markR)
    expect(connector?.y2).toBeLessThan((second?.y ?? 0) - layout.metrics.markR)
  })

  it('runs from the upper lane’s mark to the lower’s whichever sport leads', () => {
    const { connector, lanes } = scaleLayout(model([run(52), ride(64, 58, 70)]), 1000)
    expect(connector?.x1).toBe(lanes[0]?.x)
    expect(connector?.x2).toBe(lanes[1]?.x)
  })

  it('has a bar of no length, which is the stems alone, when both sports sit at one grade', () => {
    const { connector, lanes } = scaleLayout(model([run(60), ride(60, 55, 64)], false), 1000)
    expect(connector?.x1).toBe(lanes[0]?.x)
    expect(connector?.x2).toBe(lanes[1]?.x)
  })

  it('carries no label: the gap is said in the caption, never in the drawing’s rows', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    expect(layout).not.toHaveProperty('gap')
    expect(layout.lanes.every((lane) => lane.pct.y > 0)).toBe(true)
  })
})

describe('scaleLayout past 100%', () => {
  it('keeps every mark, range end and the ghost on the drawing when a grade is past 100%', () => {
    for (const lanes of [
      [run(132), ride(52, 46, 58)],
      [run(64), ride(110, 104, 115)],
      [run(100), ride(99, 90, 108)],
    ]) {
      for (const width of [288, 1000]) {
        const layout = scaleLayout(model(lanes), width)
        const reach = layout.lanes.flatMap((lane) => [
          lane.x,
          lane.band?.x1 ?? lane.x,
          lane.band?.x2 ?? lane.x,
        ])
        for (const x of [...reach, layout.ghost?.x ?? 0]) {
          expect(x).toBeGreaterThan(0)
          expect(x).toBeLessThan(width)
        }
        // The right of the plot is World, which continues past 100%.
        expect(layout.bands.at(-1)?.name).toBe('World')
        expect(layout.axis.max).toBeGreaterThan(100)
      }
    }
  })
})

describe('scaleLayout level target', () => {
  it('puts the ghost ring in the lower sport’s lane at the higher sport’s grade', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const [first, second] = layout.lanes
    expect(layout.ghost?.x).toBeCloseTo(first?.x ?? 0)
    expect(layout.ghost?.y).toBe(second?.y)
    expect(layout.ghost?.guide.x).toBe(layout.ghost?.x)
  })

  it('puts it in the run’s lane when the ride leads', () => {
    const layout = scaleLayout(model([run(52), ride(64, 58, 70)]), 1000)
    expect(layout.ghost?.y).toBe(layout.lanes[0]?.y)
    expect(layout.ghost?.x).toBeCloseTo(layout.lanes[1]?.x ?? 0)
  })

  it('draws no ghost when there is no target, or when the grades are level', () => {
    expect(scaleLayout(model([run(64), ride(58, 52, 63)], false), 1000).ghost).toBeNull()
  })
})

describe('scaleLayout text', () => {
  it.each(WIDTHS)(
    'keeps every text box inside the plot and clear of the others at %i px',
    (width) => {
      for (const lanes of [
        [run(64), ride(58, 52, 63)],
        [run(52), ride(64, 58, 70)],
        [run(80), ride(74, 66, 82)],
        [run(61), ride(60, 40, 75)],
      ]) {
        const { boxes } = scaleLayout(model(lanes), width)
        for (const [index, box] of boxes.entries()) {
          expect(box.x, `box ${index} left at ${width}`).toBeGreaterThanOrEqual(-1)
          expect(box.x + box.w, `box ${index} right at ${width}`).toBeLessThanOrEqual(width + 1)
          for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false)
        }
      }
    },
  )

  it('gives each lane one grade, in its own header: above the first lane’s mark and below the second’s', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const [first, second] = layout.lanes
    expect(first?.pct.anchor).toBe('start')
    expect(first?.pct.y ?? Infinity).toBeLessThan(first?.y ?? 0)
    expect(second?.pct.y ?? 0).toBeGreaterThan(second?.y ?? Infinity)
    // The grade leads its header, left of the name and the line under it.
    expect(first?.pct.x ?? Infinity).toBeLessThan(first?.name.x ?? 0)
  })

  it('falls back to a shorter line under the name where the whole one would not fit the row', () => {
    const wide = scaleLayout(SAMPLE, 1000).lanes.map((lane) => lane.subForm)
    expect(wide).toEqual(['full', 'full'])
    const narrow = scaleLayout(SAMPLE, 288).lanes.map((lane) => lane.subForm)
    expect(narrow).toEqual(['short', 'short'])
    const tight = scaleLayout(
      model([
        run(64),
        { ...ride(58, 52, 63), subShort: `${ride(58, 52, 63).subShort} (estimated)` },
      ]),
      288,
    )
    expect(tight.lanes[1]?.subForm).toBe('level')
  })

  it('prints a range’s two ends under its band, or one for both where they would meet', () => {
    const wide = scaleLayout(SAMPLE, 1000).lanes[1]!
    expect(wide.ranges.map((range) => range.text)).toEqual(['52', '63%'])
    const meeting = scaleLayout(model([run(60), ride(60, 59, 61)], false), 288).lanes[1]!
    expect(meeting.ranges.map((range) => range.text)).toEqual(['59–61%'])
  })

  it('grows with the root font size, so larger text still fits', () => {
    const base = scaleLayout(SAMPLE, 1000, 16)
    const large = scaleLayout(SAMPLE, 1000, 24)
    expect(large.height).toBeGreaterThan(base.height)
    expect(large.metrics.bigFs).toBeCloseTo(base.metrics.bigFs * 1.5)
  })

  it('takes the compact sizes below 560 px', () => {
    expect(scaleLayout(SAMPLE, 559).compact).toBe(true)
    expect(scaleLayout(SAMPLE, 560).compact).toBe(false)
  })
})

describe('scaleLayout with one lane', () => {
  const alone: ScaleModel = {
    ...model([run(64), ride(58, 52, 63)], false),
    lanes: [run(64)],
    gap: null,
  }

  it('draws the one mark, with no connector and no ghost', () => {
    const layout = scaleLayout(alone, 1000)
    expect(layout.lanes).toHaveLength(1)
    expect(layout.lanes[0]).toMatchObject({ sport: 'run', kind: 'dot', band: null })
    expect(layout.connector).toBeNull()
    expect(layout.ghost).toBeNull()
  })

  it('fits the axis to the one grade, and ends the plot under its own marks, shorter than with two lanes', () => {
    const one = scaleLayout(alone, 1000)
    expect(one.axis).toEqual({ min: 40, max: 80 })
    expect(one.plot.bottom).toBeLessThan(scaleLayout(SAMPLE, 1000).plot.bottom)
  })

  it.each([288, 334, 1000])(
    'keeps its text inside the plot and clear of the rest at %i px',
    (width) => {
      for (const lane of [run(64), ride(58, 52, 63), run(95), ride(8, 3, 14)]) {
        const { boxes } = scaleLayout({ ...alone, lanes: [lane] }, width)
        boxes.forEach((box, index) => {
          expect(box.x).toBeGreaterThanOrEqual(-1)
          expect(box.x + box.w).toBeLessThanOrEqual(width + 1)
          for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false)
        })
      }
    },
  )
})

/** The pieces of the connector as thin boxes: its bar and its two stems. */
function connectorBoxes(layout: ReturnType<typeof scaleLayout>): Rect[] {
  const c = layout.connector
  if (c === null) return []
  const left = Math.min(c.x1, c.x2)
  return [
    { x: left, y: c.y - 1, w: Math.abs(c.x2 - c.x1), h: 2 },
    { x: c.x1 - 1, y: c.y1, w: 2, h: c.y - c.y1 },
    { x: c.x2 - 1, y: c.y, w: 2, h: c.y2 - c.y },
  ]
}

/** Each mark as a box: its ring, and the whole band of an estimate. */
function markBoxes(layout: ReturnType<typeof scaleLayout>): Rect[] {
  const { markR, capH } = layout.metrics
  return layout.lanes.map((lane) => {
    const x1 = Math.min(lane.x - markR, lane.band?.x1 ?? Infinity)
    const x2 = Math.max(lane.x + markR, lane.band?.x2 ?? -Infinity)
    return { x: x1, y: lane.y - capH / 2, w: x2 - x1, h: capH }
  })
}

describe('scaleLayout across widths, gaps and ranges', () => {
  // The sweep the connector is held to: no text of any lane's header or range ends sits on the bar or a stem, or on a
  // mark, whatever the width from 280 to 1440 px, the gap from 0 to 30 points, or the range of the estimate.
  const widths = [280, 320, 360, 390, 480, 559, 560, 768, 1000, 1440]
  const gaps = [0, 1, 2, 5, 12, 20, 30]
  const ranges = [1, 6, 15]

  it('keeps the connector, the marks and every text clear of one another', () => {
    let checked = 0
    for (const width of widths) {
      for (const gap of gaps) {
        for (const spread of ranges) {
          for (const runHigher of [true, false]) {
            const base = 62
            const runAt = runHigher ? base + gap : base
            const rideAt = runHigher ? base : base + gap
            const lanes = [run(runAt), ride(rideAt, rideAt - spread, rideAt + spread)]
            const layout = scaleLayout(model(lanes, gap > 0), width)
            const id = `${width}px, gap ${gap}, range ${spread}, ${runHigher ? 'run' : 'ride'} higher`
            const solid = [...connectorBoxes(layout), ...markBoxes(layout)]
            for (const box of layout.boxes) {
              expect(box.x, `left of a box at ${id}`).toBeGreaterThanOrEqual(-1)
              expect(box.x + box.w, `right of a box at ${id}`).toBeLessThanOrEqual(width + 1)
              for (const other of solid) {
                expect(overlap(box, other), `a box on the connector or a mark at ${id}`).toBe(false)
              }
            }
            layout.boxes.forEach((box, index) => {
              for (const other of layout.boxes.slice(index + 1)) {
                expect(overlap(box, other), `two boxes at ${id}`).toBe(false)
              }
            })
            // The connector’s row is between the lanes’ rows: its bar is inside the plot.
            expect(layout.connector!.y).toBeGreaterThan(layout.plot.top)
            expect(layout.connector!.y).toBeLessThan(layout.plot.bottom)
            checked += 1
          }
        }
      }
    }
    expect(checked).toBe(widths.length * gaps.length * ranges.length * 2)
  })

  it('keeps the plot taller than its marks and short enough for a phone’s first screen at 320', () => {
    const phone = scaleLayout(SAMPLE, 288)
    // The whole drawing, band names to tick labels, fits in 230 px, which the first screen at 320 x 640 can hold.
    expect(phone.height).toBeLessThanOrEqual(230)
    expect(phone.height).toBeGreaterThan(phone.lanes[1]!.y)
  })
})
