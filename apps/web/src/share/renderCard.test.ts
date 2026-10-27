import { describe, expect, it } from 'vitest'
import { energyReading, gapReading, meterFraction } from '../ui/components/balanceScale'
import { interval } from '../ui/components/fixtures'
import { SPORT_LABEL, SPORT_ORDER } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import { BAND_OPACITY, DOT_RADIUS } from './cardMeter'
import {
  FakeContext,
  LONG_CAVEAT,
  LONG_FOOTNOTE,
  LONG_GRADE,
  LONG_HEADLINE,
  LONG_MAGNITUDE,
  MAGNITUDE,
  RIDE_GRADE,
  RUN_GRADE,
  cardModel,
  draw,
  fakeCanvas,
  render,
  type RecordedText,
} from './fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
const GRADED_FOOTNOTE = 'Graded on the USATF road standards. A level, not a ranking.'

/** The drawn text, in order, as one string. */
function words(texts: RecordedText[]): string {
  return texts.map((text) => text.text).join(' ')
}

/** The headline's lines: capital letters in the extra-bold condensed face. */
function isHeadline(text: RecordedText): boolean {
  return (
    text.font.startsWith('800 ') && /[A-Z]/.test(text.text) && text.text === text.text.toUpperCase()
  )
}

describe('renderShareCard', () => {
  it.each([
    ['square', 1080, 1080],
    ['story', 1080, 1920],
  ] as const)('sizes the canvas for the %s shape, %i by %i', (format, width, height) => {
    const canvas = fakeCanvas(new FakeContext())
    renderShareCard(cardModel(), canvas as unknown as HTMLCanvasElement, format)
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width, height })
  })

  it('returns false and draws nothing when the canvas has no 2D context', () => {
    const canvas = fakeCanvas(null)
    expect(renderShareCard(cardModel(), canvas as unknown as HTMLCanvasElement, 'square')).toBe(
      false,
    )
  })

  it.each(FORMATS)('draws every element of the %s card', (format) => {
    const drawn = words(draw(cardModel({ badge: 'Sample data' }), format).texts)
    for (const expected of [
      'RunningCyclingAnalysis',
      'Sample data',
      'YOUR BALANCE LEANS TOWARD RUNNING',
      SPORT_LABEL[SPORT_ORDER[0]],
      'Even',
      SPORT_LABEL[SPORT_ORDER[1]],
      'THRESHOLD FLAT PACE, ESTIMATED FROM YOUR BEST 3 TO 20 MIN',
      '21:35',
      '/km',
      'THRESHOLD POWER, ESTIMATED FROM YOUR BEST 3 TO 20 MIN',
      '48',
      'W',
      '0.6 W/kg',
      'Last 6 weeks',
      'Best efforts over 20 min may not have been your hardest.',
      GRADED_FOOTNOTE,
      'example.test',
      MAGNITUDE,
      RUN_GRADE,
      RIDE_GRADE,
    ]) {
      expect(drawn).toContain(expected)
    }
  })

  it.each(FORMATS)(
    'draws the brand mark, the balance and the sport edges on the %s card',
    (format) => {
      const ctx = draw(cardModel(), format)
      const curves = (colour: string) =>
        ctx.paths.some(
          (path) =>
            path.op === 'stroke' &&
            path.color === colour &&
            path.segments.includes('bezierCurveTo'),
        )
      expect(curves(CARD_COLORS.run)).toBe(true)
      expect(curves(CARD_COLORS.ride)).toBe(true)
      expect(
        ctx.paths.some(
          (path) =>
            path.op === 'fill' && path.color === CARD_COLORS.run && path.alpha === BAND_OPACITY,
        ),
      ).toBe(true)
      expect(
        ctx.paths.some(
          (path) =>
            path.op === 'fill' && path.color === CARD_COLORS.run && path.segments.includes('arc'),
        ),
      ).toBe(true)
      expect(ctx.rects).toContainEqual(expect.objectContaining({ w: 8, color: CARD_COLORS.run }))
      expect(ctx.rects).toContainEqual(expect.objectContaining({ w: 8, color: CARD_COLORS.ride }))
    },
  )

  it.each(FORMATS)(
    'draws each sport’s glyph in the text colour, beside its label, on the %s card',
    (format) => {
      const ctx = draw(cardModel(), format)
      // A glyph's dots are arcs, so one sits in the inset left of its label's first line.
      const glyphBeside = (labelStart: string) => {
        const label = ctx.texts.find((text) => text.text.startsWith(labelStart))
        if (label === undefined) throw new Error(`no label starting ${labelStart}`)
        return ctx.arcs.some(
          (arc) =>
            arc.x >= label.x - 40 && arc.x < label.x && arc.y >= label.y && arc.y < label.y + 34,
        )
      }
      expect(glyphBeside('THRESHOLD FLAT PACE,')).toBe(true)
      expect(glyphBeside('THRESHOLD POWER')).toBe(true)
      expect(
        ctx.paths.some((path) => path.color === CARD_COLORS.text && path.segments.includes('arc')),
      ).toBe(true)
    },
  )

  it('draws the sample badge only when the model has one', () => {
    expect(words(draw(cardModel({ badge: null })).texts)).not.toContain('Sample data')
    expect(words(draw(cardModel({ badge: 'Sample data' })).texts)).toContain('Sample data')
  })

  it('omits the caveat and the origin when the model has none', () => {
    const drawn = words(draw(cardModel({ caveat: null, origin: '' })).texts)
    expect(drawn).not.toContain('Best efforts')
    expect(drawn).not.toContain('https://example.test')
    expect(drawn).toContain('Last 6 weeks')
  })

  it('sets the hero columns side by side on a square and one above the other on a story', () => {
    const square = draw(cardModel(), 'square').texts
    const story = draw(cardModel(), 'story').texts
    const at = (texts: RecordedText[], text: string) => texts.find((t) => t.text === text)?.y
    expect(at(square, '21:35')).toBe(at(square, '48'))
    expect(at(story, '48') ?? 0).toBeGreaterThan(at(story, '21:35') ?? Infinity)
  })

  it('lines the figures up side by side when one hero label wraps to two lines and the other to one', () => {
    const heroes = cardModel().heroes
    const run = heroes[0]
    const ride = heroes[1]
    if (run === undefined || ride === undefined) throw new Error('The card has two heroes')
    const texts = draw(cardModel({ heroes: [run, { ...ride, label: 'Power' }] }), 'square').texts
    // The run's label wraps to a second line; the ride's short label is one line, POWER.
    expect(texts.some((text) => text.text === 'FROM YOUR BEST 3 TO 20 MIN')).toBe(true)
    expect(texts.filter((text) => text.text === 'POWER')).toHaveLength(1)
    const figureY = (figure: string) => texts.find((text) => text.text === figure)?.y
    expect(figureY('21:35')).toBeDefined()
    expect(figureY('21:35')).toBe(figureY('48'))
  })

  it('steps the headline down until it fits on two lines of a square', () => {
    const headline = draw(cardModel()).texts.filter(isHeadline)
    expect(headline.map((text) => text.text)).toEqual(['YOUR BALANCE LEANS', 'TOWARD RUNNING'])
    expect(new Set(headline.map((text) => text.size))).toEqual(new Set([88]))
  })

  it.each(FORMATS)(
    'cuts a headline too long for two lines, at the smallest size, on the %s card',
    (format) => {
      const headline = draw(cardModel({ headline: LONG_HEADLINE }), format).texts.filter(isHeadline)
      const smallest = Math.min(...CARD_FORMATS[format].headline)
      expect(new Set(headline.map((text) => text.y)).size).toBe(2)
      expect(headline.every((text) => text.size === smallest)).toBe(true)
      expect(headline[1]?.text.endsWith('…')).toBe(true)
    },
  )

  it.each(FORMATS)(
    'keeps every line inside the margins on the %s card, even with long text',
    (format) => {
      const { width, height, marginX, marginY } = CARD_FORMATS[format]
      const ctx = draw(
        cardModel({
          headline: LONG_HEADLINE,
          footnote: LONG_FOOTNOTE,
          caveat: LONG_CAVEAT,
        }),
        format,
      )
      expect(ctx.texts.length).toBeGreaterThan(0)
      for (const text of ctx.texts) {
        expect(text.x).toBeGreaterThanOrEqual(marginX)
        expect(text.x + text.width).toBeLessThanOrEqual(width - marginX)
        expect(text.y + text.size).toBeLessThanOrEqual(height - marginY)
      }
    },
  )

  it.each(FORMATS)('spreads the content down to the bottom margin on the %s card', (format) => {
    const { height, marginY } = CARD_FORMATS[format]
    const lowest = Math.max(...draw(cardModel(), format).texts.map((text) => text.y + text.size))
    expect(lowest).toBeGreaterThanOrEqual(height - marginY - 40)
  })

  it('places the balance dot where the shared balance scale places its lead', () => {
    const centre = cardModel().meter?.lead.centre ?? 0
    const dot = draw(cardModel()).arcs.find((arc) => arc.r === DOT_RADIUS)
    expect(dot?.x).toBeCloseTo(80 + meterFraction(centre) * 920, 6)
  })
})

