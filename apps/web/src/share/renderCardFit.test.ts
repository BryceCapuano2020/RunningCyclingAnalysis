import { describe, expect, it } from 'vitest'
import { energyReading } from '../ui/components/balanceScale'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import type { ShareCardModel } from './cardModel'
import {
  LONG_CAVEAT,
  LONG_FOOTNOTE,
  RIDE_GRADE,
  LONG_HEADLINE,
  LONG_MAGNITUDE,
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

/** The worst case the card must hold: a long headline, a long caveat, the longest level name on both sports, the sample label and a name. */
function worstCase(caveat = LONG_CAVEAT): ShareCardModel {
  const base = cardModel()
  return {
    ...base,
    headline: LONG_HEADLINE,
    caveat,
    badge: 'Sample data',
    name: 'A long name',
    heroes: base.heroes.map((hero) => Object.assign(hero, { grade: RIDE_GRADE })),
  }
}

const WORST = [
  ['a full balance', worstCase()],
  ['a three-line caveat', worstCase(THREE_LINE_CAVEAT)],
] as const

/** Runs the check with a format's height changed, and puts the height back afterwards. */
function withHeight<T>(format: CardFormat, height: number, check: () => T): T {
  const layout = CARD_FORMATS[format]
  const original = layout.height
  layout.height = height
  try {
    return check()
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

/** The caveat's lines: the text in the caveat's size that is a piece of the caveat's words. */
function caveatLines(texts: RecordedText[], caveat: string): RecordedText[] {
  return texts.filter(
    (text) =>
      text.size === CAVEAT.size &&
      text.text !== ORIGIN_URL &&
      caveat.includes(text.text.replace(/^\* /, '')),
  )
}

describe('a card with the worst text', () => {
  it.each(FORMATS)('keeps the whole caveat on the %s card', (format) => {
    for (const [, model] of WORST) {
      const { ok, ctx } = render(model, format)
      expect(ok).toBe(true)
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
      expect(caveatLines(ctx.texts, THREE_LINE_CAVEAT)).toHaveLength(3)
      expect(ctx.texts.map((text) => text.text).join(' ')).toContain(THREE_LINE_CAVEAT)
      expect(ctx.texts.some((text) => text.text.endsWith('…'))).toBe(false)
    },
  )

  it.each(FORMATS)(
    'keeps the whole footnote, however many lines it takes, on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel({ footnote: LONG_FOOTNOTE }), format)
      expect(ok).toBe(true)
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

describe('a card that is too tall for its sizes', () => {
  /** What the card keeps at a height: its origin, its magnitude line, its headline's size and whether it fits. */
  function kept(height: number) {
    return withHeight('square', height, () => {
      const { ok, ctx } = render(cardModel({ magnitude: LONG_MAGNITUDE.slice(0, 40) }), 'square')
      const headline = ctx.texts.find((text) => text.font.startsWith('500 ') && text.size >= 56)
      return {
        ok,
        origin: ctx.texts.some((text) => text.text === ORIGIN_URL),
        magnitude: ctx.texts.some((text) => text.text.startsWith(LONG_MAGNITUDE.slice(0, 20))),
        size: headline?.size ?? 0,
        caveat: ctx.texts.some((text) => text.text.startsWith('* Best efforts')),
      }
    })
  }

  it('sheds the origin first, then the magnitude line, then steps the headline down, and keeps the caveat', () => {
    // Sweep the height down: each thing goes only after the one before it, and the headline never grows back.
    const sweep = Array.from({ length: 80 }, (_, step) => kept(1400 - step * 10)).filter(
      (row) => row.ok,
    )
    expect(sweep.length).toBeGreaterThan(10)
    expect(sweep[0]).toMatchObject({ origin: true, magnitude: true })
    for (let i = 1; i < sweep.length; i++) {
      const [before, now] = [sweep[i - 1]!, sweep[i]!]
      expect(now.caveat).toBe(true)
      if (before.origin === false) expect(now.origin).toBe(false)
      if (before.magnitude === false) expect(now.magnitude).toBe(false)
      if (!now.magnitude) expect(now.origin).toBe(false)
      if (now.size < before.size) expect(now.magnitude).toBe(false)
      expect(now.size).toBeLessThanOrEqual(before.size)
    }
    const last = sweep[sweep.length - 1]!
    expect(last).toMatchObject({ origin: false, magnitude: false })
    expect(last.size).toBeLessThan(sweep[0]!.size)
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
  it('pins the top row to the top margin and the footer to the bottom margin', () => {
    const { marginY, height } = CARD_FORMATS.story
    const { ok, ctx } = render(cardModel(), 'story')
    expect(ok).toBe(true)
    expect(find(ctx.texts, 'RunningCyclingAnalysis').y).toBe(marginY)
    expect(find(ctx.texts, ORIGIN_URL).y + ORIGIN.lineHeight).toBeCloseTo(height - marginY, 6)
    expect(NAME.lineHeight).toBeGreaterThan(0)
  })

  it('centres the main block, so the same space sits above it as below it', () => {
    const { marginY } = CARD_FORMATS.story
    const { ok, ctx } = render(cardModel(), 'story')
    expect(ok).toBe(true)
    const headline = ctx.texts.find((text) => text.font.startsWith('500 ') && text.size >= 56)
    const period = find(ctx.texts, 'Last 6 weeks')
    const caveat = caveatLines(ctx.texts, cardModel().caveat ?? '')[0]
    const top = marginY + NAME.lineHeight + 22
    const above = (headline?.y ?? 0) - top
    const below = (caveat?.y ?? 0) - (period.y + PERIOD.lineHeight)
    expect(Math.abs(above - below)).toBeLessThan(1)
  })
})

describe('the balance mark at the end of the scale', () => {
  it('stays inside the track when the lead is zero or runs past the scale', () => {
    for (const meter of [
      energyReading({ p05: 1, p50: 1, p95: 1 }),
      energyReading({ p05: 0.4, p50: 0.45, p95: 0.5 }),
    ]) {
      const { ok, ctx } = render(cardModel({ meter }), 'square')
      expect(ok).toBe(true)
      const mark = ctx.rects.find((rect) => rect.w === 4)
      expect(mark?.x ?? 0).toBeGreaterThanOrEqual(80)
      expect((mark?.x ?? 0) + 4).toBeLessThanOrEqual(1000)
    }
  })
})
