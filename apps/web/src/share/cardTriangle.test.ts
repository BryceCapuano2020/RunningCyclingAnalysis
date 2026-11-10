import { describe, expect, it } from 'vitest'
import { levelOf } from '@rca/core/grade'
import { triangleGeometry } from '@rca/core/standing'
import { CARD_COLORS } from './cardColors'
import { CARD_FORMATS, type CardFormat } from './cardLayout'
import { cornerLines, cornersSentence, triangleHeight } from './cardTriangle'
import {
  TRIANGLE,
  TRIANGLE_ALT,
  cardModel,
  draw,
  gradedCorner,
  type RecordedText,
} from './fixtures'
import type { TriangleView } from '../ui/triangleSports'

const FORMATS: CardFormat[] = ['square', 'story']

function find(texts: RecordedText[], text: string): RecordedText {
  const found = texts.find((candidate) => candidate.text === text)
  if (found === undefined) throw new Error(`no text ${text}`)
  return found
}

/** The level word the figure prints for a whole percent, as `triangleGeometry` reads it. */
const lv = (percent: number): string => levelOf((percent + 0.04) / 100) ?? ''

const all: TriangleView = {
  grades: {
    run: gradedCorner(64, 'Local'),
    ride: gradedCorner(61, 'Recreational'),
    lift: gradedCorner(48, 'Active'),
  },
  notes: {},
}
const none: TriangleView = {
  grades: { ...TRIANGLE.grades, run: { kind: 'gap' }, ride: { kind: 'gap' } },
  notes: {},
}

describe('the level triangle on the card', () => {
  it.each(FORMATS)('puts each dot where triangleGeometry puts it, on the %s card', (format) => {
    const { arcs } = draw(cardModel({ triangle: all }), format)
    expect(arcs).toHaveLength(3)
    // The card may shed down its sizes to fit, so the size is read back from the dot's radius.
    const size = arcs[0]!.r * 50
    expect(CARD_FORMATS[format].triangle).toContain(Math.round(size))
    const { corners } = triangleGeometry(all.grades, size)
    const [run, ride, lift] = [corners.run.dot!, corners.ride.dot!, corners.lift.dot!]
    // The block's own offset is the same for every dot, so the gaps between dots are the geometry's.
    expect(arcs[1]!.x - arcs[0]!.x).toBeCloseTo(ride.x - run.x, 6)
    expect(arcs[1]!.y - arcs[0]!.y).toBeCloseTo(ride.y - run.y, 6)
    expect(arcs[2]!.x - arcs[0]!.x).toBeCloseTo(lift.x - run.x, 6)
    expect(arcs[0]!.r).toBeCloseTo((6 * size) / 300, 6)
  })

  it('draws each dot in its sport’s ink, the shape in neutral ink and the rings in hairlines', () => {
    const { paths } = draw(cardModel({ triangle: all }))
    const fills = paths.filter((path) => path.op === 'fill')
    expect(fills.map((path) => path.color)).toEqual([
      CARD_COLORS.ink,
      CARD_COLORS.run,
      CARD_COLORS.ride,
      CARD_COLORS.lift,
    ])
    expect(fills[0]?.alpha).toBeCloseTo(0.07, 6)
    const strokes = new Set(paths.filter((path) => path.op === 'stroke').map((path) => path.color))
    expect(strokes.has(CARD_COLORS.hairline)).toBe(true)
    expect(strokes.has(CARD_COLORS.rule)).toBe(true)
    expect(strokes.has(CARD_COLORS.ink)).toBe(true)
  })

  it('reads each corner as label over number over level', () => {
    const texts = draw(cardModel({ triangle: all })).texts
    for (const [label, number, level] of [
      ['RUNNING', '64%', lv(64)],
      ['CYCLING', '61%', lv(61)],
      ['LIFTING', '48%', lv(48)],
    ]) {
      expect(find(texts, label!).y).toBeLessThan(find(texts, number!).y)
      const below = texts.filter((text) => text.text === level && text.y > find(texts, number!).y)
      expect(below.length).toBeGreaterThan(0)
      expect(below.every((text) => text.color === CARD_COLORS.secondary)).toBe(true)
      expect(find(texts, number!).font).toContain('IBM Plex Mono')
      expect(find(texts, number!).color).toBe(CARD_COLORS.ink)
    }
    expect(find(texts, 'RUNNING').y).toBeLessThan(find(texts, 'LIFTING').y)
  })

  it('draws a corner with no grade as its name over "No grade yet", with a cap and no dot', () => {
    const ctx = draw(cardModel())
    expect(ctx.arcs).toHaveLength(2)
    const lifting = find(ctx.texts, 'LIFTING')
    const none = find(ctx.texts, 'No grade yet')
    expect(none.y).toBeGreaterThan(lifting.y)
    expect(none.color).toBe(CARD_COLORS.secondary)
    expect(ctx.paths.some((path) => path.color === CARD_COLORS.control && path.width > 0)).toBe(
      true,
    )
  })

  it('draws two graded dots as an open line, and no shape with fewer', () => {
    const open = draw(cardModel())
    expect(open.paths.filter((path) => path.op === 'fill' && path.alpha < 1)).toEqual([])
    const line = open.paths.find((path) => path.op === 'stroke' && path.color === CARD_COLORS.ink)
    expect(line?.segments).toEqual(['moveTo', 'lineTo'])
    const empty = draw(cardModel({ triangle: none }))
    expect(empty.arcs).toEqual([])
    expect(empty.paths.some((path) => path.color === CARD_COLORS.ink)).toBe(false)
    expect(empty.texts.filter((text) => text.text === 'No grade yet')).toHaveLength(3)
  })

  it('draws no range and no total', () => {
    const texts = draw(cardModel({ triangle: all }))
      .texts.map((text) => text.text)
      .join(' ')
    expect(texts).not.toMatch(/range|total|\d+ to \d+/i)
  })

  it.each(FORMATS)('keeps every corner inside the margins on the %s card', (format) => {
    const { marginX, width } = CARD_FORMATS[format]
    for (const text of draw(cardModel({ triangle: all }), format).texts) {
      expect(text.x).toBeGreaterThanOrEqual(marginX)
      expect(text.x + text.width).toBeLessThanOrEqual(width - marginX)
    }
  })

  it('makes room for the corner words above the top vertex and below the lower ones', () => {
    const size = 300
    const { corners } = triangleGeometry(all.grades, size)
    expect(triangleHeight(size)).toBeGreaterThan(size)
    expect(triangleHeight(size)).toBeGreaterThan(corners.ride.tip.y)
  })
})

describe('the corners in words', () => {
  it('says each corner in one sentence, with a missing one as "no grade yet"', () => {
    expect(cornersSentence(TRIANGLE)).toBe(TRIANGLE_ALT)
    expect(cornersSentence(all)).toBe(
      `Running 64% ${lv(64)}, cycling 61% ${lv(61)} and lifting 48% ${lv(48)}.`,
    )
  })

  it('gives a corner a note in place of "No grade yet" when the page has one', () => {
    const { corners } = triangleGeometry(none.grades, 1)
    expect(cornerLines(corners.ride, 'Top of the scale')).toEqual(['Top of the scale', ''])
    expect(cornerLines(corners.ride)).toEqual(['No grade yet', ''])
  })
})