describe('the balance meter on the card', () => {
  it('outlines the track in muted ink, and the band in its leading sport colour', () => {
    const ctx = draw(cardModel())
    expect(ctx.paths).toContainEqual(
      expect.objectContaining({ op: 'stroke', color: CARD_COLORS.muted }),
    )
    expect(ctx.paths).toContainEqual(
      expect.objectContaining({ op: 'stroke', color: CARD_COLORS.run }),
    )
  })

  it('marks a running lead past the scale with "30+" just after the running label', () => {
    const meter = gapReading({ centre: 40, low: 34, high: 46, lean: 'run' })
    const texts = draw(cardModel({ meter })).texts
    const label = texts.find((text) => text.text === SPORT_LABEL.run)
    const mark = texts.find((text) => text.text === '30+')
    expect(mark?.x).toBeGreaterThan(label?.x ?? Number.NaN)
  })

  it('marks a cycling lead past the scale with "30%+" just before the cycling label, in percent', () => {
    const meter = energyReading(interval(0.5, 0.6, 0.7))
    const texts = draw(cardModel({ meter })).texts
    const label = texts.find((text) => text.text === SPORT_LABEL.ride)
    const mark = texts.find((text) => text.text === '30%+')
    expect(mark?.x).toBeLessThan(label?.x ?? Number.NaN)
  })

  it('does not mark a lead inside the scale', () => {
    expect(words(draw(cardModel()).texts)).not.toMatch(/30/)
  })

  it('places the first sport on the left, then Even, then the other sport', () => {
    const texts = draw(cardModel()).texts
    const left = texts.find((text) => text.text === SPORT_LABEL[SPORT_ORDER[0]])
    const even = texts.find((text) => text.text === 'Even')
    const right = texts.find((text) => text.text === SPORT_LABEL[SPORT_ORDER[1]])
    expect(left?.x).toBeLessThan(even?.x ?? Number.NaN)
    expect(even?.x).toBeLessThan(right?.x ?? Number.NaN)
  })

  it.each(FORMATS)('draws the band at half opacity, the dot in full, on the %s card', (format) => {
    const fills = draw(cardModel(), format).paths.filter(
      (path) => path.op === 'fill' && path.color === CARD_COLORS.run,
    )
    expect(fills.map((path) => path.alpha)).toEqual(expect.arrayContaining([BAND_OPACITY, 1]))
    expect(BAND_OPACITY).toBeGreaterThanOrEqual(0.5)
  })

  it.each(FORMATS)('sets the meter labels at 34 px or more on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    for (const label of [SPORT_LABEL[SPORT_ORDER[0]], 'Even', SPORT_LABEL[SPORT_ORDER[1]]]) {
      expect(texts.find((text) => text.text === label)?.size).toBeGreaterThanOrEqual(34)
    }
  })
})

