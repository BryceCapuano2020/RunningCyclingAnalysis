import { describe, expect, it } from 'vitest'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import { FakeContext, cardModel, fakeCanvas, render, type RecordedText } from './fixtures'
import { renderShareCard } from './renderCard'

const FORMATS: CardFormat[] = ['square', 'story']

function words(texts: RecordedText[]): string {
  return texts.map((text) => text.text).join(' ')
}

function find(texts: RecordedText[], text: string): RecordedText {
  const found = texts.find((candidate) => candidate.text === text)
  if (found === undefined) throw new Error(`no text ${text}`)
  return found
}

describe('the name on the card', () => {
  const metaTop = (ctx: FakeContext) => ctx.texts.filter((text) => text.size === 22 && text.y < 160)

  it.each(FORMATS)('draws the name as mono metadata in the top row on the %s card', (format) => {
    const { ok, ctx } = render(cardModel({ name: 'Riley Example' }), format)
    expect(ok).toBe(true)
    const name = find(ctx.texts, 'Riley Example')
    const { marginY } = CARD_FORMATS[format]
    expect(name.font).toContain('IBM Plex Mono')
    expect(name.y).toBeGreaterThanOrEqual(marginY)
    expect(name.y).toBeLessThan(marginY + 44)
    expect(name.x).toBeGreaterThan(find(ctx.texts, 'RunningCyclingAnalysis').x + 200)
  })

  it('draws nothing extra when the card has no name, so it stays as it was', () => {
    expect(words(render(cardModel({ name: null })).ctx.texts)).toBe(
      words(render(cardModel()).ctx.texts),
    )
  })

  it('ends a long name in an ellipsis that stops short of the sample label', () => {
    const { ok, ctx } = render(
      cardModel({
        name: 'Riley Example and a very long set of other names that goes on',
        badge: 'Sample athlete',
      }),
    )
    expect(ok).toBe(true)
    const [name] = metaTop(ctx).filter((text) => text.text.endsWith('…'))
    const badge = find(ctx.texts, 'SAMPLE ATHLETE')
    expect((name?.x ?? 0) + (name?.width ?? 0)).toBeLessThan(badge.x)
    expect(badge.x + badge.width).toBeLessThanOrEqual(1000)
  })
})

describe('a name too long for its slot', () => {
  // Each character is 16 px wide, a realistic width for the mono at 22 px, so 40 letters overrun the row.
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
      const title = find(ctx.texts, 'RunningCyclingAnalysis')
      const name = ctx.texts.find((text) => text.text.startsWith('AAA'))
      expect(name?.text.endsWith('…')).toBe(true)
      expect(name?.x ?? 0).toBeGreaterThanOrEqual(title.x + title.width)
      if (badge !== null) {
        expect((name?.x ?? 0) + (name?.width ?? 0)).toBeLessThanOrEqual(
          find(ctx.texts, badge.toUpperCase()).x,
        )
      }
    },
  )

  it('cuts an emoji name by code point, so no emoji is left half cut', () => {
    const { ok, ctx } = render(cardModel({ name: '😀'.repeat(40) }))
    expect(ok).toBe(true)
    const name = ctx.texts.find((text) => text.text.includes('😀'))
    expect(name?.text.endsWith('…')).toBe(true)
    expect(name?.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    )
  })
})
