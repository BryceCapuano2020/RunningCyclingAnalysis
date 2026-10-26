import { describe, expect, it } from 'vitest'
import { energyReading, gapReading, meterFraction } from '../ui/components/balanceScale'
import { interval } from '../ui/components/fixtures'
import { SPORT_LABEL, SPORT_ORDER } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import { DOT_RADIUS } from './cardMeter'
import {
  FakeContext,
  LONG_CAVEAT,
  LONG_FOOTNOTE,
  LONG_HEADLINE,
  cardModel,
  draw,
  fakeCanvas,
  missingRideModel,
  type RecordedText,
} from './fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']

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
      'RUNNING THRESHOLD PACE',
      '21:35',
      '/km',
      'CYCLING THRESHOLD POWER',
      '48',
      'W',
      '0.6 W/kg',
      'Last 6 weeks',
      'Best efforts over 20 min may not have been all-out.',
      'Estimated from my own files. Compares my two sports; not a ranking.',
      'https://example.test',
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
        ctx.paths.some((path) => path.op === 'fill' && path.color === CARD_COLORS.runSoft),
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

  it.each(FORMATS)(
    'shows the available sport and a prompt for the other on the %s card',
    (format) => {
      const ctx = draw(missingRideModel(), format)
      const drawn = words(ctx.texts)
      expect(drawn).toContain('YOUR RUNNING SO FAR')
      expect(drawn).toContain('21:35')
      expect(drawn).toContain('CYCLING THRESHOLD POWER')
      expect(drawn).toContain('Add rides to see the balance')
      expect(drawn).not.toContain('48')
      expect(drawn).not.toContain('Even')
      expect(ctx.rects).toContainEqual(expect.objectContaining({ w: 8, color: CARD_COLORS.rule }))
    },
  )

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
})
