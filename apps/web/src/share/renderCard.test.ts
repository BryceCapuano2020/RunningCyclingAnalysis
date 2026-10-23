import { describe, expect, it } from 'vitest'
import type { ShareCardModel } from './cardModel'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  MARGIN_X,
  MARGIN_Y,
  renderShareCard,
  wrapText,
} from './renderCard'

/** Ten pixels per character, so line breaks are easy to predict. */
const fixedMeasure = (text: string) => text.length * 10

const BACKGROUND = '#fcfcfb'
const ACCENT = '#1c5cab'
const HEADLINE_SIZES = [32, 40]
const FIGURE_VALUE_SIZE = 46

type Text = { text: string; x: number; y: number; size: number; width: number; color: string }
type Rect = { x: number; y: number; w: number; h: number; color: string }

/**
 * Records what the renderer draws. Text is half an em per character, so wrapping at the card width
 * depends on the size the renderer chose.
 */
class FakeContext {
  fillStyle = ''
  font = ''
  textBaseline = ''
  textAlign = ''
  texts: Text[] = []
  rects: Rect[] = []

  private size(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font)
    return Number(match?.[1] ?? 0)
  }

  measureText(text: string) {
    return { width: text.length * this.size() * 0.5 }
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, color: this.fillStyle })
  }

  fillText(text: string, x: number, y: number) {
    const width = this.measureText(text).width
    this.texts.push({ text, x, y, size: this.size(), width, color: this.fillStyle })
  }
}

/** A canvas stand-in whose 2D context is the recording one, or null when it has none. */
function fakeCanvas(ctx: FakeContext | null) {
  return { width: 0, height: 0, getContext: () => ctx }
}

function draw(model: ShareCardModel): FakeContext {
  const ctx = new FakeContext()
  const ok = renderShareCard(model, fakeCanvas(ctx) as unknown as HTMLCanvasElement)
  expect(ok).toBe(true)
  return ctx
}

function model(overrides: Partial<ShareCardModel> = {}): ShareCardModel {
  return {
    title: 'RunningCyclingAnalysis',
    headline: 'Over 20 min, your running is estimated to use 12% more energy rate',
    summary: 'Over 20 min, your estimated running energy rate is 3.4 W/kg and your cycling is 3.0.',
    range: '90% model range: +5% to +20%.',
    basis: 'Model range based on population assumptions.',
    caveat: 'Best efforts over 20 min may not have been all-out.',
    figures: [
      { label: 'Running threshold pace', value: '21:35 /km' },
      { label: 'Cycling threshold power', value: '48 W' },
      { label: 'Running vs cycling, 20 min', value: '+12%' },
    ],
    period: 'Last 6 weeks: 1 run, 1 ride',
    footer: 'Estimated from heart rate, pace and power files. Not a measure of sporting ability.',
    origin: 'https://example.test',
    badge: null,
    ...overrides,
  }
}

/** A headline long enough that it needs three lines at the smaller headline size. */
const LONG_HEADLINE =
  'Over 20 min, your running is estimated to use 12% more energy rate per kilogram than your cycling, with a range that depends on the population assumptions behind both sports and their efficiency'

/** A summary that needs two lines at the summary size. */
const LONG_SUMMARY =
  'Over 20 min, your estimated running energy rate is 3.4 W/kg and your cycling energy rate is 3.0 W/kg, each estimated from the best efforts in your files for the period you selected, with the heart-rate check applied where the data support it.'

/** A footer that needs two lines at the footer size. */
const TWO_LINE_FOOTER =
  'Estimated from heart rate, pace and power files, and the model assumes that heart rate responds to energy use in a similar way in both sports, so the comparison can move with your data.'

/** The headline lines: the text drawn at a headline size. */
function headlineLines(ctx: FakeContext): Text[] {
  return ctx.texts.filter((text) => HEADLINE_SIZES.includes(text.size))
}

