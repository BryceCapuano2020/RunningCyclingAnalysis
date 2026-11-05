import { describe, expect, it } from 'vitest'
import { energyReading } from '../ui/components/balanceScale'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import type { ShareCardModel } from './cardModel'
import {
  LONG_FOOTNOTE,
  LONG_HEADLINE,
  LONG_NAME,
  RIDE_GRADE,
  cardModel,
  render,
  type RecordedText,
} from './fixtures'
import { FOOTER, NAME, ORIGIN } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']
const ORIGIN_URL = 'example.test'

/**
 * The worst case the card must hold: a long headline, the longest level name on both sports, a name that fills the
 * top row, the sample label, a long footnote and an energy balance with the heart-rate line on its range.
 */
function worstCase(): ShareCardModel {
  const base = cardModel()
  return {
    ...base,
    headline: LONG_HEADLINE,
    footnote: LONG_FOOTNOTE,
    badge: 'Sample data',
    name: LONG_NAME,
    informedByHeartRate: true,
    heroes: base.heroes.map((hero) => Object.assign(hero, { grade: RIDE_GRADE })),
  }
}

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

describe('a card with the worst text', () => {
  it.each(FORMATS)('keeps every line inside the margins on the %s card', (format) => {
    const { width, height, marginX, marginY } = CARD_FORMATS[format]
    const { ok, ctx } = render(worstCase(), format)
    expect(ok).toBe(true)
    expect(ctx.texts.length).toBeGreaterThan(0)
    for (const text of ctx.texts) {
      expect(text.x).toBeGreaterThanOrEqual(marginX)
      expect(text.x + text.width).toBeLessThanOrEqual(width - marginX)
      expect(text.y + text.size).toBeLessThanOrEqual(height - marginY)
    }
  })

  it.each(FORMATS)('never draws two lines over each other on the %s card', (format) => {
    const { ok, ctx } = render(worstCase(), format)
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
  })

  it.each(FORMATS)(
    'keeps the whole footer, however many lines it takes, on the %s card',
    (format) => {
      const { ok, ctx } = render(cardModel({ footnote: LONG_FOOTNOTE }), format)
      expect(ok).toBe(true)
      const footer = ctx.texts.filter((text) => text.size === FOOTER.size)
      expect(footer.map((text) => text.text).join(' ')).toContain(
        LONG_FOOTNOTE.toUpperCase().slice(0, 30),
      )
      expect(ctx.texts.some((text) => text.text.endsWith('…'))).toBe(false)
    },
  )
})

describe('a card that is too tall for its sizes', () => {
  /** What the card keeps at a height: its origin, its headline's size and whether it fits. */
  function kept(height: number) {
    return withHeight('square', height, () => {
      const { ok, ctx } = render(cardModel(), 'square')
      const headline = ctx.texts.find((text) => text.font.startsWith('500 ') && text.size >= 56)
      return {
        ok,
        origin: ctx.texts.some((text) => text.text === ORIGIN_URL),
        size: headline?.size ?? 0,
      }
    })
  }

  it('sheds the origin first, then steps the headline down, and never grows it back', () => {
    const sweep = Array.from({ length: 80 }, (_, step) => kept(1400 - step * 10)).filter(
      (row) => row.ok,
    )
    expect(sweep.length).toBeGreaterThan(10)
    expect(sweep[0]).toMatchObject({ origin: true })
    for (let i = 1; i < sweep.length; i++) {
      const [before, now] = [sweep[i - 1]!, sweep[i]!]
      if (before.origin === false) expect(now.origin).toBe(false)
      if (now.size < before.size) expect(now.origin).toBe(false)
      expect(now.size).toBeLessThanOrEqual(before.size)
    }
    const last = sweep[sweep.length - 1]!
    expect(last.origin).toBe(false)
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
