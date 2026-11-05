import { describe, expect, it } from 'vitest'
import { energyReading, gapReading, meterFraction } from '../ui/components/balanceScale'
import { interval } from '../ui/components/fixtures'
import { meterRange, meterValue } from '../ui/components/meterReading'
import { BALANCE_PAIR, SPORT_TITLE } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import type { ShareHero } from './cardModel'
import {
  FakeContext,
  LONG_FOOTNOTE,
  LONG_GRADE,
  LONG_HEADLINE,
  cardModel,
  draw,
  fakeCanvas,
  type RecordedText,
} from './fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
/** The one footer line: the period's dates and the standard, as metadata. */
const FOOTER = '12 MAY – 3 AUG 2025 · AGE-GRADED ON USATF ROAD STANDARDS.'
const [LEFT, RIGHT] = BALANCE_PAIR

/** The drawn text, in order, as one string. */
function words(texts: RecordedText[]): string {
  return texts.map((text) => text.text).join(' ')
}

/** The answer's lines: the serif at 500, sentence case, at a display size. */
function isHeadline(text: RecordedText): boolean {
  return text.font.startsWith('500 ') && text.font.includes('Newsreader') && text.size >= 56
}

function find(texts: RecordedText[], text: string): RecordedText {
  const found = texts.find((candidate) => candidate.text === text)
  if (found === undefined) throw new Error(`no text ${text}`)
  return found
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
    const model = cardModel({ badge: 'Sample data' })
    const drawn = words(draw(model, format).texts)
    // The square sheds the origin first, to keep its room (renderCardFit.test.ts).
    const shed = format === 'square' ? ['example.test'] : []
    const value = meterValue(model.meter!)
    for (const expected of [
      'RunningCyclingAnalysis',
      'SAMPLE DATA',
      'Your balance leans toward running',
      SPORT_TITLE[LEFT].toUpperCase(),
      'EVEN',
      SPORT_TITLE[RIGHT].toUpperCase(),
      value.number,
      value.unit,
      `RANGE ${meterRange(model.meter!)}`.toUpperCase(),
      'RUN THRESHOLD',
      '21:35',
      '/km',
      'RIDE THRESHOLD',
      '48',
      'W',
      '0.6 W/kg',
      FOOTER,
      'example.test',
    ].filter((text) => !shed.includes(text))) {
      expect(drawn).toContain(expected)
    }
  })

  it.each(FORMATS)('draws on paper, in the system colours only, on the %s card', (format) => {
    const ctx = draw(cardModel({ badge: 'Sample data', name: 'Riley' }), format)
    const { width, height } = CARD_FORMATS[format]
    expect(ctx.rects[0]).toEqual({ x: 0, y: 0, w: width, h: height, color: CARD_COLORS.paper })
    const allowed = new Set<string>(Object.values(CARD_COLORS))
    for (const colour of [...ctx.rects, ...ctx.texts].map((drawn) => drawn.color)) {
      expect(allowed.has(colour)).toBe(true)
    }
  })

  it.each(FORMATS)('draws no mark, glyph, pill, band or dot on the %s card', (format) => {
    const ctx = draw(cardModel({ badge: 'Sample data' }), format)
    expect(ctx.paths).toEqual([])
    expect(ctx.arcs).toEqual([])
  })

  it.each(FORMATS)('sets the answer in the serif, in sentence case, on the %s card', (format) => {
    const lines = draw(cardModel(), format).texts.filter(isHeadline)
    expect(lines.map((line) => line.text).join(' ')).toBe('Your balance leans toward running')
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines.every((line) => line.color === CARD_COLORS.ink)).toBe(true)
  })

  it.each(FORMATS)('sets every figure and date in the mono on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    for (const figure of ['21:35', '48', '0.6 W/kg', FOOTER]) {
      expect(find(texts, figure).font).toContain('IBM Plex Mono')
    }
    expect(find(texts, '21:35').font.startsWith('500 ')).toBe(true)
  })

  it.each(FORMATS)(
    'sets both figures in ink and the sports’ inks only on the meter’s ends on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      for (const figure of ['21:35', '48']) expect(find(texts, figure).color).toBe(CARD_COLORS.ink)
      expect(find(texts, 'RUNNING').color).toBe(CARD_COLORS.run)
      expect(find(texts, 'CYCLING').color).toBe(CARD_COLORS.ride)
      for (const label of ['RUN THRESHOLD', 'RIDE THRESHOLD']) {
        expect(find(texts, label).color).toBe(CARD_COLORS.secondary)
        expect(find(texts, label).font).toContain('IBM Plex Mono')
      }
    },
  )

  it('draws the sample label only when the model has one', () => {
    expect(words(draw(cardModel({ badge: null })).texts)).not.toContain('SAMPLE')
    expect(words(draw(cardModel({ badge: 'Sample data' })).texts)).toContain('SAMPLE DATA')
  })

  it('omits the origin when the model has none, and draws no caveat or lead line in any case', () => {
    const drawn = words(draw(cardModel({ origin: '' }), 'story').texts)
    expect(drawn).not.toContain('example.test')
    expect(drawn).not.toMatch(/did not reach|\* |grades \d+ points/)
    expect(drawn).toContain(FOOTER)
  })

  it.each(FORMATS)('sets the hero columns side by side on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    expect(find(texts, '21:35').y).toBe(find(texts, '48').y)
    expect(find(texts, '21:35').x).toBeLessThan(find(texts, '48').x)
  })

  it.each(FORMATS)(
    'sets each threshold name on one line above its figure on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      expect(texts.filter((text) => text.text.endsWith('THRESHOLD'))).toHaveLength(2)
      expect(find(texts, 'RUN THRESHOLD').y).toBe(find(texts, 'RIDE THRESHOLD').y)
      expect(find(texts, '21:35').y).toBeGreaterThan(find(texts, 'RUN THRESHOLD').y)
    },
  )

  it.each(FORMATS)(
    'cuts a headline too long for its lines, at the smallest size, on the %s card',
    (format) => {
      const lines = draw(cardModel({ headline: LONG_HEADLINE }), format).texts.filter(isHeadline)
      const smallest = Math.min(...CARD_FORMATS[format].headline)
      const rows = CARD_FORMATS[format].headlineLines
      expect(new Set(lines.map((line) => line.y)).size).toBe(rows)
      expect(lines.every((line) => line.size === smallest)).toBe(true)
      expect(lines[rows - 1]?.text.endsWith('…')).toBe(true)
    },
  )

  it.each(FORMATS)(
    'keeps every line inside the margins on the %s card, even with long text',
    (format) => {
      const { width, height, marginX, marginY } = CARD_FORMATS[format]
      const ctx = draw(
        cardModel({ headline: LONG_HEADLINE, footnote: LONG_FOOTNOTE, name: 'A long name' }),
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
})

describe('the two sports’ levels in one line', () => {
  it.each(FORMATS)('sets name, grade and level on one line on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    const y = find(texts, 'Running').y
    for (const part of ['64%', 'Local', 'Cycling', '61%', 'Recreational']) {
      expect(find(texts, part).y).toBe(y)
    }
    expect(find(texts, '64%').font).toContain('IBM Plex Mono')
    expect(find(texts, 'Local').color).toBe(CARD_COLORS.secondary)
    expect(find(texts, 'Running').x).toBeLessThan(find(texts, 'Cycling').x)
  })

  it('puts the second sport under the first when the two do not fit side by side', () => {
    const [run, ride] = cardModel().heroes
    if (run === undefined || ride === undefined) throw new Error('The card has two heroes')
    const texts = draw(cardModel({ heroes: [run, { ...ride, grade: LONG_GRADE }] })).texts
    expect(find(texts, 'Cycling').y).toBeGreaterThan(find(texts, 'Running').y)
    expect(find(texts, 'Cycling').x).toBe(find(texts, 'Running').x)
  })

  it('leaves a sport with no grade out, and draws no line when neither has one', () => {
    const [run, ride] = cardModel().heroes
    if (run === undefined || ride === undefined) throw new Error('The card has two heroes')
    const drawn = (heroes: ShareHero[]) =>
      draw(cardModel({ heroes })).texts.map((text) => text.text)
    expect(drawn([run, { ...ride, grade: null }])).toContain('Running')
    expect(drawn([run, { ...ride, grade: null }])).not.toContain('Cycling')
    expect(
      drawn([
        { ...run, grade: null },
        { ...ride, grade: null },
      ]),
    ).not.toContain('Running')
  })
})

