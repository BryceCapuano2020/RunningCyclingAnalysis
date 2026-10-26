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
      'THRESHOLD PACE, ESTIMATED FROM YOUR BEST 3 TO 20 MIN',
      '21:35',
      '/km',
      'THRESHOLD POWER, ESTIMATED FROM YOUR BEST 3 TO 20 MIN',
      '48',
      'W',
      '0.6 W/kg',
      'Last 6 weeks',
      'Best efforts over 20 min may not have been all-out.',
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
