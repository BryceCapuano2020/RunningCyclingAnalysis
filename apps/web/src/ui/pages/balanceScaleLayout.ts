import { bandsIn, fitAxis, ticksIn, xAt } from './balanceScaleAxis'
import type { Axis } from './balanceScaleAxis'
import type { ScaleLane, ScaleModel } from './balanceScaleModel'
import { COMPACT, COMPACT_MAX_WIDTH, DESKTOP, GAP, PAD, textWidth } from './balanceScaleText'
import type {
  Anchor,
  BandBox,
  Connector,
  GhostBox,
  LaneBox,
  Metrics,
  RangeLabel,
  Rect,
  SubForm,
} from './balanceScaleText'

export { COMPACT_MAX_WIDTH, textWidth }
export type {
  Anchor,
  BandBox,
  Connector,
  GhostBox,
  LaneBox,
  RangeLabel,
  Rect,
  SubForm,
  TextAt,
} from './balanceScaleText'

export interface ScaleLayout {
  width: number
  height: number
  compact: boolean
  metrics: Metrics
  axis: Axis
  plot: { left: number; right: number; top: number; bottom: number }
  bands: BandBox[]
  ticks: { percent: number; x: number; anchor: Anchor }[]
  lanes: LaneBox[]
  /** The connector between the two marks: null for a lone lane, which has no other mark to join. */
  connector: Connector | null
  ghost: GhostBox | null
  /** Every box that holds text, so a test can check no two overlap. */
  boxes: Rect[]
}

/** The metrics for a width, with every size but the tick gap grown by the root font size's scale. */
function metricsFor(compact: boolean, scale: number): Metrics {
  return Object.fromEntries(
    Object.entries(compact ? COMPACT : DESKTOP).map(([key, value]) => [
      key,
      key === 'tickGap' ? value : value * scale,
    ]),
  ) as unknown as Metrics
}

/** The room a lane's header takes: its name over its line, or the grade beside them if that is taller. */
function headerHeight(m: Metrics): number {
  return Math.max(m.bigFs * 0.85, m.nameFs * 1.25 + 3 + m.smallFs * 1.3)
}

/**
 * The drawing's rows, top to bottom: the band names, the first lane's header, its mark, the connector's row, the
 * second lane's mark, its range ends, and its header below, which keeps the connector's row clear of every text.
 * A lone lane is its header, its mark and its range ends. Every y follows from the metrics, and every x from the
 * axis and the width, so the same figures always draw the same.
 */
