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

describe('scaleLayout bracket', () => {
  it('spans from one mark to the other, at the gap row between the lanes', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const [first, second] = layout.lanes
    expect(layout.bracket).toMatchObject({ x1: second?.x, x2: first?.x })
    expect(layout.bracket?.y).toBeGreaterThan(first?.y ?? Infinity)
    expect(layout.bracket?.y).toBeLessThan(second?.y ?? 0)
  })

  it('brackets from the left mark to the right whichever sport leads', () => {
    const layout = scaleLayout(model([run(52), ride(64, 58, 70)]), 1000)
    const [first, second] = layout.lanes
    expect(layout.bracket?.x1).toBe(first?.x)
    expect(layout.bracket?.x2).toBe(second?.x)
  })

  it('has no bracket when both sports sit at one grade, since there is no span to bracket', () => {
    expect(scaleLayout(model([run(60), ride(60, 55, 64)], false), 1000).bracket).toBeNull()
  })

  it('writes the gap beside the bracket on one line, or under its figure when the width is short', () => {
    const wide = scaleLayout(SAMPLE, 1000).gap!
    expect(wide.noteText).toBe('toward running · 90% range 1 to 12 points')
    expect(wide.note!.y).toBeLessThan(wide.figure.y)
    const narrow = scaleLayout(SAMPLE, 334).gap!
    expect(narrow.noteText).not.toBe(wide.noteText)
    // Stacked: the note sits under the figure, at its left.
    expect(narrow.note!.y).toBeGreaterThan(narrow.figure.y - 1)
    expect(narrow.note!.x).toBe(narrow.figure.x)
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

  it('labels the ghost beside its ring where there is room, and leaves the label to the page where there is none', () => {
    expect(scaleLayout(SAMPLE, 1000).ghost?.label).not.toBeNull()
    expect(scaleLayout(SAMPLE, 334).ghost?.label).toBeNull()
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

  it('puts the run’s grade beside its dot, and the ride’s beside or under its band, never over a mark', () => {
    const layout = scaleLayout(SAMPLE, 1000)
    const [first] = layout.lanes
    expect(first?.pct.anchor).toBe('start')
    expect(first?.pct.x ?? 0).toBeGreaterThan(first?.x ?? Infinity)
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

  it('draws the one mark, with no bracket, no gap and no ghost', () => {
    const layout = scaleLayout(alone, 1000)
    expect(layout.lanes).toHaveLength(1)
    expect(layout.lanes[0]).toMatchObject({ sport: 'run', kind: 'dot', band: null })
    expect(layout.bracket).toBeNull()
    expect(layout.gap).toBeNull()
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

describe('scaleLayout gap label at the narrowest', () => {
  // A one point gap and a ride band that spans the run's grade leave no clear space for the note at 270 px.
  const tight = model([run(63), ride(62, 52, 74)], false)

  it('keeps the figure and drops the note when nothing is clear of the other text, never overlapping it', () => {
    const { gap, boxes } = scaleLayout(tight, 270)
    expect(gap?.figure.x).toBeGreaterThanOrEqual(0)
    boxes.forEach((box, index) => {
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(box.x + box.w).toBeLessThanOrEqual(271)
      for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false)
    })
  })
})
