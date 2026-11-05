import { energyReading } from '../ui/components/balanceScale'
import { interval } from '../ui/components/fixtures'
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
 * Records what the renderer draws. Text is as wide as its face makes it per character (see
 * measureText), so wrapping at a width depends on the size the renderer chose.
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

  /** Plex Mono is 0.6 em a character and Newsreader about 0.5, as the faces measure on a real canvas. */
  measureText(text: string) {
    const em = this.font.includes('IBM Plex Mono') ? 0.6 : 0.5
    return { width: text.length * this.size() * em }
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

/** A run's level, and a ride's, as the levels line writes them. */
export const RUN_GRADE = { percent: '64%', level: 'Local' }
export const RIDE_GRADE = { percent: '61%', level: 'Recreational' }
/** The longest level name, on both sports, and a name that fills the top row: the worst the card is tested at. */
export const LONG_GRADE = {
  percent: '61%',
  level: 'Recreational with a model range set by the standards of the age group',
}
export const LONG_NAME = 'Riley Example Longname-Hyphenated Jr'

/** A card with a meter, both estimates and their levels, the period's dates, a footnote and an origin. */
export function cardModel(overrides: Partial<ShareCardModel> = {}): ShareCardModel {
  return {
    title: 'RunningCyclingAnalysis',
    headline: 'Your balance leans toward running',
    meter: energyReading(interval(1.05, 1.12, 1.2)),
    informedByHeartRate: false,
    heroes: [
      {
        sport: 'run',
        label: 'Run threshold',
        figure: { number: '21:35', unit: '/km' },
        sub: null,
        grade: RUN_GRADE,
      },
      {
        sport: 'ride',
        label: 'Ride threshold',
        figure: { number: '48', unit: 'W' },
        sub: '0.6 W/kg',
        grade: RIDE_GRADE,
      },
    ],
    period: '12 May – 3 Aug 2025',
    footnote: 'Age-graded on USATF road standards.',
    origin: 'example.test',
    badge: null,
    name: null,
    ...overrides,
  }
}

/** A headline long enough that it cannot fit two lines at any size on the card. */
export const LONG_HEADLINE =
  'Your balance leans toward running, with a range that depends on every one of the population assumptions behind both sports and on how their efficiency was estimated from your files'

/** A footnote long enough to wrap onto several lines of the card. */
export const LONG_FOOTNOTE =
  'Estimated from heart rate, pace and power files, and the model assumes that heart rate responds to energy use in a similar way in both sports, so the comparison can move with your data.'
