import { describe, expect, it } from 'vitest'
import type { ScaleLane } from '../ui/pages/balanceScaleModel'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS } from './cardLayout'
import { SCALE_HEIGHT, cardScaleGeometry } from './cardScale'
import type { ShareScale } from './cardScale'
import { cardModel, draw, render } from './fixtures'

const RUN: ScaleLane = {
  sport: 'run',
  centre: 64,
  low: null,
  high: null,
  level: 'Local',
  basis: 'recorded',
  effort: '6:37 /mi',
  pct: '64%',
  sub: '',
  subShort: '',
  rangeLow: null,
  rangeHigh: null,
}
const RIDE: ScaleLane = {
  sport: 'ride',
  centre: 58,
  low: 52,
  high: 63,
  level: 'Recreational to Local',
  basis: 'estimated',
  effort: '246 W',
  pct: '58%',
  sub: '',
  subShort: '',
  rangeLow: '52',
  rangeHigh: '63%',
}
const SCALE: ShareScale = {
  lanes: [RUN, RIDE],
  gap: {
    figure: '6 pts',
    note: 'toward running · 90% range 1 to 12 points',
    noteShort: 'range 1 to 12 points',
    noteTiny: 'range 1 to 12',
  },
  target: null,
  description: '',
  rows: [],
}

/** The card's canvas text, half an em a character, as the recording context measures it. */
const measure = (text: string, style: { size: number }) => text.length * style.size * 0.5

function overlap(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('cardScaleGeometry', () => {
  const geometry = cardScaleGeometry(SCALE, 920, measure)

  it('fits the axis to the data and names the bands it shows, neutral and in order', () => {
    expect(geometry.bands.map((band) => [band.name, band.level])).toEqual([
      ['Recreational', 1],
      ['Local', 2],
      ['Regional', 3],
    ])
    expect(geometry.ticks.map((tick) => tick.text)).toEqual(['40%', '50%', '60%', '70%', '80%'])
  })

  it('makes the run a dot and the ride a ring over a band, at the grades’ own places', () => {
    const [run, ride] = geometry.lanes
    expect(run).toMatchObject({ sport: 'run', kind: 'dot', band: null })
    expect(ride).toMatchObject({ sport: 'ride', kind: 'ring' })
    // A 40 to 80 axis across 920 px is 23 px a point.
    expect(run?.x).toBeCloseTo((64 - 40) * 23)
    expect(ride?.x).toBeCloseTo((58 - 40) * 23)
    expect(ride?.band?.x1).toBeCloseTo((52 - 40) * 23)
    expect(ride?.band?.x2).toBeCloseTo((63 - 40) * 23)
  })

  it('brackets the gap from the ride’s mark to the run’s, between the lanes', () => {
    const [run, ride] = geometry.lanes
    expect(geometry.bracket).toMatchObject({ x1: ride?.x, x2: run?.x })
    expect(geometry.bracket!.y).toBeGreaterThan(run!.y)
    expect(geometry.bracket!.y).toBeLessThan(ride!.y)
    expect(geometry.gap.text).toBe('6 PTS')
  })

  it.each([840, 920])(
    'keeps every text box inside the width and clear of the others at %i px',
    (width) => {
      for (const lanes of [
        [RUN, RIDE],
        [
          { ...RUN, centre: 52 },
          { ...RIDE, centre: 64, low: 58, high: 70 },
        ],
        [
          { ...RUN, centre: 90 },
          { ...RIDE, centre: 82, low: 74, high: 88 },
        ],
      ]) {
        const { boxes } = cardScaleGeometry({ ...SCALE, lanes }, width, measure)
        boxes.forEach((box, index) => {
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.w).toBeLessThanOrEqual(width)
          for (const other of boxes.slice(index + 1)) expect(overlap(box, other)).toBe(false)
        })
      }
    },
  )

  it('has no bracket when the sports sit at one grade', () => {
    const level = cardScaleGeometry(
      { ...SCALE, lanes: [RUN, { ...RIDE, centre: 64, low: 60, high: 68 }] },
      920,
      measure,
    )
    expect(level.bracket).toBeNull()
  })
})

