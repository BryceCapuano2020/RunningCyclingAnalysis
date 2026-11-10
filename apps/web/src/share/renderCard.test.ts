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
} from './fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
/** The one footer line: the period's dates and the standard, as metadata. */
const FOOTER = '12 MAY – 3 AUG 2025 · AGE-GRADED ON USATF ROAD STANDARDS.'

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
      'Your balance leans toward running',
      'Running grades 3 points higher at threshold.',
      'RUNNING',
      '64%',
      'Local',
      'LIFTING',
      'No grade yet',
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
    'sets both figures in ink and the sports’ inks only on the triangle’s corners and dots on the %s card',
    (format) => {
      const texts = draw(cardModel(), format).texts
      for (const figure of ['21:35', '48']) expect(find(texts, figure).color).toBe(CARD_COLORS.ink)
      expect(find(texts, 'RUNNING').color).toBe(CARD_COLORS.run)
      expect(find(texts, 'CYCLING').color).toBe(CARD_COLORS.ride)
      expect(find(texts, 'LIFTING').color).toBe(CARD_COLORS.lift)
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

  it('omits the origin when the model has none, and draws no caveat in any case', () => {
    const drawn = words(draw(cardModel({ origin: '' }), 'story').texts)
    expect(drawn).not.toContain('example.test')
    expect(drawn).not.toMatch(/did not reach|\* /)
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
