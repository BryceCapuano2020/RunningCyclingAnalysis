import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import type { ChartSize, PlotBox } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN, plotBoxOf } from './plotBox'
import { DEFAULT_ROOT_PX, labelSizePx, labelWidthPx } from './rootFont'
import { BAND_CLEAR_PX, LABEL_REACH_EM, sharedTrendLayout } from './sharedTrendLayout'
import type { EndLabel, SharedLayout } from './sharedTrendLayout'

/** Sunday 12 January 2025, 23:59:59.999 UTC: the end of the first week. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

/** A rectangle on the chart, in px: a label's box, or one piece of the band. */
interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

/** Stands the root font at px, as rootFontPx reads it from the page. Undone after each test. */
function stubRootFont(px: number): void {
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('document', { documentElement: {} })
  vi.stubGlobal('getComputedStyle', () => ({ fontSize: `${px}px` }))
}

afterEach(() => vi.unstubAllGlobals())

function week(index: number, run: number | null, ride: number | null): SharedWeek {
  return {
    endMs: FIRST_END + index * 7 * DAY_MS,
    run,
    ride,
    rideLow: ride === null ? null : ride - 0.03,
    rideHigh: ride === null ? null : ride + 0.03,
    runCount: run === null ? 0 : 2,
    rideCount: ride === null ? 0 : 1,
  }
}

/** Running at 60 to 66 per cent, and riding at 52 to 58 with its range, with weeks where either is missing. */
const GRADE_WEEKS: SharedWeek[] = [
  week(0, 0.6, 0.52),
  week(1, 0.62, null),
  week(2, null, 0.54),
  week(3, 0.64, 0.56),
  week(4, null, null),
  week(5, 0.66, 0.58),
]

/** Every week has both sports, and the run finishes close to the ride's band, where its label would meet it. */
const CLOSE_WEEKS: SharedWeek[] = [
  week(0, 0.6, 0.57),
  week(1, 0.6, 0.57),
  week(2, 0.61, 0.58),
  week(3, 0.61, 0.58),
  week(4, 0.62, 0.59),
  week(5, 0.62, 0.59),
]

/** Running and riding at 60 per cent every week, so the two labels read the same and the run sits in the ride's band. */
const EQUAL_WEEKS: SharedWeek[] = [0, 1, 2, 3, 4, 5].map((index) => week(index, 0.6, 0.6))

/** Running at 58 per cent, inside the ride's band of 53 to 59, every week. */
const INSIDE_WEEKS: SharedWeek[] = [0, 1, 2, 3, 4, 5].map((index) => week(index, 0.58, 0.56))

/** Running only in the first week, so its label sits at the plot's left edge, where the y tick labels are. */
const FIRST_WEEK_RUN: SharedWeek[] = [week(0, 0.6, 0.52), week(1, null, 0.54), week(2, null, 0.56)]

/** Running falls to the bottom of the scale, so its label would sit below the plot. */
const FALLING_RUN: SharedWeek[] = [week(0, 0.6, null), week(1, 0.41, null)]

/**
 * The run's label starts clear of the ride band, which is the week before the ride's last point. The
 * ride's label sits just above it, so the spread between the labels pushes the run's down into the band.
 */
const SPREAD_WEEKS: SharedWeek[] = [week(0, 0.6, 0.55), week(1, 0.6, 0.5), week(2, null, 0.58)]

/** The run's latest point sits mid-window, so its label runs left from the middle of the plot at a 20 px root. */
const MID_RUN_WEEKS: SharedWeek[] = [
  week(0, 0.6, 0.52),
  week(1, 0.6, 0.53),
  week(2, 0.6, 0.54),
  week(3, null, 0.55),
  week(4, null, 0.56),
  week(5, null, 0.57),
]