describe('the card figures, levels and copy', () => {
  it.each(FORMATS)(
    'sets both figures in text colour, never a sport colour, on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      for (const figure of ['21:35', '48']) {
        expect(texts.find((text) => text.text === figure)?.color).toBe(CARD_COLORS.text)
      }
    },
  )

  it.each(FORMATS)('draws each level under its figure on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    const figure = texts.find((text) => text.text === '21:35')
    const level = texts.find((text) => text.text === RUN_GRADE)
    expect(level).toBeDefined()
    expect(level?.y ?? 0).toBeGreaterThan(figure?.y ?? Number.POSITIVE_INFINITY)
  })

  it.each(FORMATS)('draws the magnitude line under the headline on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    const headlineLines = texts.filter(isHeadline)
    const magnitude = texts.find((text) => text.text.startsWith('Running grades'))
    expect(magnitude?.y ?? 0).toBeGreaterThan(Math.max(...headlineLines.map((line) => line.y)))
  })

  it.each(FORMATS)(
    'draws the caveat as a quiet starred line in secondary text on the %s card',
    (format) => {
      const caveat = draw(cardModel(), format).texts.find((text) => text.text.startsWith('* Best'))
      expect(caveat?.color).toBe(CARD_COLORS.secondary)
    },
  )

  it.each(FORMATS)('sets the footnote and origin at 30 px or more on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    expect(texts.find((text) => text.text.startsWith('Graded on'))?.size).toBeGreaterThanOrEqual(30)
    expect(texts.find((text) => text.text === 'example.test')?.size).toBeGreaterThanOrEqual(30)
  })

  it.each([
    ['square', 48],
    ['story', 72],
  ] as const)('draws the brand mark at %s size, %i px', (format, mark) => {
    expect(CARD_FORMATS[format].mark).toBe(mark)
    const strokes = draw(cardModel(), format).paths.filter(
      (path) =>
        path.op === 'stroke' &&
        path.color === CARD_COLORS.run &&
        path.segments.includes('bezierCurveTo'),
    )
    expect(strokes.length).toBeGreaterThan(0)
    for (const stroke of strokes) expect(stroke.width).toBeCloseTo((3 * mark) / 32, 6)
  })

  it.each(FORMATS)('sets the app name in the volt brand colour on the %s card', (format) => {
    const name = draw(cardModel(), format).texts.find(
      (text) => text.text === 'RunningCyclingAnalysis',
    )
    expect(name?.color).toBe(CARD_COLORS.brand)
  })

  it.each(FORMATS)(
    'draws the run’s threshold label whole, flat pace included, on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel(), format)
      expect(ok).toBe(true)
      expect(words(ctx.texts)).toContain(
        'THRESHOLD FLAT PACE, ESTIMATED FROM YOUR BEST 3 TO 20 MIN',
      )
    },
  )

  it.each(FORMATS)(
    'fits the card with its magnitude, grades and caveat on the %s card',
    (format) => {
      expect(render(cardModel(), format).ok).toBe(true)
    },
  )

  it.each(FORMATS)(
    'still fits, with every line at its longest, and keeps the caveat on the %s card',
    (format) => {
      const base = cardModel()
      const model = cardModel({
        headline: LONG_HEADLINE,
        magnitude: LONG_MAGNITUDE,
        caveat: LONG_CAVEAT,
        footnote: LONG_FOOTNOTE,
        heroes: base.heroes.map((hero) => Object.assign(hero, { grade: LONG_GRADE })),
      })
      const { ok, ctx } = render(model, format)
      expect(ok).toBe(true)
      expect(words(ctx.texts)).toContain(LONG_CAVEAT.slice(0, 20))
    },
  )
})