describe('wrapText', () => {
  it('breaks lines at spaces so that no line is wider than the maximum', () => {
    expect(wrapText('one two three four', 100, fixedMeasure)).toEqual(['one two', 'three four'])
  })

  it('keeps a word longer than the maximum on a line of its own', () => {
    expect(wrapText('supercalifragilistic short', 50, fixedMeasure)).toEqual([
      'supercalifragilistic',
      'short',
    ])
  })

  it('returns no lines for blank text', () => {
    expect(wrapText('   ', 100, fixedMeasure)).toEqual([])
  })

  it('stops at the line limit and marks the cut with an ellipsis that fits', () => {
    const lines = wrapText('a bb ccc dddd eeeee', 40, fixedMeasure, 2)
    expect(lines).toEqual(['a bb', 'ccc…'])
    for (const line of lines) expect(fixedMeasure(line)).toBeLessThanOrEqual(40)
  })
})

describe('renderShareCard', () => {
  it('sizes the canvas to 1200 by 630 for Open Graph style sharing', () => {
    const canvas = fakeCanvas(new FakeContext())
    renderShareCard(model(), canvas as unknown as HTMLCanvasElement)
    expect(canvas.width).toBe(CARD_WIDTH)
    expect(canvas.height).toBe(CARD_HEIGHT)
  })

  it('returns false and draws nothing when the canvas has no 2D context', () => {
    const canvas = fakeCanvas(null)
    expect(renderShareCard(model(), canvas as unknown as HTMLCanvasElement)).toBe(false)
  })

  it('draws the title, headline, range, basis, caveat, figures, period, footer and origin', () => {
    const ctx = draw(model())
    const texts = ctx.texts.map((text) => text.text)
    expect(texts.join(' ')).toContain(
      'Over 20 min, your running is estimated to use 12% more energy rate',
    )
    for (const expected of [
      'RunningCyclingAnalysis',
      '90% model range: +5% to +20%.',
      'Model range based on population assumptions.',
      'Best efforts over 20 min may not have been all-out.',
      'Running threshold pace',
      '21:35 /km',
      'Cycling threshold power',
      '48 W',
      '+12%',
      'Last 6 weeks: 1 run, 1 ride',
      'https://example.test',
    ]) {
      expect(texts).toContain(expected)
    }
  })

  it('draws the basis and the effort caveat under the range, above the figures', () => {
    const texts = draw(model()).texts
    const range = texts.find((text) => text.text.startsWith('90% model range'))
    const basis = texts.find((text) => text.text.startsWith('Model range based'))
    const figure = texts.find((text) => text.text === '21:35 /km')
    expect(basis?.y).toBeGreaterThan(range?.y ?? Infinity)
    expect(figure?.y).toBeGreaterThan(basis?.y ?? Infinity)
  })

  it('draws a 12 px accent bar down the left edge in the accent colour', () => {
    const bar = draw(model()).rects.find((rect) => rect.w === 12)
    expect(bar).toEqual({ x: 0, y: 0, w: 12, h: CARD_HEIGHT, color: ACCENT })
  })

  it('paints the light background across the whole canvas first', () => {
    const ctx = draw(model())
    expect(ctx.rects[0]).toEqual({ x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT, color: BACKGROUND })
  })

  it('draws the sample badge only when the model has one', () => {
    expect(draw(model({ badge: null })).texts.map((t) => t.text)).not.toContain('Sample data')
    expect(draw(model({ badge: 'Sample data' })).texts.map((t) => t.text)).toContain('Sample data')
  })

  it('draws no figure tiles when there are no figures', () => {
    const ctx = draw(model({ figures: [] }))
    const tiles = ctx.rects.filter((rect) => rect.w !== 12 && rect.w !== CARD_WIDTH)
    expect(tiles).toHaveLength(0)
    expect(ctx.texts.map((t) => t.text)).not.toContain('48 W')
  })

  it('omits the origin and the caveat when the model has none', () => {
    const texts = draw(model({ origin: '', caveat: null })).texts.map((t) => t.text)
    expect(texts).not.toContain('https://example.test')
    expect(texts).not.toContain('Best efforts over 20 min may not have been all-out.')
    expect(texts).toContain('Model range based on population assumptions.')
  })

  it('uses the large headline size when the headline fits in two lines', () => {
    const lines = headlineLines(draw(model()))
    expect(lines.length).toBe(2)
    expect(new Set(lines.map((line) => line.size))).toEqual(new Set([40]))
  })

  it('shrinks a headline that needs three lines at the large size to the smaller size in three lines', () => {
    const lines = headlineLines(draw(model({ headline: LONG_HEADLINE })))
    expect(lines.length).toBe(3)
    expect(new Set(lines.map((line) => line.size))).toEqual(new Set([32]))
  })

  it('keeps every line inside the left and right margins', () => {
    const variants = [
      model(),
      model({ headline: LONG_HEADLINE, summary: LONG_SUMMARY, footer: TWO_LINE_FOOTER }),
    ]
    for (const variant of variants) {
      for (const text of draw(variant).texts) {
        expect(text.x).toBeGreaterThanOrEqual(MARGIN_X)
        expect(text.x + text.width).toBeLessThanOrEqual(CARD_WIDTH - MARGIN_X)
      }
    }
  })

  it('keeps every line above the bottom margin, even with the longest headline and footer', () => {
    const worst = model({
      headline: LONG_HEADLINE,
      summary: LONG_SUMMARY,
      footer: TWO_LINE_FOOTER,
    })
    for (const text of draw(worst).texts) {
      expect(text.y + text.size).toBeLessThanOrEqual(CARD_HEIGHT - MARGIN_Y)
    }
  })

  it('stacks the sections top to bottom, with the footer after the figures', () => {
    const texts = draw(model()).texts
    const figure = texts.find((text) => text.text === '21:35 /km')
    const period = texts.find((text) => text.text.startsWith('Last 6 weeks'))
    const footer = texts.find((text) => text.text.startsWith('Estimated from'))
    expect(period?.y).toBeGreaterThan(figure?.y ?? Infinity)
    expect(footer?.y).toBeGreaterThan(period?.y ?? Infinity)
    expect(texts[0]?.text).toBe('RunningCyclingAnalysis')
  })

  it('draws the figure values at the large tile size', () => {
    const values = draw(model()).texts.filter((text) => text.size === FIGURE_VALUE_SIZE)
    expect(values.map((text) => text.text)).toEqual(['21:35 /km', '48 W', '+12%'])
  })

  it('fills the frame so that the content reaches near the bottom margin', () => {
    const lowest = Math.max(...draw(model()).texts.map((text) => text.y + text.size))
    expect(lowest).toBeGreaterThanOrEqual(CARD_HEIGHT - MARGIN_Y - 40)
  })

  it('keeps the origin and caveat when the card has room for them', () => {
    const texts = draw(model()).texts.map((text) => text.text)
    expect(texts).toContain('https://example.test')
    expect(texts).toContain('Best efforts over 20 min may not have been all-out.')
  })

  it('drops the origin first when a three-line headline and two-line summary leave no room for it', () => {
    const texts = draw(model({ headline: LONG_HEADLINE, summary: LONG_SUMMARY })).texts.map(
      (text) => text.text,
    )
    expect(texts).not.toContain('https://example.test')
    expect(texts).toContain('Best efforts over 20 min may not have been all-out.')
  })

  it('drops the origin and caveat, and keeps the basis, for the longest headline and footer', () => {
    const texts = draw(
      model({ headline: LONG_HEADLINE, summary: LONG_SUMMARY, footer: TWO_LINE_FOOTER }),
    ).texts.map((text) => text.text)
    expect(texts).not.toContain('https://example.test')
    expect(texts).not.toContain('Best efforts over 20 min may not have been all-out.')
    expect(texts).toContain('Model range based on population assumptions.')
    expect(texts.join(' ')).toContain('so the comparison can move with your data.')
  })
})
