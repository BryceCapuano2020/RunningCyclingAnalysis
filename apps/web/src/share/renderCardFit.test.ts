import { describe, expect, it } from 'vitest'
import { energyReading } from '../ui/components/balanceScale'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import { BAND_HEIGHT, DOT_RADIUS } from './cardMeter'
import type { ShareCardModel } from './cardModel'
import {
  LONG_CAVEAT,
  LONG_FOOTNOTE,
  LONG_HEADLINE,
  cardModel,
  render,
  type RecordedText,
} from './fixtures'
import { CAVEAT, NAME, ORIGIN, PERIOD } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
const ORIGIN_URL = 'example.test'
/** Three lines of caveat in the card's measure: the caveat wraps rather than being cut. */
const THREE_LINE_CAVEAT =
  'Best cycling efforts over the full sixty minutes of the period did not reach a hard heart rate, so the figure is low, and a recent race would sharpen it.'
/** Far more caveat than any card has room for. */
const TOO_LONG_CAVEAT = Array.from({ length: 12 }, () => LONG_CAVEAT).join(' ')

/**
 * The worst case the card must hold: a long headline, a long caveat and the sample badge. The
 * footnote is fixed copy of one line, so a longer one is tested on its own below.
 */
function worstCase(base: ShareCardModel): ShareCardModel {
  return {
    ...base,
    headline: LONG_HEADLINE,
    caveat: LONG_CAVEAT,
    badge: 'Sample data',
  }
}

const WORST = [
  ['a full balance', worstCase(cardModel())],
  ['a three-line caveat', { ...worstCase(cardModel()), caveat: THREE_LINE_CAVEAT }],
] as const

/** Runs the check with a format's height changed, and puts the height back afterwards. */
function withHeight(format: CardFormat, height: number, check: () => void): void {
  const layout = CARD_FORMATS[format]
  const original = layout.height
  layout.height = height
  try {
    check()
  } finally {
    layout.height = original
  }
}

/** The rough box a line covers: its cap height above the baseline, or down from its top. */
const CAP = 0.75
function boxOf(text: RecordedText): { top: number; bottom: number } {
  const top = text.baseline === 'alphabetic' ? text.y - text.size * CAP : text.y
  return { top, bottom: top + text.size * CAP }
}

function overlaps(a: RecordedText, b: RecordedText): boolean {
  const across = a.x < b.x + b.width && b.x < a.x + a.width
  const boxA = boxOf(a)
  const boxB = boxOf(b)
  return across && boxA.top < boxB.bottom && boxB.top < boxA.bottom
}

function find(texts: RecordedText[], text: string): RecordedText {
  const found = texts.find((candidate) => candidate.text === text)
  if (found === undefined) throw new Error(`no text ${text}`)
  return found
}

/** The caveat's lines: the medium text in the caveat's size that is not the origin. */
function caveatLines(texts: RecordedText[]): RecordedText[] {
  return texts.filter(
    (text) => text.size === CAVEAT.size && text.font.startsWith('500 ') && text.text !== ORIGIN_URL,
  )
}

describe('a card with the worst text', () => {
  it.each(FORMATS)('keeps the whole caveat on the %s card', (format) => {
    for (const [, model] of WORST) {
      const { ok, ctx } = render(model, format)
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      expect(ctx.texts.map((text) => text.text).join(' ')).toContain(model.caveat ?? '')
    }
  })

  it.each(FORMATS)('keeps every line inside the margins on the %s card', (format) => {
    const { width, height, marginX, marginY } = CARD_FORMATS[format]
    for (const [, model] of WORST) {
      const { ok, ctx } = render(model, format)
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      for (const text of ctx.texts) {
        expect(text.x).toBeGreaterThanOrEqual(marginX)
        expect(text.x + text.width).toBeLessThanOrEqual(width - marginX)
        expect(text.y + text.size).toBeLessThanOrEqual(height - marginY)
      }
    }
  })

  it.each(FORMATS)('never draws two lines over each other on the %s card', (format) => {
    for (const [, model] of WORST) {
      const { ok, ctx } = render(model, format)
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      const { texts } = ctx
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i]
          const b = texts[j]
          if (a === undefined || b === undefined) continue
          expect(overlaps(a, b), `${a.text} over ${b.text}`).toBe(false)
        }
      }
    }
  })
})

describe('a caveat or footnote longer than two lines', () => {
  it.each(FORMATS)(
    'keeps all three lines of a caveat, with no ellipsis, on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel({ caveat: THREE_LINE_CAVEAT }), format)
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      expect(caveatLines(ctx.texts)).toHaveLength(3)
      expect(ctx.texts.map((text) => text.text).join(' ')).toContain(THREE_LINE_CAVEAT)
      expect(ctx.texts.some((text) => text.text.endsWith('…'))).toBe(false)
    },
  )

  it.each(FORMATS)(
    'keeps the whole footnote, however many lines it takes, on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel({ footnote: LONG_FOOTNOTE }), format)
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      expect(ctx.texts.map((text) => text.text).join(' ')).toContain(LONG_FOOTNOTE)
      expect(ctx.texts.some((text) => text.text.endsWith('…'))).toBe(false)
    },
  )

  it.each(FORMATS)(
    'fails, rather than cutting the caveat, when it cannot fit on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel({ caveat: TOO_LONG_CAVEAT }), format)
      expect(ok).toBe(false)
      expect(ctx.texts).toEqual([])
      expect(ctx.rects).toEqual([])
    },
  )
})