describe('the card’s level scale', () => {
  // As the card is built with a scale: no magnitude line, and no grade line under a hero.
  const base = cardModel()
  const scaled = cardModel({
    scale: SCALE,
    magnitude: null,
    meter: null,
    heroes: base.heroes.map((hero) => Object.assign({}, hero, { grade: null })),
  })

  it.each(['square', 'story'] as const)(
    'is drawn in place of the meter on the %s card',
    (format) => {
      const { ok, ctx } = render(scaled, format)
      expect(ok).toBe(true)
      const drawn = ctx.texts.map((text) => text.text)
      expect(drawn).toEqual(
        expect.arrayContaining(['64%', '58%', 'Local', 'Recreational to Local', '6 PTS']),
      )
      expect(drawn).toEqual(expect.arrayContaining(['RECREATIONAL', '40%', '80%']))
      expect(drawn).not.toContain('Even')
    },
  )

  it('paints each level a neutral wash, and a sport colour only on that sport’s own marks', () => {
    const { rects } = draw(scaled)
    const washes = [CARD_COLORS.level1, CARD_COLORS.level2, CARD_COLORS.level3].map((colour) =>
      rects.some((rect) => rect.color === colour && rect.h > 200),
    )
    expect(washes).toEqual([true, true, true])
    // No wash is a sport's colour.
    for (const wash of [CARD_COLORS.level1, CARD_COLORS.level2, CARD_COLORS.level3]) {
      expect([CARD_COLORS.run, CARD_COLORS.ride]).not.toContain(wash)
    }
  })

  it('draws the run as a solid dot and the ride as a hollow ring over a half-opaque band', () => {
    const { paths } = draw(scaled)
    const arcFill = (colour: string) =>
      paths.some(
        (path) =>
          path.op === 'fill' &&
          path.color === colour &&
          path.alpha === 1 &&
          path.segments.includes('arc'),
      )
    expect(arcFill(CARD_COLORS.run)).toBe(true)
    // The ride's ring is filled with the card's ink, so it is hollow, and edged in the ride colour.
    expect(arcFill(CARD_COLORS.ride)).toBe(false)
    expect(
      paths.some(
        (path) =>
          path.op === 'stroke' &&
          path.color === CARD_COLORS.ride &&
          path.width === 7 &&
          path.segments.includes('arc'),
      ),
    ).toBe(true)
    expect(
      paths.some((path) => path.op === 'fill' && path.color === CARD_COLORS.ride && path.alpha < 1),
    ).toBe(true)
  })

  it('fits on both shapes with the scale and a caveat and an origin, shedding lines rather than overlapping', () => {
    for (const format of ['square', 'story'] as const) {
      expect(render(scaled, format).ok, format).toBe(true)
    }
  })

  it('keeps every drawn line inside the margins', () => {
    const layout = CARD_FORMATS.square
    for (const text of draw(scaled).texts) {
      expect(text.x).toBeGreaterThanOrEqual(layout.marginX - 1)
      expect(text.x + text.width).toBeLessThanOrEqual(layout.width - layout.marginX + 1)
    }
  })

  it('takes a fixed height, so the blocks around it place the same each time', () => {
    expect(SCALE_HEIGHT).toBeGreaterThan(200)
    expect(SCALE_HEIGHT).toBeLessThan(340)
  })

  it('captions the bracket with the 90% range, beside the gap figure, in secondary text', () => {
    const { texts } = draw(
      cardModel({
        scale: SCALE,
        magnitude: null,
        meter: null,
        heroes: cardModel().heroes.map((hero) => Object.assign({}, hero, { grade: null })),
      }),
    )
    const figure = texts.find((text) => text.text === '6 PTS')
    const caption = texts.find((text) => text.text.startsWith('range 1 to 12'))
    expect(figure).toBeDefined()
    expect(caption).toBeDefined()
    expect(caption?.color).toBe(CARD_COLORS.secondary)
    // Beside the figure, after it, on its row.
    expect(caption!.x).toBeGreaterThan(figure!.x + figure!.width)
    expect(Math.abs(caption!.y - figure!.y)).toBeLessThan(20)
  })

  it('keeps the caption inside the geometry’s boxes and clear of the other text', () => {
    const geometry = cardScaleGeometry(SCALE, 920, measure)
    expect(geometry.gap.note).toMatch(/^range 1 to 12/)
    expect(geometry.gap.noteX).toBeGreaterThan(geometry.gap.x)
  })

  it('drops the caption, keeping the figure, where the row has no room for both', () => {
    const tight = cardScaleGeometry(
      {
        ...SCALE,
        gap: {
          ...SCALE.gap,
          noteShort: 'range 1 to 12 points and a great many more words than fit a row',
          noteTiny: 'range 1 to 12 and a great many more words than fit a row of the card',
        },
      },
      920,
      measure,
    )
    expect(tight.gap.note).toBeNull()
    expect(tight.gap.text).toBe('6 PTS')
  })
})