/** The ride is drawn only between weeks 1 and 2, so the run's latest point, in week 3, sits where no ride is drawn. */
const BAND_SPAN_WEEKS: SharedWeek[] = [
  week(0, 0.6359, null),
  week(1, 0.4674, 0.551),
  week(2, 0.5693, 0.4541),
  week(3, 0.616, null),
]

/** The 585 px case from the review: the run ends high, and the ride's band steps up and down beside it. */
const BAND_WEEKS: SharedWeek[] = [
  week(0, 0.519, null),
  week(1, 0.5196, 0.4886),
  week(2, 0.6363, 0.6041),
  week(3, null, null),
  week(4, null, 0.4812),
  week(5, null, 0.5137),
  week(6, null, null),
]

/**
 * The ride is drawn in weeks 0 and 1 and again from week 3, so the stretch that leaves week 1 to week 2 is
 * not drawn. The run's latest point, in week 2, would meet that stretch if it were.
 */
const UNDRAWN_STRETCH_WEEKS: SharedWeek[] = [
  week(0, null, 0.6),
  week(1, 0.5, 0.58),
  week(2, 0.58, null),
  week(3, null, 0.6),
  week(4, null, 0.61),
]

/** A run that finishes beside a ride band which steps up from its third week to its fourth. */
const STEP_UP_WEEKS: SharedWeek[] = [
  week(0, 0.6476, 0.4345),
  week(1, null, null),
  week(2, null, 0.4715),
  week(3, 0.5541, 0.5812),
]

/** A run whose label can only touch the band, since no spot in the plot keeps 2 px clear of it. */
const TOUCH_ONLY_WEEKS: SharedWeek[] = [
  week(0, 0.6366, 0.5804),
  week(1, null, null),
  week(2, null, 0.6689),
  week(3, 0.5886, 0.5158),
  week(4, 0.5622, 0.6122),
  week(5, 0.5137, 0.6422),
  week(6, 0.5794, null),
]

/** A ride band that steps up at its last week, under a run whose label would otherwise sit over it. */
const LATE_STEP_WEEKS: SharedWeek[] = [
  week(0, null, null),
  week(1, 0.5245, null),
  week(2, null, 0.4345),
  week(3, 0.5085, 0.624),
]

const RUN_ONLY_WEEKS: SharedWeek[] = [week(0, 0.6, null), week(1, 0.62, null), week(2, 0.64, null)]

/**
 * Running at 60 per cent, but for a dip in its tenth week. The step back up at the eleventh week runs under
 * a label set below the latest point, which is the place the label prefers.
 */
const DIP_RUN_WEEKS: SharedWeek[] = Array.from({ length: 13 }, (_, i) =>
  week(i, i === 10 ? 0.599 : 0.6, null),
)
const RIDE_ONLY_WEEKS: SharedWeek[] = [
  week(0, null, 0.52),
  week(1, null, 0.54),
  week(2, null, 0.56),
]

/** A run that ends beside a ride band with several steps, at 480 px, where its label would sit over them. */
const STEPPED_BAND_WEEKS: SharedWeek[] = [
  week(0, null, 0.5421),
  week(1, 0.5629, 0.5905),
  week(2, null, 0.593),
  week(3, 0.5878, 0.6278),
  week(4, 0.6668, 0.537),
  week(5, 0.5706, 0.4538),
]

/** A week with the ride's range given as its own edges, wider than the other fixtures' fixed three points. */
function ranged(
  index: number,
  run: number | null,
  ride: number,
  low: number,
  high: number,
): SharedWeek {
  return { ...week(index, run, ride), rideLow: low, rideHigh: high }
}

/**
 * From the review: the run ends at 64 per cent, on the top edge of a wide ride band, and the nearest spot that
 * clears the band is eleven points below the run's point, beside the band's lower edge.
 */
const WIDE_BAND_WEEKS: SharedWeek[] = [
  ranged(0, 0.52, 0.465, 0.42, 0.512),
  ranged(1, 0.64, 0.58, 0.527, 0.64),
  ranged(2, 0.64, 0.58, 0.527, 0.64),
  ranged(3, null, 0.47, 0.425, 0.516),
]

