import { describe, expect, it } from 'vitest'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import {
  FakeContext,
  LONG_FOOTNOTE,
  LONG_HEADLINE,
  cardModel,
  draw,
  fakeCanvas,
  type RecordedText,
} from './test/fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
/** The footer: the period's dates on one line, the standards on the next, as metadata. */
const DATES = '12 MAY – 3 AUG 2025'
const SOURCES = 'GRADED ON USATF ROAD STANDARDS.'

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
    for (const expected of [
      'RunningCyclingAnalysis',
      'SAMPLE DATA',
      'Your athletic balance',
      'RUNNING',
      '64%',
      'Local',
      'LIFTING',
      'No grade yet',
      'HALF-MARATHON',
      '1:42:30',
      '255',
      'W',
      '3.4 W/kg',
      'BIG THREE TOTAL',
      '380',
      'kg',
      DATES,
      SOURCES,
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

  it.each(FORMATS)('sets the answer in the serif, in sentence case, on the %s card', (format) => {
    const lines = draw(cardModel(), format).texts.filter(isHeadline)
    expect(lines.map((line) => line.text).join(' ')).toBe('Your athletic balance')
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines.every((line) => line.color === CARD_COLORS.ink)).toBe(true)
  })

  it.each(FORMATS)('sets every figure and date in the mono on the %s card', (format) => {
    const texts = draw(cardModel(), format).texts
    for (const figure of ['1:42:30', '255', '380', '3.4 W/kg', DATES, SOURCES]) {
      expect(find(texts, figure).font).toContain('IBM Plex Mono')
    }
    expect(find(texts, '1:42:30').font.startsWith('500 ')).toBe(true)
  })

  it.each(FORMATS)(
    'sets the figures in ink and the sports’ inks only on the triangle’s corners and dots on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      for (const figure of ['1:42:30', '255', '380']) {
        expect(find(texts, figure).color).toBe(CARD_COLORS.ink)
      }
      expect(find(texts, 'RUNNING').color).toBe(CARD_COLORS.run)
      expect(find(texts, 'CYCLING').color).toBe(CARD_COLORS.ride)
      expect(find(texts, 'LIFTING').color).toBe(CARD_COLORS.lift)
      for (const label of ['HALF-MARATHON', 'BIG THREE TOTAL']) {
        expect(find(texts, label).color).toBe(CARD_COLORS.secondary)
        expect(find(texts, label).font).toContain('IBM Plex Mono')
      }
    },
  )

  it('draws the sample label only when the model has one', () => {
    expect(words(draw(cardModel({ badge: null })).texts)).not.toContain('SAMPLE')
    expect(words(draw(cardModel({ badge: 'Sample data' })).texts)).toContain('SAMPLE DATA')
  })

  it('omits the origin when the model has none, and draws no caveat in any case', () => {
    const drawn = words(draw(cardModel({ origin: '' }), 'story').texts)
    expect(drawn).not.toContain('example.test')
    expect(drawn).not.toMatch(/did not reach|\* /)
    expect(drawn).toContain(DATES)
    expect(drawn).toContain(SOURCES)
  })

  it.each(FORMATS)(
    'sets the three figures side by side, in equal columns, on one baseline, on the %s card',
    (format) => {
      const { width, marginX } = CARD_FORMATS[format]
      const texts = draw(cardModel(), format).texts
      const figures = ['1:42:30', '255', '380'].map((figure) => find(texts, figure))
      expect(new Set(figures.map((figure) => figure.y)).size).toBe(1)
      const [run, ride, lift] = figures.map((figure) => figure.x)
      expect(run).toBe(marginX)
      expect(run! < ride! && ride! < lift!).toBe(true)
      expect(ride! - run!).toBeCloseTo(lift! - ride!)
      // The last column ends at the right margin: three columns and two gaps fill the width.
      const columnWidth = ride! - run! - 40
      expect(lift! + columnWidth).toBeCloseTo(width - marginX)
    },
  )

  it.each(FORMATS)(
    'sets each name above its figure, a long one on two lines, the names level on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      expect(find(texts, 'HALF-MARATHON').y).toBe(find(texts, 'BIG THREE TOTAL').y)
      const power = texts.filter((text) => /FUNCTIONAL|THRESHOLD|POWER/.test(text.text))
      expect(power).toHaveLength(2)
      expect(power.map((line) => line.text).join(' ')).toBe('FUNCTIONAL THRESHOLD POWER')
      expect(power[0]!.y).toBe(find(texts, 'HALF-MARATHON').y)
      for (const figure of ['1:42:30', '255', '380']) {
        expect(find(texts, figure).y).toBeGreaterThan(power[1]!.y)
      }
    },
  )

  it.each(FORMATS)(
    'keeps two columns of half the width with no lifting figure on the %s card',
    (format) => {
      const { width, marginX } = CARD_FORMATS[format]
      const two = cardModel().heroes.slice(0, 2)
      const texts = draw(cardModel({ heroes: two }), format).texts
      expect(find(texts, '255').x).toBeCloseTo(marginX + (width - 2 * marginX - 40) / 2 + 40)
      expect(texts.some((text) => text.text === 'BIG THREE TOTAL')).toBe(false)
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
