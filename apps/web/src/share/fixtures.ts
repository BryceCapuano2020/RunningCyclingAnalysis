import { energyReading } from '../ui/components/balanceScale'
import { interval } from '../ui/components/fixtures'
import { HEADLINE_LABEL } from '../ui/grades'
import { effortLabel } from '../ui/records'
import { THRESHOLD_EFFORT_TEXT } from '../ui/sports'
import type { CardFormat } from './cardLayout'
import type { ShareCardModel } from './cardModel'
import { renderShareCard } from './renderCard'

export interface RecordedText {
  text: string
  x: number
  y: number
  size: number
  width: number
  color: string
  font: string
  /** The canvas text baseline: 'top' for the top of a line, 'alphabetic' for its baseline. */
  baseline: string
}

export interface RecordedRect {
  x: number
  y: number
  w: number
  h: number
  color: string
}

/** A filled or stroked path, with the commands it was built from. */
export interface RecordedPath {
  op: 'fill' | 'stroke'
  color: string
  width: number
  /** The global alpha the path was drawn at. */
  alpha: number
  segments: string[]
}

export interface RecordedArc {
  x: number
  y: number
  r: number
}

/**
 * Records what the renderer draws. Text is half an em per character, so wrapping at a width
 * depends on the size the renderer chose.
 */
export class FakeContext {
  fillStyle = ''
  strokeStyle = ''
  font = ''
  lineWidth = 0
  lineCap = ''
  lineJoin = ''
  globalAlpha = 1
  textBaseline = ''
  textAlign = ''
  texts: RecordedText[] = []
  rects: RecordedRect[] = []
  paths: RecordedPath[] = []
  arcs: RecordedArc[] = []
  private segments: string[] = []

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

  /** Records the left edge of the text, as the canvas places it for the current alignment. */
  fillText(text: string, x: number, y: number) {
    const width = this.measureText(text).width
    const left =
      this.textAlign === 'right' ? x - width : this.textAlign === 'center' ? x - width / 2 : x
    this.texts.push({
      text,
      x: left,
      y,
      size: this.size(),
      width,
      color: this.fillStyle,
      font: this.font,
      baseline: this.textBaseline,
    })
  }

  beginPath() {
    this.segments = []
  }

  moveTo() {
    this.segments.push('moveTo')
  }

  lineTo() {
    this.segments.push('lineTo')
  }

  bezierCurveTo() {
    this.segments.push('bezierCurveTo')
  }

  closePath() {
    this.segments.push('closePath')
  }

  arc(x: number, y: number, r: number) {
    this.segments.push('arc')
    this.arcs.push({ x, y, r })
  }

  fill() {
    this.paths.push({
      op: 'fill',
      color: this.fillStyle,
      width: 0,
      alpha: this.globalAlpha,
      segments: [...this.segments],
    })
  }

  stroke() {
    this.paths.push({
      op: 'stroke',
      color: this.strokeStyle,
      width: this.lineWidth,
      alpha: this.globalAlpha,
      segments: [...this.segments],
    })
  }
}

/** A canvas stand-in whose 2D context is the recording one, or null when it has none. */
export function fakeCanvas(ctx: FakeContext | null) {
  return { width: 0, height: 0, getContext: () => ctx }
}

/** Draws the model in the format on a recording canvas: whether it fitted, and what was drawn. */
export function render(
  model: ShareCardModel,
  format: CardFormat = 'square',
): { ok: boolean; ctx: FakeContext } {
  const ctx = new FakeContext()
  const ok = renderShareCard(model, fakeCanvas(ctx) as unknown as HTMLCanvasElement, format)
  return { ok, ctx }
}

/** Draws the model in the format on a recording canvas, and returns what was drawn. */
export function draw(model: ShareCardModel, format: CardFormat = 'square'): FakeContext {
  return render(model, format).ctx
}

/** The magnitude line the card states under its headline: the grade gap in points, with its range. */
export const MAGNITUDE = 'Running grades 6 points higher than cycling'
/** A run's level line, and a ride's, as the grade line writes them. */
export const RUN_GRADE = `Local · 64% on best ${HEADLINE_LABEL}`
export const RIDE_GRADE = `Estimated · Recreational · 61% on best ${HEADLINE_LABEL}`
/** A magnitude and a grade line long enough to take two lines, as a long range or name would. */
export const LONG_MAGNITUDE =
  'Running grades 16 points higher than cycling, with a range from 4 to 28 points that depends on the heart-rate check and the population model'
export const LONG_GRADE = `Estimated · Recreational to Local · 61% on best ${HEADLINE_LABEL}, with the model range set by the standards`

/** A card with a meter, both estimates and their levels, a magnitude, a period, a caveat, a footnote and an origin. */
export function cardModel(overrides: Partial<ShareCardModel> = {}): ShareCardModel {
  return {
    title: 'RunningCyclingAnalysis',
    headline: 'Your balance leans toward running',
    magnitude: MAGNITUDE,
    meter: energyReading(interval(1.05, 1.12, 1.2)),
    heroes: [
      {
        sport: 'run',
        label: `Threshold flat pace, estimated from your best ${THRESHOLD_EFFORT_TEXT}`,
        figure: { number: '21:35', unit: '/km' },
        sub: null,
        grade: RUN_GRADE,
      },
      {
        sport: 'ride',
        label: `Threshold power, estimated from your best ${THRESHOLD_EFFORT_TEXT}`,
        figure: { number: '48', unit: 'W' },
        sub: '0.6 W/kg',
        grade: RIDE_GRADE,
      },
    ],
    period: 'Last 6 weeks',
    caveat: `Best efforts over ${HEADLINE_LABEL} may not have been your hardest.`,
    footnote: 'Graded on the USATF road standards. A level, not a ranking.',
    origin: 'example.test',
    badge: null,
    ...overrides,
  }
}

/** A headline long enough that it cannot fit two lines at any size on the card. */
export const LONG_HEADLINE =
  'Your balance leans toward running, with a range that depends on every one of the population assumptions behind both sports and on how their efficiency was estimated from your files'

/**
 * The longest caveat the card draws, and the one the layout is tested at. It is at least as long as every
 * effortCaveat short line at every duration the app names (fixtures.test.ts), and it takes two lines on the
 * card.
 */
export const LONG_CAVEAT = `Best cycling efforts over the full ${effortLabel(3600)} may not have been your hardest, so the figure may be low.`

/** A footnote long enough to wrap onto several lines of the card. */
export const LONG_FOOTNOTE =
  'Estimated from heart rate, pace and power files, and the model assumes that heart rate responds to energy use in a similar way in both sports, so the comparison can move with your data.'
