// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DAY_MS } from '@rca/core/constants'
import { levelOf } from '@rca/core/grade'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WEIGHT_PROMPT_PARTS } from '../weightCopy'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { HELD_EMPTY } from './sharedTrendText'
import { SharedTrendChart } from './SharedTrendChart'
import type { SharedTrendChartProps } from './SharedTrendChart'
import type { SharedWeek } from './gradeTrend'

/** Sunday 12 January 2025, 23:59:59.999 UTC: the end of the first week. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

/** A week with a run and a ride value. A grade trend also gives the ride its range, 0.03 either side. */
function week(index: number, run: number | null, ride: number | null, ranged = true): SharedWeek {
  return {
    endMs: FIRST_END + index * 7 * DAY_MS,
    run,
    ride,
    rideLow: ride !== null && ranged ? ride - 0.03 : null,
    rideHigh: ride !== null && ranged ? ride + 0.03 : null,
    runCount: run === null ? 0 : 2,
    rideCount: ride === null ? 0 : 1,
  }
}

/** Running at 60 to 66 per cent of the standard, and riding at 52 to 58, over six weeks. */
const GRADE_WEEKS: SharedWeek[] = [
  week(0, 0.6, 0.52),
  week(1, 0.62, null),
  week(2, null, 0.54),
  week(3, 0.64, 0.56),
  week(4, null, null),
  week(5, 0.66, 0.58),
]

const TWO_WEEKS = 14
const TWENTY_MINUTES_S = 1200