export function scaleLayout(model: ScaleModel, width: number, rootPx = 16): ScaleLayout {
  const compact = width < COMPACT_MAX_WIDTH
  const m = metricsFor(compact, rootPx / 16)
  const axis = fitAxis([
    ...model.lanes.flatMap((lane) => [
      lane.centre,
      lane.low ?? lane.centre,
      lane.high ?? lane.centre,
    ]),
    ...(model.target === null ? [] : [model.target.at]),
  ])
  const xOf = (percent: number) => xAt(axis, 0, width, percent)
  const bands: BandBox[] = bandsIn(axis).map((band) => {
    const x = xOf(band.from)
    const w = xOf(band.to) - x
    const fits = textWidth(band.name.toUpperCase(), m.labelFs, 'display') + PAD <= w * 1.05
    return Object.assign({ x, w, label: fits ? band.name : null }, band)
  })
  const ticks = ticksIn(axis).map((percent, index, all) => ({
    percent,
    x: xOf(percent),
    anchor: (index === 0 ? 'start' : index === all.length - 1 ? 'end' : 'middle') as Anchor,
  }))

  const boxes: Rect[] = []
  const header = headerHeight(m)
  const rangeRow = m.smallFs + 8
  const hasRange = (lane: ScaleLane) => lane.low !== null && lane.high !== null
  const top = model.lanes[0]!
  // The first lane's header sits under the band names; its mark under that.
  const headerTop = m.plotTop + 6
  const topY = headerTop + header + m.headerGap + m.capH / 2
  // The connector's row follows the first lane's mark, and its range ends if it has them (a run has none).
  const barRow = m.barZone + (hasRange(top) ? rangeRow : 0)
  const bottomY = topY + m.capH / 2 + barRow + m.capH / 2
  const ys = [topY, bottomY]

  const lanes = model.lanes.map((lane, index): LaneBox => {
    const y = ys[index]!
    const x = xOf(lane.centre)
    const band =
      lane.low === null || lane.high === null ? null : { x1: xOf(lane.low), x2: xOf(lane.high) }
    // The first lane's header is above its mark; the second's is below its range ends.
    const rangesBottom = y + m.capH / 2 + (band === null ? 0 : rangeRow)
    const top0 = index === 0 ? headerTop : rangesBottom + m.headerGap
    // The grade is in the display face at 1.25 of the estimate: its percent sign runs wide.
    const pctW = textWidth(lane.pct, m.bigFs, 'display') * 1.25
    const textX = PAD + pctW + GAP
    const room = width - PAD - textX
    const forms: [SubForm, string][] = [
      ['full', lane.sub],
      ['short', lane.subShort],
      ['level', lane.level],
    ]
    const [subForm, subText] =
      forms.find(([, text]) => textWidth(text, m.smallFs, 'body') <= room) ?? forms[2]!
    const nameH = m.nameFs * 1.25
    const name = { x: textX, y: top0 }
    const sub = { x: textX, y: top0 + nameH + 3 + m.smallFs, anchor: 'start' as const }
    const pct = { x: PAD, y: top0 + (header + m.bigFs * 0.72) / 2, anchor: 'start' as const }
    boxes.push({ x: PAD, y: top0, w: pctW, h: header })
    boxes.push({
      x: textX,
      y: top0,
      w: Math.max(
        textWidth(lane.sport.toUpperCase(), m.nameFs, 'display') +
          m.nameFs * 1.4 +
          16 +
          textWidth(lane.basisText, m.nameFs * 0.7, 'body'),
        textWidth(subText, m.smallFs, 'body'),
      ),
      h: header,
    })
    return {
      sport: lane.sport,
      kind: band === null ? 'dot' : 'ring',
      x,
      y,
      band,
      name,
      pct,
      sub,
      subForm,
      ranges:
        band === null
          ? []
          : rangeLabels(lane, band, y + m.capH / 2 + m.smallFs + 2, width, m, boxes),
    }
  })

  const first = lanes[0]!
  const second = lanes[1]
  const ghost = placeGhost(model, lanes, xOf, m)
  const last = lanes[lanes.length - 1]!
  // The plot ends under the last lane's header; a lone lane's header is above its mark, so it ends under its range ends.
  const plotBottom =
    lanes.length === 1
      ? first.y + m.capH / 2 + (first.band === null ? 0 : rangeRow) + 4
      : last.name.y + header + 4
  const connector: Connector | null =
    second === undefined
      ? null
      : {
          x1: first.x,
          x2: second.x,
          y: first.y + m.capH / 2 + (first.band === null ? 0 : rangeRow) + m.barZone / 2,
          y1: first.y + m.markR + 2,
          y2: second.y - m.markR - 2,
        }
  return {
    width,
    // The tick labels' baseline, and room under it for the letters' tails.
    height: plotBottom + m.tickGap + m.smallFs * 0.45,
    compact,
    metrics: m,
    axis,
    plot: { left: 0, right: width, top: m.plotTop, bottom: plotBottom },
    bands,
    ticks,
    lanes,
    connector,
    ghost,
    boxes,
  }
}

/** An estimate's range ends under its band: one each, or one for both where two would meet. */
function rangeLabels(
  lane: ScaleLane,
  band: { x1: number; x2: number },
  y: number,
  width: number,
  m: Metrics,
  boxes: Rect[],
): RangeLabel[] {
  const place = (text: string, x: number): RangeLabel => {
    const w = textWidth(text, m.smallFs, 'body')
    const centre = Math.min(Math.max(x, PAD + w / 2), width - PAD - w / 2)
    boxes.push({ x: centre - w / 2, y: y - m.smallFs, w, h: m.smallFs * 1.2 })
    return { text, x: centre, y, anchor: 'middle' }
  }
  const low = lane.rangeLow ?? ''
  const high = lane.rangeHigh ?? ''
  const each = textWidth(low, m.smallFs, 'body') / 2 + textWidth(high, m.smallFs, 'body') / 2 + 8
  if (band.x2 - band.x1 >= each) return [place(low, band.x1), place(high, band.x2)]
  return [place(`${low}–${high}`, (band.x1 + band.x2) / 2)]
}

/** The ghost ring in the lower sport's lane at the higher sport's grade, with the guide up to the grade it matches. */
function placeGhost(
  model: ScaleModel,
  lanes: LaneBox[],
  xOf: (percent: number) => number,
  m: Metrics,
): GhostBox | null {
  const target = model.target
  const lower = target === null ? undefined : lanes.find((lane) => lane.sport === target.sport)
  const leader = lanes.find((lane) => lane !== lower)
  if (target === null || lower === undefined || leader === undefined) return null
  const x = xOf(target.at)
  const towards = leader.y < lower.y ? -1 : 1
  return {
    x,
    y: lower.y,
    guide: { x, y1: leader.y - towards * (m.markR + 2), y2: lower.y + towards * (m.markR + 2) },
  }
}