describe('the name on the card', () => {
  // The name sits in the brand row, small, so it adds no height and the card keeps its size.
  it.each(FORMATS)('draws the name small, in the brand row, on the %s card', (format) => {
    const { ok, ctx } = render(cardModel({ name: 'Bryce Capuano' }), format)
    const { marginY, mark } = CARD_FORMATS[format]
    expect(ok).toBe(true)
    const name = ctx.texts.find((text) => text.text === 'Bryce Capuano')
    expect(name?.size).toBe(24)
    expect(name?.color).toBe(CARD_COLORS.secondary)
    expect(name?.y).toBeGreaterThanOrEqual(marginY)
    expect(name?.y).toBeLessThan(marginY + mark)
  })

  it('draws nothing extra when the card has no name, so it stays as it was', () => {
    const without = render(cardModel({ name: null })).ctx
    expect(without.texts.some((text) => text.size === 24)).toBe(false)
    expect(words(without.texts)).toBe(words(render(cardModel()).ctx.texts))
  })

  it('keeps a long name to one line that ends inside the card, so the row never runs off it', () => {
    const long = 'Bryce Capuano and a very long set of family names that goes on'
    const { ok, ctx } = render(cardModel({ name: long, badge: 'Sample athlete' }))
    expect(ok).toBe(true)
    const { marginY, mark } = CARD_FORMATS.square
    const names = ctx.texts.filter((text) => text.size === 24 && text.y < marginY + mark)
    const shown = names.filter((text) => text.text !== 'Sample athlete')
    expect(shown).toHaveLength(1)
    expect(shown[0]?.text.endsWith('…')).toBe(true)
    const badge = ctx.texts.find((text) => text.text === 'Sample athlete')
    expect((shown[0]?.x ?? 0) + (shown[0]?.width ?? 0)).toBeLessThan(badge?.x ?? 0)
    expect((badge?.x ?? 0) + (badge?.width ?? 0)).toBeLessThanOrEqual(
      CARD_FORMATS.square.width - CARD_FORMATS.square.marginX,
    )
  })
})