/** The chart box at a width and height, laid out as ChartFrame lays out its plot. */
function sizeAt(width: number, height = 320): ChartSize {
  return {
    width,
    height,
    plot: plotBoxOf(width, height, PLOT_MARGIN.right, PLOT_BOTTOM_WITHOUT_X_TITLE),
    tooltipId: 'tooltip',
    hintId: 'hint',
  }
}

function layoutOf(weeks: SharedWeek[], width: number, height = 320): SharedLayout {
  const layout = sharedTrendLayout(weeks, 'grade', sizeAt(width, height))
  if (layout === null) throw new Error('The weeks give no layout')
  return layout
}

function labelOf(layout: SharedLayout, kind: EndLabel['kind']): EndLabel {
  const label = layout.labels.find((candidate) => candidate.kind === kind)
  if (label === undefined) throw new Error(`No ${kind} label`)
  return label
}

/** A label's box at a root font size: its estimated width, an em above its baseline and a quarter below, on the side it is anchored. */
function boxOf(label: EndLabel, rootPx = DEFAULT_ROOT_PX): Rect {
  const em = labelSizePx(rootPx)
  const width = labelWidthPx(label.text, rootPx)
  const left = label.anchor === 'start' ? label.at.x : label.at.x - width
  return { left, right: left + width, top: label.at.y - em, bottom: label.at.y + em / 4 }
}

/** A step connector at x: the vertical run between two edge heights. */
function vertical(x: number, a: number, b: number): Rect {
  return { left: x, right: x, top: Math.min(a, b), bottom: Math.max(a, b) }
}

/**
 * The ride band as stepBandPath draws it, in rectangles: a stretch from each week's x to the next, which
 * holds the earlier week's range, and the two step connectors at the later week's x. A stretch is drawn
 * only where both of its weeks have a range, since the band breaks at a week without one.
 */
function rideBand(layout: SharedLayout): Rect[] {
  return layout.xs.flatMap((left, i) => {
    const right = layout.xs[i + 1]
    const high = layout.rideHigh[i] ?? null
    const low = layout.rideLow[i] ?? null
    const nextHigh = layout.rideHigh[i + 1] ?? null
    const nextLow = layout.rideLow[i + 1] ?? null
    if (right === undefined || !high || !low || !nextHigh || !nextLow) return []
    return [
      { left, right, top: high.y, bottom: low.y },
      vertical(right, high.y, nextHigh.y),
      vertical(right, low.y, nextLow.y),
    ]
  })
}

/** The run's own stepped line as rectangles: each level from its week to the next, and each step's connector. */
function runLine(layout: SharedLayout): Rect[] {
  return layout.run.flatMap((point, i) => {
    const before = i === 0 ? null : (layout.run[i - 1] ?? null)
    if (point === null || before === null) return []
    return [
      { left: before.x, right: point.x, top: before.y, bottom: before.y },
      vertical(point.x, before.y, point.y),
    ]
  })
}

/** Whether a box meets any of the rectangles, each grown by pad px. Touching an edge does not count. */
function overlaps(box: Rect, band: readonly Rect[], pad = 0): boolean {
  return band.some(
    (rect) =>
      rect.left - pad < box.right &&
      rect.right + pad > box.left &&
      rect.top - pad < box.bottom &&
      rect.bottom + pad > box.top,
  )
}

function insidePlot(box: Rect, plot: PlotBox): boolean {
  return (
    box.left >= plot.left &&
    box.right <= plot.right &&
    box.top >= plot.top &&
    box.bottom <= plot.bottom
  )
}