describe('the balance meter on the card', () => {
  const track = (ctx: FakeContext) =>
    ctx.rects.filter((rect) => rect.color === CARD_COLORS.hairline)

  it.each(FORMATS)(
    'draws a hairline track with each end upright in its sport’s ink, on the %s card',
    (format) => {
      const ctx = draw(cardModel(), format)
      const { marginX, width } = CARD_FORMATS[format]
      expect(track(ctx).some((rect) => rect.x === marginX && rect.w === width - 2 * marginX)).toBe(
        true,
      )
      const left = ctx.rects.find((rect) => rect.color === CARD_COLORS[LEFT] && rect.w === 3)
      const right = ctx.rects.find((rect) => rect.color === CARD_COLORS[RIGHT] && rect.w === 3)
      expect(left?.x).toBe(marginX)
      expect((right?.x ?? 0) + 3).toBe(width - marginX)
    },
  )

  it('places the one ink mark where the shared balance scale places its lead', () => {
    const centre = cardModel().meter?.lead.centre ?? 0
    const marks = draw(cardModel()).rects.filter(
      (rect) => rect.color === CARD_COLORS.ink && rect.w === 4,
    )
    expect(marks).toHaveLength(1)
    expect((marks[0]?.x ?? 0) + 2).toBeCloseTo(80 + meterFraction(centre) * 920, 6)
  })

  it('writes the value under the mark and its range under the value', () => {
    const texts = draw(cardModel()).texts
    const value = meterValue(cardModel().meter!)
    const range = meterRange(cardModel().meter!)
    expect(find(texts, value.number).font).toContain('IBM Plex Mono')
    expect(find(texts, `RANGE ${range}`.toUpperCase()).y).toBeGreaterThan(
      find(texts, value.number).y - 60,
    )
    expect(find(texts, `RANGE ${range}`.toUpperCase()).color).toBe(CARD_COLORS.secondary)
  })

  it('says "informed by heart rate" on the range line of an energy balance the check informed, and only there', () => {
    const line = (informedByHeartRate: boolean, meter = cardModel().meter) =>
      draw(cardModel({ informedByHeartRate, meter })).texts.find((text) =>
        text.text.startsWith('RANGE'),
      )
    expect(line(true)?.text.endsWith(' · INFORMED BY HEART RATE')).toBe(true)
    expect(line(false)?.text).not.toContain('INFORMED')
    const points = gapReading({ centre: 6, low: 2, high: 10, lean: 'run' })
    expect(line(true, points)?.text).not.toContain('INFORMED')
  })

  it('marks a running lead past the scale with "30+" just after the running label', () => {
    const meter = gapReading({ centre: 40, low: 34, high: 46, lean: 'run' })
    const texts = draw(cardModel({ meter })).texts
    expect(find(texts, '30+').x).toBeGreaterThan(find(texts, 'RUNNING').x)
  })

  it('marks a cycling lead past the scale with "30%+" just before the cycling label, in percent', () => {
    const meter = energyReading(interval(0.5, 0.6, 0.7))
    const texts = draw(cardModel({ meter })).texts
    expect(find(texts, '30%+').x).toBeLessThan(find(texts, 'CYCLING').x)
  })

  it('does not mark a lead inside the scale', () => {
    expect(words(draw(cardModel()).texts)).not.toMatch(/30/)
  })

  it('places the first sport on the left, then Even, then the other sport', () => {
    const texts = draw(cardModel()).texts
    const left = find(texts, SPORT_TITLE[LEFT].toUpperCase())
    const even = find(texts, 'EVEN')
    const right = find(texts, SPORT_TITLE[RIGHT].toUpperCase())
    expect(left.x).toBeLessThan(even.x)
    expect(even.x).toBeLessThan(right.x)
  })

  it('keeps a value at the end of the scale inside the card’s margins', () => {
    for (const lead of [40, -40]) {
      const meter = gapReading({
        centre: lead,
        low: lead - 4,
        high: lead + 4,
        lean: lead > 0 ? 'run' : 'ride',
      })
      const { texts } = draw(cardModel({ meter }))
      for (const text of texts) {
        expect(text.x).toBeGreaterThanOrEqual(80)
        expect(text.x + text.width).toBeLessThanOrEqual(1000)
      }
    }
  })
})
