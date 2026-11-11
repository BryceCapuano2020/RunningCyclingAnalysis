import { TRIANGLE_SPORTS, triangleGeometry } from '@rca/core/standing'
import type { Point, TriangleCorner, TriangleGeometry, TriangleSport } from '@rca/core/standing'
import { NO_GRADE_TEXT, TRIANGLE_TITLE } from '../ui/triangleSports'
import type { TriangleView } from '../ui/triangleSports'
import { CARD_COLORS } from './cardColors'
import {
  MONO_400,
  MONO_500,
  type Face,
  drawLines,
  metaStyle,
  setFont,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block } from './cardLayout'

/** A corner's three lines as the page sets them: the sport's name, its percent, then its level or "No grade yet". */
interface Words {
  label: TextStyle
  percent: TextStyle
  level: TextStyle
  height: number
}

/**
 * The corner words at a figure's size: they grow with the triangle, from the size the page sets them (a threshold's
 * unit label, 28 px, is the least the percent and the level read at) to half as large again.
 */
function wordsAt(size: number): Words {
  const k = Math.min(1.5, Math.max(1, size / 340))
  const at = (face: Face, px: number, line: number) => ({
    ...face,
    size: Math.round(px * k),
    lineHeight: Math.round(line * k),
  })
  const label = { ...metaStyle(Math.round(22 * k), Math.round(28 * k)) }
  const percent = at(MONO_500, 40, 46)
  const level = at(MONO_400, 28, 34)
  return { label, percent, level, height: label.lineHeight + percent.lineHeight + level.lineHeight }
}
/** The words of a corner take this much height, and sit this far from the vertex. */
const WORDS_GAP = 10
/** The dot's radius and its paper outline, in px at the figure's own size of 300 units. */
const DOT_RADIUS = 6
const DOT_OUTLINE = 3
const UNITS = 300
const SHAPE_FILL_ALPHA = 0.07

/** The ink of a corner's name and dot. */
const INK: Record<TriangleSport, string> = {
  run: CARD_COLORS.run,
  ride: CARD_COLORS.ride,
  lift: CARD_COLORS.lift,
}

/** What a corner says under its name: the percent and the level, or "No grade yet" for a sport with no grade. */
export function cornerLines(corner: TriangleCorner, note?: string): [string, string] {
  if (corner.percent === null) return [note ?? NO_GRADE_TEXT, '']
  return [`${corner.percent}%`, corner.level ?? '']
}

/** The corners in one sentence, for the image's description: "Running 61% Local, cycling 55% Recreational, lifting no grade yet." */
export function cornersSentence(view: TriangleView): string {
  const { corners } = triangleGeometry(view.grades, 1)
  const parts = TRIANGLE_SPORTS.map((sport, order) => {
    const [first, second] = cornerLines(corners[sport], view.notes[sport])
    const title = order === 0 ? TRIANGLE_TITLE[sport] : TRIANGLE_TITLE[sport].toLowerCase()
    const words = `${first} ${second}`.trim()
    return `${title} ${corners[sport].percent === null ? words.toLowerCase() : words}`
  })
  const last = parts.pop() ?? ''
  const text = `${parts.join(', ')} and ${last}`
  return `${text}.`
}

/** Where the figure's square sits in its block, and how tall the block is: room above the top vertex and below the lower ones for the words. */
function frame(size: number): { top: number; height: number } {
  const { height: words } = wordsAt(size)
  const { corners } = triangleGeometry(
    { run: { kind: 'gap' }, ride: { kind: 'gap' }, lift: { kind: 'gap' } },
    size,
  )
  const top = Math.max(0, words + WORDS_GAP - corners.run.tip.y)
  const bottom = Math.max(size, corners.ride.tip.y + WORDS_GAP + words)
  return { top, height: top + bottom }
}

/** The height of the figure's block at a square of `size`, words included. */
export function triangleHeight(size: number): number {
  return frame(size).height
}

function path(ctx: CardContext, points: readonly Point[], at: Point, close: boolean): void {
  ctx.beginPath()
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(at.x + point.x, at.y + point.y)
    else ctx.lineTo(at.x + point.x, at.y + point.y)
  })
  if (close) ctx.closePath()
}

function stroke(ctx: CardContext, color: string, width: number): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