function renderChart(overrides: Partial<SharedTrendChartProps> = {}) {
  const props: SharedTrendChartProps = {
    weeks: GRADE_WEEKS,
    windowDays: TWO_WEEKS,
    effortS: TWENTY_MINUTES_S,
    latestStartMs: { run: null, ride: null },
    ...overrides,
  }
  return render(<SharedTrendChart {...props} />)
}

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
  class SizedObserver {
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe() {
      const entry = { contentRect: { width } } as unknown as ResizeObserverEntry
      this.callback([entry], this as unknown as ResizeObserver)
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', SizedObserver)
}

/** A window narrow enough that the end labels are values and a mark, so the key that names the lines is drawn. */
function narrowWindow() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('500px'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SharedTrendChart', () => {
  it('says what it measures under its title: the effort and the window, in one scale for both sports', () => {
    renderChart()
    expect(screen.getByText('Age grade of your best 20 min, trailing 2 weeks')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Run and ride age grades/ })).toBeInTheDocument()
  })

  it('draws running as a solid line with a dot per week, and cycling as a line with rings, never dashed', () => {
    const { container } = renderChart()
    const lines = Array.from(container.querySelectorAll('[data-testid="trend-line"]'))
    expect(lines.map((line) => line.getAttribute('data-sport'))).toEqual(['run', 'ride'])
    expect(container.querySelector('.chart-series__line--estimate')).toBeNull()
    // Smoothed: each line is a curve, with cubic segments between its points.
    expect(lines[0]?.getAttribute('d')).toMatch(/C/)
    expect(
      container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]'),
    ).toHaveLength(4)
    expect(
      container.querySelectorAll('[data-testid="trend-ring"][data-sport="ride"]'),
    ).toHaveLength(4)
  })

  it('reads the week nearest the pointer, as a smoothed line is drawn', () => {
    renderChart()
    // The weeks are about 100 px apart on the fallback chart; 70% of the way between two is nearer the later.
    const { left, right } = { left: 56, right: 640 - 16 }
    const step = (right - left) / 5
    fireEvent.pointerMove(screen.getByTestId('plot-surface'), {
      clientX: left + step + 0.7 * step,
      clientY: 100,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Sun 26 Jan')
  })

  it('keeps one label per sport when both latest values read the same, and warns about no key', () => {
    chartWidth(640)
    const warnings = vi.spyOn(console, 'error').mockImplementation(() => {})
    const weeks = [week(0, 0.64, 0.64, true), week(1, 0.66, 0.66, true)]
    const { rerender } = renderChart({ weeks })
    expect(screen.getByText('Run 66%')).toBeInTheDocument()
    expect(screen.getByText('Ride 66%')).toBeInTheDocument()
    rerender(
      <SharedTrendChart
        weeks={weeks}
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
        latestStartMs={{ run: null, ride: null }}
      />,
    )
    expect(screen.getByText('Run 66%')).toBeInTheDocument()
    expect(screen.getByText('Ride 66%')).toBeInTheDocument()
    const keyWarnings = warnings.mock.calls.filter((call) => String(call[0]).includes('same key'))
    expect(keyWarnings).toEqual([])
    warnings.mockRestore()
  })

  it('enlarges the hovered week’s marker, and not only the latest value', () => {
    const { container } = renderChart()
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const runMarkers = Array.from(
      container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]'),
    )
    const hovered = Number(runMarkers[0]?.getAttribute('r'))
    const plain = Number(runMarkers[1]?.getAttribute('r'))
    expect(hovered).toBeGreaterThan(plain)
  })

  it('titles the tooltip with its week alone, since the card title already names the effort and window', () => {
    renderChart()
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('Week ending Sun 12 Jan 2025')
    expect(tooltip).not.toHaveTextContent('best 20 min')
  })

  it('names cycling as an estimate in the tooltip, with its key dashed and only its level beneath', () => {
    const { container } = renderChart({ weeks: [week(0, 0.6, 0.52), week(1, 0.62, 0.54)] })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(within(tooltip).getByText('Ride, estimated')).toBeInTheDocument()
    expect(tooltip).not.toHaveTextContent('Estimated from its running equivalent')
    expect(levelOf(0.52)).not.toBeNull()
    expect(tooltip).toHaveTextContent(`${levelOf(0.52)}`)
    const rideKey = tooltip.querySelector('.chart-tooltip__key--dashed-ride')
    expect(rideKey).toHaveClass('chart-tooltip__key--dashed')
    expect(tooltip.querySelector('.chart-tooltip__key--ride')).toBeNull()
    expect(container.querySelector('.chart-tooltip__key--dashed')).not.toBeNull()
  })

  it('says no cycling was ridden in a week with no ride, in the tooltip, as the trend chart does', () => {
    renderChart({ weeks: [week(0, 0.6, 0.52), week(1, 0.62, null)] })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('No rides in the window')
  })

  it('draws each line as one smooth curve through its weeks, never as steps', () => {
    const { container } = renderChart({
      weeks: [week(0, 0.6, null), week(1, 0.62, null), week(2, 0.61, null)],
    })
    const line = container.querySelector('[data-testid="trend-line"]')
    expect(line?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+(C[\d. ]+){2}$/)
    expect(line?.getAttribute('d')).not.toMatch(/[HV]/)
  })

  it('breaks the line where eight weeks or more had no effort, and says so under the chart', () => {
    const gap = Array.from({ length: 24 }, (_, i) =>
      week(i, i >= 6 && i < 14 ? null : 0.6 + (i % 5) / 100, null),
    )
    const { container } = renderChart({ weeks: gap })
    const d = container.querySelector('[data-testid="trend-line"]')?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(2)
    expect(container.querySelector('.chart-about')).toHaveTextContent(
      'A line breaks where 8 weeks or more passed with no qualifying effort.',
    )
    // Seven empty weeks are bridged, and the note is left out.
    const short = Array.from({ length: 24 }, (_, i) => week(i, i >= 6 && i < 13 ? null : 0.6, null))
    cleanup()
    const bridged = renderChart({ weeks: short })
    expect(
      bridged.container.querySelector('[data-testid="trend-line"]')?.getAttribute('d')?.match(/M/g),
    ).toHaveLength(1)
    expect(bridged.container.querySelector('.chart-about')).not.toHaveTextContent('breaks')
  })

  it('draws a span past 26 weeks by the month, says so, and heads the table by month', () => {
    const long = Array.from({ length: 60 }, (_, i) => week(i, 0.6 + (i % 7) / 100, 0.5))
    const { container } = renderChart({ weeks: long })
    expect(container.querySelector('.chart-about')).toHaveTextContent(
      'Past 26 weeks each point is a month',
    )
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers[0]).toBe('Month to')
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(20)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Average of 3 weeks')
  })

  it('names the two sports in a legend, with cycling marked as an estimate, when both have values', () => {
    narrowWindow()
    renderChart()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Run, as recorded')).toBeInTheDocument()
    expect(within(legend).getByText('Ride, estimated')).toBeInTheDocument()
  })

  it('shows the cycling key alone, as a one-entry legend, when only cycling has values', () => {
    narrowWindow()
    renderChart({
      weeks: [week(0, null, 0.52), week(1, null, null), week(2, null, 0.54), week(3, null, 0.56)],
    })
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('Ride, estimated')
    expect(legend).not.toHaveTextContent('Run')
  })

  it('shows the running key alone when only running has values, so the one line is named', () => {
    narrowWindow()
    renderChart({
      weeks: [week(0, 0.6, null), week(1, 0.62, null), week(2, null, null), week(3, 0.64, null)],
    })
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('Run, as recorded')
    expect(legend).not.toHaveTextContent('Ride')
  })

  it('holds cycling while a weight is missing: no ride line, ring, band, key or column, and it says so', () => {
    narrowWindow()
    const { container } = renderChart({ rideKnown: false })
    expect(container.querySelector('[data-testid="trend-line"][data-sport="ride"]')).toBeNull()
    expect(container.querySelector('[data-testid="trend-ring"]')).toBeNull()
    expect(container.querySelector('[data-testid="trend-band"]')).toBeNull()
    // Running alone is one solid key, which names its line.
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Run, as recorded')
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toEqual(['Week ending', 'Run grade', 'Runs'])
    expect(screen.getByText(/Cycling is held until a weight is added/)).toBeInTheDocument()
  })

  it('labels the latest values with their sport and value on a wide chart', () => {
    chartWidth(640)
    const { container } = renderChart()
    const labels = Array.from(container.querySelectorAll('.annot--end .annot__text--label')).map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['Run 66%', 'Ride 58%'])
  })

  it('labels a narrow chart’s latest values with the mark of their line, a dot for run and a ring for ride', () => {
    chartWidth(340)
    const { container } = renderChart()
    const labels = Array.from(container.querySelectorAll('.annot--end .annot__text--label')).map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['● 66%', '○ 58%'])
    expect(container.querySelectorAll('.annot--end .annot__glyph')).toHaveLength(2)
  })

  it('keeps the two end labels apart where both lines end on the same value', () => {
    chartWidth(640)
    const { container } = renderChart({ weeks: [week(0, 0.6, 0.6), week(1, 0.6, 0.6)] })
    const [run, ride] = Array.from(container.querySelectorAll('.annot--end .annot__text--label'))
    const gap = Math.abs(Number(run?.getAttribute('y')) - Number(ride?.getAttribute('y')))
    // One line of label (14 px) apart, so neither is set over the other.
    expect(gap).toBeGreaterThanOrEqual(14)
  })

  it('names a run that stops at the first week beside its own end, not in the gutter', () => {
    chartWidth(640)
    const { container } = renderChart({
      weeks: [week(0, 0.6, 0.52), week(1, null, 0.54), week(2, null, 0.56)],
    })
    const run = Array.from(container.querySelectorAll('.annot--end .annot__text--label')).find(
      (label) => label.textContent === 'Run 60%',
    )
    expect(run?.getAttribute('text-anchor')).toBe('start')
    expect(Number(run?.getAttribute('x'))).toBeLessThan(200)
  })

  it('labels each latest value with its sport and value, as the table and tooltip name the sport', () => {
    chartWidth(640)
    renderChart()
    expect(screen.getByText('Run 66%')).toBeInTheDocument()
    expect(screen.getByText('Ride 58%')).toBeInTheDocument()
  })

  it('draws the grade axis with its name and no date title under the dates', () => {
    const { container } = renderChart()
    expect(container.querySelector('.chart-y-axis__title')).toHaveTextContent('Age grade')
    expect(container.querySelector('.chart-x-axis__title')).toBeNull()
    // With no x title the plot leaves room only for the tick labels, as TrendChart's does.
    expect(Number(container.querySelector('.chart-x-axis__tick')?.getAttribute('y'))).toBe(
      Number(container.querySelector('svg')?.getAttribute('height')) -
        PLOT_BOTTOM_WITHOUT_X_TITLE +
        18,
    )
  })

  it('says how each line is drawn in the table caption, and not beneath the chart', () => {
    const { container } = renderChart()
    expect(container.querySelector('caption')).toHaveTextContent(
      'The line is smoothed between weeks and breaks where 8 weeks or more passed with no qualifying effort.',
    )
    expect(container.querySelector('.chart-frame__note')).not.toHaveTextContent('smoothed')
  })

  it('marks the run and ride count columns as phone-hidden, so a phone shows the grades alone', () => {
    const { container } = renderChart()
    const hidden = Array.from(container.querySelectorAll('thead .chart-table__phone-hidden')).map(
      (cell) => cell.textContent,
    )
    expect(hidden).toEqual(['Runs', 'Rides'])
  })

  it('shows the held message in place of the chart when only a held ride has a value, with the held note under it', () => {
    const { container } = renderChart({
      rideKnown: false,
      weeks: [week(0, null, 0.52), week(1, null, 0.54)],
    })
    expect(
      screen.getByText('Your rides are held until you add a weight on Profile.'),
    ).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    // Nothing is drawn, so the note says only that cycling is held, not what each point is.
    expect(screen.getByText('Cycling is held until a weight is added.')).toBeInTheDocument()
    expect(screen.queryByText(/Each point is/)).toBeNull()
  })

  it('names Profile in the held message from the weight copy, so the words are written once', () => {
    expect(HELD_EMPTY).toBe(
      `Your rides are held until you add a weight on ${WEIGHT_PROMPT_PARTS.page}.`,
    )
  })

  it('labels the grade axis in per cent, and shows the grade in the tooltip, floored to the whole percent', () => {
    const { container } = renderChart({ weeks: [week(0, 0.8995, 0.52), week(1, 0.62, null)] })
    const ticks = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(ticks.every((tick) => tick?.endsWith('%'))).toBe(true)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('89%')
    expect(tooltip).not.toHaveTextContent('89.9%')
    expect(within(tooltip).getByText('Run')).toBeInTheDocument()
    // 89.95% is in the National band, which starts at 80%.
    expect(tooltip).toHaveTextContent('National')
  })

  it('shows each week’s values in a table, with cycling as an estimate', () => {
    const { container } = renderChart()
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toEqual(['Week ending', 'Run grade', 'Ride grade, estimated', 'Runs', 'Rides'])
    const first = container.querySelectorAll('tbody tr')[0]
    expect(Array.from(first?.querySelectorAll('th, td') ?? []).map((c) => c.textContent)).toEqual([
      'Sun 12 Jan 2025',
      '60%',
      '52%',
      '2',
      '1',
    ])
  })

  it('says the one value in a line, with its week, when only one week has a value', () => {
    renderChart({ weeks: [week(0, 0.6, null)] })
    expect(
      screen.getByText(
        'Only one week has a value: Run 60%, week ending Sun 12 Jan 2025. A trend needs two weeks with values.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    // The chart keeps its visible title above the line of text, so every chart has a name.
    expect(
      screen.getByRole('figure', { name: 'Age grade of your best 20 min, trailing 2 weeks' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('shows an empty state when no week has a value', () => {
    renderChart({ weeks: [week(0, null, null), week(1, null, null)] })
    expect(
      screen.getByText('Add runs or rides in more than one week to see your age grades'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the empty message the caller gives, such as the ages the standards cover', () => {
    renderChart({ weeks: [], emptyText: 'Age grades cover ages 5 to 100.' })
    expect(screen.getByText('Age grades cover ages 5 to 100.')).toBeInTheDocument()
  })

  it('keeps one short sentence under the chart, and the rest behind About this chart', () => {
    const { container } = renderChart()
    expect(container.querySelector('.chart-frame__note')).toHaveTextContent(
      'Each point is your best 20 min of the 2 weeks to that Sunday; rides are estimated.',
    )
    expect(container.querySelector('.chart-frame__note')?.textContent).not.toMatch(/low point/)
    const about = container.querySelector('.chart-about')
    expect(about?.querySelector('summary')).toHaveTextContent('About this chart')
    expect(about).not.toHaveAttribute('open')
    // The latest point is only the last window, not the card's period, and a low point is one where even the best was easy.
    expect(about).toHaveTextContent(
      'The latest point covers only the last 2 weeks, so it can differ from a card’s best over the period.',
    )
    expect(about).toHaveTextContent(
      'A low point means even the best effort in those weeks was easy.',
    )
    expect(about).toHaveTextContent('the ring is the estimate and the shaded band is its 90% range')
    expect(screen.queryByText(/easy runs/)).toBeNull()
  })

  it('draws no key where the end labels name the lines, and a key where they are values alone', () => {
    renderChart()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    cleanup()
    narrowWindow()
    renderChart()
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Run, as recorded')
  })

  it('dates a line that stops before the window does by its latest run, in the note under the chart', () => {
    const runStops = [week(0, 0.6, 0.52), week(1, 0.62, 0.5), week(2, 0.64, 0.54)]
    const rideLasts = [week(3, null, 0.56), week(4, null, 0.57), week(5, null, 0.58)]
    const { container } = renderChart({
      weeks: [...runStops, ...rideLasts],
      latestStartMs: { run: new Date(2025, 0, 20, 12).getTime(), ride: null },
    })
    const note = container.querySelector('.chart-about')
    expect(note?.textContent).toMatch(/No runs since 20 Jan/)
    expect(note?.textContent).not.toMatch(/26 Jan/)
    expect(screen.queryByText(/No rides since/)).toBeNull()
  })

  it('dates the note by a short run that is the latest, though it gives the trend no value', () => {
    const runStops = [week(0, 0.6, 0.52), week(1, 0.62, 0.5), week(2, 0.64, 0.54)]
    const rideLasts = [week(3, null, 0.56), week(4, null, 0.57), week(5, null, 0.58)]
    const { container } = renderChart({
      weeks: [...runStops, ...rideLasts],
      latestStartMs: { run: new Date(2025, 0, 29, 12).getTime(), ride: null },
    })
    expect(container.querySelector('.chart-about')?.textContent).toMatch(/No runs since 29 Jan/)
  })

  it('adds no dated note when the latest run falls in the last week, which the line would show', () => {
    const runStops = [week(0, 0.6, 0.52), week(1, 0.62, 0.5), week(2, 0.64, 0.54)]
    const rideLasts = [week(3, null, 0.56), week(4, null, 0.57), week(5, null, 0.58)]
    const { container } = renderChart({
      weeks: [...runStops, ...rideLasts],
      latestStartMs: { run: new Date(2025, 1, 12, 12).getTime(), ride: null },
    })
    expect(container.textContent).not.toMatch(/No runs since/)
  })

  it('adds no dated note while both lines reach the last week', () => {
    const { container } = renderChart()
    expect(container.querySelector('.chart-about')?.textContent).not.toMatch(/since \d/)
  })
})
