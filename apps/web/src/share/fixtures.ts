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
    this.paths.push({ op: 'fill', color: this.fillStyle, width: 0, segments: [...this.segments] })
  }

  stroke() {
    this.paths.push({
      op: 'stroke',
      color: this.strokeStyle,
      width: this.lineWidth,
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

/** A card with a meter, both estimates, a period, a caveat, a footnote and an origin. */
export function cardModel(overrides: Partial<ShareCardModel> = {}): ShareCardModel {
  return {
    title: 'RunningCyclingAnalysis',
    headline: 'Your balance leans toward running',
    meter: { lean: 'run', ratio: interval(1.05, 1.12, 1.2) },
    heroes: [
      {
        sport: 'run',
        label: 'Running threshold pace, estimated',
        figure: { number: '21:35', unit: '/km' },
        sub: null,
        prompt: null,
      },
      {
        sport: 'ride',
        label: 'Cycling threshold power, estimated',
        figure: { number: '48', unit: 'W' },
        sub: '0.6 W/kg',
        prompt: null,
      },
    ],
    period: 'Last 6 weeks',
    caveat: 'Best efforts over 20 min may not have been all-out.',
    footnote: 'Estimated from my own files. Compares my two sports; not a ranking.',
    origin: 'https://example.test',
    badge: null,
    ...overrides,
  }
}

/** The card while only running has an estimate: cycling is a prompt, and there is no meter. */
export function missingRideModel(): ShareCardModel {
  return cardModel({
    headline: 'Your running so far',
    meter: null,
    heroes: [
      {
        sport: 'run',
        label: 'Running threshold pace, estimated',
        figure: { number: '21:35', unit: '/km' },
        sub: null,
        prompt: null,
      },
      {
        sport: 'ride',
        label: 'Cycling threshold power, estimated',
        figure: null,
        sub: null,
        prompt: 'Add rides to see the balance',
      },
    ],
  })
}

/** A headline long enough that it cannot fit two lines at any size on the card. */
export const LONG_HEADLINE =
  'Your balance leans toward running, with a range that depends on every one of the population assumptions behind both sports and on how their efficiency was estimated from your files'

/** A caveat that takes two lines on the card, with the words the heart-rate check would give. */
export const LONG_CAVEAT =
  'Best cycling efforts over the full sixty minutes of the period may not have been all-out, so the figure may be low.'

/** A footnote long enough to wrap onto several lines of the card. */
export const LONG_FOOTNOTE =
  'Estimated from heart rate, pace and power files, and the model assumes that heart rate responds to energy use in a similar way in both sports, so the comparison can move with your data.'