/** The rings and axes: the outer triangle and the axes in the rule colour, the inner rings in the hairline. */
function drawFrame(ctx: CardContext, shape: TriangleGeometry, at: Point, unit: number): void {
  ctx.lineJoin = 'miter'
  shape.rings.forEach((ring, order) => {
    path(ctx, ring.points, at, true)
    stroke(ctx, order === 0 ? CARD_COLORS.rule : CARD_COLORS.hairline, unit)
  })
  for (const sport of TRIANGLE_SPORTS) {
    const corner = shape.corners[sport]
    path(ctx, [shape.centre, corner.tip], at, false)
    stroke(ctx, corner.dot === null ? CARD_COLORS.hairline : CARD_COLORS.rule, unit)
    if (corner.cap !== null) {
      ctx.lineCap = 'round'
      path(ctx, corner.cap, at, false)
      stroke(ctx, CARD_COLORS.control, 2 * unit)
      ctx.lineCap = 'butt'
    }
  }
}

/** The shape through the dots, in neutral ink, then each sport's dot in its own ink. */
function drawShape(ctx: CardContext, shape: TriangleGeometry, at: Point, unit: number): void {
  const { points, closed } = shape.shape
  if (points.length >= 2) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    path(ctx, points, at, closed)
    if (closed) {
      ctx.fillStyle = CARD_COLORS.ink
      ctx.globalAlpha = SHAPE_FILL_ALPHA
      ctx.fill()
      ctx.globalAlpha = 1
    }
    stroke(ctx, CARD_COLORS.ink, 2 * unit)
    ctx.lineCap = 'butt'
  }
  for (const sport of TRIANGLE_SPORTS) {
    const { dot } = shape.corners[sport]
    if (dot === null) continue
    ctx.beginPath()
    ctx.arc(at.x + dot.x, at.y + dot.y, DOT_RADIUS * unit, 0, 2 * Math.PI)
    ctx.fillStyle = INK[sport]
    ctx.fill()
    stroke(ctx, CARD_COLORS.paper, DOT_OUTLINE * unit)
  }
}

/** One corner's words, centred on its vertex: above the top vertex, below the lower ones. */
function drawWords(
  ctx: CardContext,
  sport: TriangleSport,
  view: TriangleView,
  corner: TriangleCorner,
  at: Point,
  bounds: { min: number; max: number },
  centre: number,
  words: Words,
): void {
  const { label: LABEL, percent: PERCENT, level: LEVEL } = words
  const above = sport === TRIANGLE_SPORTS[0]
  const top = above
    ? at.y + corner.tip.y - WORDS_GAP - words.height
    : at.y + corner.tip.y + WORDS_GAP
  const [first, second] = cornerLines(corner, view.notes[sport])
  const lines: [TextStyle, string, string][] = [
    [LABEL, TRIANGLE_TITLE[sport].toUpperCase(), INK[sport]],
    corner.percent === null
      ? [LEVEL, first, CARD_COLORS.secondary]
      : [PERCENT, first, CARD_COLORS.ink],
    [LEVEL, second, CARD_COLORS.secondary],
  ]
  const measure = (style: TextStyle, text: string): number => {
    setFont(ctx, style)
    return ctx.measureText(text).width
  }
  const widest = Math.max(...lines.map(([style, text]) => measure(style, text)))
  // The two lower corners' words keep off each other: the left block ends before the middle, the right one starts after it.
  const home = at.x + corner.tip.x - widest / 2
  const apart =
    sport === 'lift'
      ? Math.min(home, centre - WORDS_GAP - widest)
      : sport === 'ride'
        ? Math.max(home, centre + WORDS_GAP)
        : home
  const shift = Math.min(Math.max(apart, bounds.min), bounds.max - widest) - home
  let y = top
  for (const [style, text, color] of lines) {
    if (text !== '') {
      const left = at.x + corner.tip.x - measure(style, text) / 2 + shift
      drawLines(ctx, [text], left, y, style, color)
    }
    y += style.lineHeight
  }
}

/**
 * The level triangle as a block, drawn from `triangleGeometry` at a square of `size` px centred in the content width. The same
 * grades, colours and corner words as the page, with no range and no total. Each corner reads label over percent over level.
 */
export function triangleBlock(
  ctx: CardContext,
  view: TriangleView,
  x: number,
  contentWidth: number,
  size: number,
): Block {
  const { top, height } = frame(size)
  return {
    height,
    draw: (y) => {
      const shape = triangleGeometry(view.grades, size)
      const at = { x: x + (contentWidth - size) / 2, y: y + top }
      const unit = size / UNITS
      drawFrame(ctx, shape, at, unit)
      drawShape(ctx, shape, at, unit)
      ctx.textAlign = 'left'
      for (const sport of TRIANGLE_SPORTS) {
        drawWords(
          ctx,
          sport,
          view,
          shape.corners[sport],
          at,
          { min: x, max: x + contentWidth },
          at.x + shape.centre.x,
          wordsAt(size),
        )
      }
    },
  }
}