describe('a name too long for its slot', () => {
  const TITLE = 'RunningCyclingAnalysis'
  // Each character is 16 px wide, a realistic width for the name's 24 px face. The fake canvas would
  // measure these 40 letters as narrower than the row, so the canvas is given this measure instead.
  it.each([null, 'Sample athlete'])(
    'ends an unbroken name in an ellipsis and keeps it right of the app name, with badge %s',
    (badge) => {
      const ctx = new FakeContext()
      ctx.measureText = (text: string) => ({ width: text.length * 16 })
      const ok = renderShareCard(
        cardModel({ name: 'A'.repeat(40), badge }),
        fakeCanvas(ctx) as unknown as HTMLCanvasElement,
        'square',
      )
      expect(ok).toBe(true)
      const title = ctx.texts.find((text) => text.text === TITLE)
      const name = ctx.texts.find((text) => text.size === 24 && text.text.startsWith('AAA'))
      expect(name?.text.endsWith('…')).toBe(true)
      expect(name?.x ?? 0).toBeGreaterThanOrEqual((title?.x ?? 0) + (title?.width ?? 0))
      if (badge !== null) {
        const pill = ctx.texts.find((text) => text.text === badge)
        expect((name?.x ?? 0) + (name?.width ?? 0)).toBeLessThanOrEqual(pill?.x ?? 0)
      }
    },
  )

  it('cuts an emoji name by code point, so no emoji is left half cut', () => {
    const { ok, ctx } = render(cardModel({ name: '😀'.repeat(40) }))
    expect(ok).toBe(true)
    const name = ctx.texts.find((text) => text.size === 24 && text.text.includes('😀'))
    expect(name?.text.endsWith('…')).toBe(true)
    expect(name?.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    )
  })
})