describe('sharedTrendLayout end labels', () => {
  it('names each end label by its sport and value, at every width, since the title names the effort and window', () => {
    for (const width of [340, 479, 480]) {
      expect(layoutOf(GRADE_WEEKS, width).labels.map((label) => label.text)).toEqual([
        'Run 66%',
        'Ride 58%',
      ])
    }
  })

  it('keeps the run label clear of the ride band at 340 px', () => {
    const layout = layoutOf(GRADE_WEEKS, 340)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label clear of the ride band at 340 px when the run finishes on the ride’s band', () => {
    const layout = layoutOf(CLOSE_WEEKS, 340)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label within reach of its point at 340 px when both read 60%, since the band is too wide to clear', () => {
    const layout = layoutOf(EQUAL_WEEKS, 340)
    const point = layout.run.findLast((p) => p !== null)
    expect(Math.abs(labelOf(layout, 'run').at.y - (point?.y ?? 0))).toBeLessThanOrEqual(
      LABEL_REACH_EM * labelSizePx(DEFAULT_ROOT_PX),
    )
  })

  it('keeps the run label clear of the ride band at 340 px when the run lies inside the band', () => {
    const layout = layoutOf(INSIDE_WEEKS, 340)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label within reach of its point at 600 px, as at every width', () => {
    const layout = layoutOf(EQUAL_WEEKS, 600)
    const point = layout.run.findLast((p) => p !== null)
    expect(labelOf(layout, 'run').text).toBe('Run 60%')
    expect(Math.abs(labelOf(layout, 'run').at.y - (point?.y ?? 0))).toBeLessThanOrEqual(
      LABEL_REACH_EM * labelSizePx(DEFAULT_ROOT_PX),
    )
  })

  it('places a run label whose point is at the plot’s left edge to the right of the point, clear of the y tick labels', () => {
    const layout = layoutOf(FIRST_WEEK_RUN, 340)
    const label = labelOf(layout, 'run')
    expect(label.anchor).toBe('start')
    expect(boxOf(label).left).toBeGreaterThanOrEqual(sizeAt(340).plot.left)
  })

  it('keeps every end label inside the plot, so that none drops onto the x tick labels', () => {
    const layout = layoutOf(FALLING_RUN, 340)
    for (const label of layout.labels) {
      expect(insidePlot(boxOf(label), sizeAt(340).plot)).toBe(true)
    }
  })

  it('keeps the run label beside its point, over the band, where no spot in a short plot clears it', () => {
    const layout = layoutOf(EQUAL_WEEKS, 340, 140)
    const run = labelOf(layout, 'run')
    expect(run.anchor).toBe('end')
    expect(run.at.x).toBe((layout.run.at(-1)?.x ?? 0) - 8)
    expect(overlaps(boxOf(run), rideBand(layout))).toBe(true)
  })

  it('keeps the two end labels apart, box to box, where they read the same', () => {
    const layout = layoutOf(EQUAL_WEEKS, 340)
    const [first, second] = layout.labels.map((label) => boxOf(label))
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return
    expect(overlaps(first, [second])).toBe(false)
  })

  it('keeps a run label clear of the ride band when the spread between the labels would push it onto the band', () => {
    const layout = layoutOf(SPREAD_WEEKS, 340)
    const run = labelOf(layout, 'run')
    const ride = labelOf(layout, 'ride')
    expect(overlaps(boxOf(run), rideBand(layout))).toBe(false)
    expect(overlaps(boxOf(run), [boxOf(ride)])).toBe(false)
  })

  it('keeps every end label inside the plot horizontally at a 20 px root, when the run’s latest point is mid-window', () => {
    stubRootFont(20)
    const layout = layoutOf(MID_RUN_WEEKS, 480)
    expect(labelOf(layout, 'run').text).toBe('Run 60%')
    for (const label of layout.labels) {
      expect(insidePlot(boxOf(label, 20), sizeAt(480).plot)).toBe(true)
    }
  })

  it('keeps both end labels inside the plot when the plot is too short to hold them a gap apart', () => {
    stubRootFont(24)
    const layout = layoutOf(EQUAL_WEEKS, 480, 120)
    expect(layout.labels).toHaveLength(2)
    for (const label of layout.labels) {
      expect(insidePlot(boxOf(label, 24), sizeAt(480, 120).plot)).toBe(true)
    }
  })

  it('keeps the run label 2 px clear of the drawn band at 640 px, where the band steps up beside it', () => {
    const layout = layoutOf(STEP_UP_WEEKS, 640, 140)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout), BAND_CLEAR_PX)).toBe(false)
  })

  it('keeps the run label off the drawn band where it can only touch the band, not clear it', () => {
    const layout = layoutOf(TOUCH_ONLY_WEEKS, 640, 140)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label clear of the drawn band at 585 px, where the band steps up beneath its last week', () => {
    const layout = layoutOf(LATE_STEP_WEEKS, 585, 140)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label clear of the drawn band where the band is drawn only between the middle weeks', () => {
    const layout = layoutOf(BAND_SPAN_WEEKS, 585, 140)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label clear of the drawn band at 480 px, where the band steps beside it', () => {
    const layout = layoutOf(STEPPED_BAND_WEEKS, 480, 180)
    expect(overlaps(boxOf(labelOf(layout, 'run')), rideBand(layout))).toBe(false)
  })

  it('keeps the run label clear of the drawn band at 585 px, and 2 px from it', () => {
    const layout = layoutOf(BAND_WEEKS, 585, 140)
    const run = labelOf(layout, 'run')
    expect(overlaps(boxOf(run), rideBand(layout))).toBe(false)
    expect(overlaps(boxOf(run), rideBand(layout), BAND_CLEAR_PX)).toBe(false)
  })

  it('keeps the run label clear of the drawn band where the stretch it would meet is not drawn', () => {
    // The label's estimated width is padded, so it sits clear of the drawn stretch and of its own marker,
    // and the stretch that is not drawn does not count against it.
    const layout = layoutOf(UNDRAWN_STRETCH_WEEKS, 340, 320)
    const run = labelOf(layout, 'run')
    expect(overlaps(boxOf(run), rideBand(layout))).toBe(false)
    expect(overlaps(boxOf(run), rideBand(layout), BAND_CLEAR_PX)).toBe(false)
  })

  it('keeps the run label off the run’s own stepped line, where an earlier step would run under it', () => {
    const layout = layoutOf(DIP_RUN_WEEKS, 640)
    expect(overlaps(boxOf(labelOf(layout, 'run')), runLine(layout))).toBe(false)
  })

  it('labels a run alone, with no band, inside the plot', () => {
    const layout = layoutOf(RUN_ONLY_WEEKS, 480)
    expect(layout.labels.map((label) => label.kind)).toEqual(['run'])
    expect(rideBand(layout)).toEqual([])
    for (const label of layout.labels) {
      expect(insidePlot(boxOf(label), sizeAt(480).plot)).toBe(true)
    }
  })

  it('labels a ride alone, with its band, inside the plot', () => {
    const layout = layoutOf(RIDE_ONLY_WEEKS, 480)
    expect(layout.labels.map((label) => label.kind)).toEqual(['ride'])
    expect(rideBand(layout).length).toBeGreaterThan(0)
    for (const label of layout.labels) {
      expect(insidePlot(boxOf(label), sizeAt(480).plot)).toBe(true)
    }
  })

  it('keeps each end label beside its own point, over the band where the only clear spot is far away', () => {
    const layout = layoutOf(WIDE_BAND_WEEKS, 358)
    const reach = LABEL_REACH_EM * labelSizePx(DEFAULT_ROOT_PX)
    const run = labelOf(layout, 'run')
    const ride = labelOf(layout, 'ride')
    expect(
      Math.abs(run.at.y - (layout.run.findLast((p) => p !== null)?.y ?? 0)),
    ).toBeLessThanOrEqual(reach)
    expect(
      Math.abs(ride.at.y - (layout.ride.findLast((p) => p !== null)?.y ?? 0)),
    ).toBeLessThanOrEqual(reach)
  })
})