describe('a ride whose range crosses a level', () => {
  const CROSSING = 'Recreational to Regional · 61% on best 20 min'
  const crossing = (): ShareCardModel => {
    const base = cardModel()
    const [run, ride] = base.heroes
    if (run === undefined || ride === undefined) throw new Error('The card has no heroes')
    return { ...base, heroes: [run, { ...ride, grade: CROSSING }] }
  }

  it.each(FORMATS)('keeps both levels whole and inside the margins on the %s card', (format) => {
    const { width, marginX } = CARD_FORMATS[format]
    const { ok, ctx } = render(crossing(), format)
    expect(ok).toBe(true)
    const lines = ctx.texts.filter((text) => CROSSING.includes(text.text) && text.text !== '')
    expect(lines.map((line) => line.text).join(' ')).toContain('Recreational to Regional')
    expect(ctx.texts.some((text) => text.text.endsWith('…'))).toBe(false)
    for (const text of ctx.texts) {
      expect(text.x).toBeGreaterThanOrEqual(marginX)
      expect(text.x + text.width).toBeLessThanOrEqual(width - marginX)
    }
  })
})

describe('a card that is too tall for its sizes', () => {
  const isMagnitude = (text: RecordedText) => text.text.startsWith('Running grades')

  it('sheds the origin first, then the magnitude line, then steps the headline down, and keeps the caveat', () => {
    // The square's blocks need about 1059 px with every line, 1007 without the origin and 955
    // without the magnitude line too. Below that the headline steps down to 72 px.
    withHeight('square', 1080, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      expect(ok).toBe(true)
      expect(ctx.texts.some((text) => text.text === ORIGIN_URL)).toBe(true)
      expect(ctx.texts.some(isMagnitude)).toBe(true)
      expect(find(ctx.texts, 'YOUR BALANCE LEANS').size).toBe(88)
    })
    withHeight('square', 1040, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      expect(ok).toBe(true)
      expect(ctx.texts.some((text) => text.text === ORIGIN_URL)).toBe(false)
      expect(ctx.texts.some(isMagnitude)).toBe(true)
      expect(find(ctx.texts, 'YOUR BALANCE LEANS').size).toBe(88)
    })
    withHeight('square', 990, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      expect(ok).toBe(true)
      expect(ctx.texts.some((text) => text.text === ORIGIN_URL)).toBe(false)
      expect(ctx.texts.some(isMagnitude)).toBe(false)
      expect(find(ctx.texts, 'YOUR BALANCE LEANS').size).toBe(88)
    })
    withHeight('square', 940, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      expect(ok).toBe(true)
      expect(ctx.texts.length).toBeGreaterThan(0)
      expect(find(ctx.texts, 'YOUR BALANCE LEANS TOWARD').size).toBe(72)
      expect(ctx.texts.some((text) => text.text.startsWith('* Best efforts'))).toBe(true)
    })
  })

  it('draws nothing and reports failure when even the smallest sizes do not fit', () => {
    withHeight('square', 600, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      expect(ok).toBe(false)
      expect(ctx.texts).toEqual([])
      expect(ctx.rects).toEqual([])
    })
  })
})

describe('the story layout', () => {
  it('pins the brand row to the top margin and the footer to the bottom margin', () => {
    const { marginY, height, mark } = CARD_FORMATS.story
    const { ok, ctx } = render(cardModel(), 'story')
    expect(ok).toBe(true)
    expect(ctx.texts.length).toBeGreaterThan(0)
    expect(find(ctx.texts, 'RunningCyclingAnalysis').y).toBeCloseTo(
      marginY + (mark - NAME.lineHeight) / 2,
      6,
    )
    expect(find(ctx.texts, ORIGIN_URL).y + ORIGIN.lineHeight).toBeCloseTo(height - marginY, 6)
  })

  it('centres the main block, so the same space sits above it as below it', () => {
    const { marginY, mark } = CARD_FORMATS.story
    const { ok, ctx } = render(cardModel(), 'story')
    expect(ok).toBe(true)
    const headline = find(ctx.texts, 'YOUR BALANCE LEANS')
    const period = find(ctx.texts, 'Last 6 weeks')
    const caveat = caveatLines(ctx.texts)[0]
    expect(caveat).toBeDefined()
    const above = headline.y - (marginY + mark)
    const below = (caveat?.y ?? 0) - (period.y + PERIOD.lineHeight)
    expect(Math.abs(above - below)).toBeLessThan(1)
  })
})

describe('the balance band', () => {
  it('stays centred on the dot when a single value widens it to the minimum', () => {
    const { ok, ctx } = render(
      cardModel({
        meter: energyReading({ p05: 1.1, p50: 1.1, p95: 1.1 }),
      }),
      'square',
    )
    expect(ok).toBe(true)
    expect(ctx.texts.length).toBeGreaterThan(0)
    const dot = ctx.arcs.find((arc) => arc.r === DOT_RADIUS)
    // A band of the minimum width is a circle the height of the band: its centre must be the dot's.
    const band = ctx.arcs.find((arc) => arc.r === BAND_HEIGHT / 2)
    expect(dot).toBeDefined()
    expect(band?.x).toBeCloseTo(dot?.x ?? 0, 6)
  })
})
