// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { curvePoint } from './fixtures'
import { SportCurveChart } from './SportCurveChart'
import type { PreviousCurve } from './SportCurveChart'

const MASS_KG = 75

/** Best run speeds in m/s: 4:30 /km at a minute, 4:10 /km at 20 minutes, 4:30 /km at 5 min ... */
const RUN_SPEEDS = [
  curvePoint(60, 5.0, 'run-1'),
  curvePoint(300, 4.5, 'run-1'),
  curvePoint(1200, 4.0, 'run-2'),
  curvePoint(3600, 3.5, 'run-2'),
]

/** Best cycling powers in watts, with the 20-minute effort at 250 W (3.3 W/kg at 75 kg). */
const RIDE_WATTS = [
  curvePoint(60, 400, 'ride-1'),
  curvePoint(300, 320, 'ride-1'),
  curvePoint(1200, 250, 'ride-2'),
  curvePoint(3600, 210, 'ride-2'),
]

const NAMES = {
  'run-1': 'Morning run',
  'run-2': 'Tempo run',
  'ride-1': 'Hill ride',
  'ride-2': 'Club ride',
}

const PREVIOUS_RUN: PreviousCurve = {
  curve: [curvePoint(60, 4.8, 'run-0'), curvePoint(1200, 3.8, 'run-0')],
  label: 'Previous 6 weeks',
}

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

function yTickLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
    (tick) => tick.textContent ?? '',
  )
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SportCurveChart', () => {
  it('names the units in the chart name: pace per kilometre or mile, and power in watts', () => {
    const metric = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(
      screen.getByRole('figure', { name: 'Run flat pace per kilometre by duration' }),
    ).toBeInTheDocument()
    metric.unmount()

    const imperial = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="imperial"
      />,
    )
    expect(
      screen.getByRole('figure', { name: 'Run flat pace per mile by duration' }),
    ).toBeInTheDocument()
    imperial.unmount()

    render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(
      screen.getByRole('figure', { name: 'Ride power in watts by duration' }),
    ).toBeInTheDocument()
  })

  it('labels a pace axis in minutes per kilometre, with faster at the top', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Flat pace (/km), faster up',
    )
    const labels = yTickLabels(container)
    expect(labels.every((label) => /^\d:\d{2}$/.test(label))).toBe(true)
    const yOf = (label: string) =>
      Number(
        Array.from(container.querySelectorAll('.chart-y-axis__tick'))
          .find((tick) => tick.textContent === label)
          ?.getAttribute('y'),
      )
    // 3:30 is faster than 5:00, so it is higher on the page.
    expect(yOf('3:30')).toBeLessThan(yOf('5:00'))
  })

  it('labels a pace axis in minutes per mile when the units are imperial', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="imperial"
      />,
    )
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Flat pace (/mi), faster up',
    )
    // 5.0 to 3.5 m/s is 5:22 to 7:40 a mile, so the minute ticks run from 5:00 to 8:00.
    expect(yTickLabels(container)).toEqual(['5:00', '6:00', '7:00', '8:00'])
  })

  it('labels a power axis in watts and starts it at zero', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe('Power (W)')
    expect(yTickLabels(container)[0]).toBe('0')
  })

  it('draws a pace line alone, and fills the area under a watts line in its soft colour', () => {
    const run = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(run.container.querySelectorAll('[data-testid="sport-curve-line"]')).toHaveLength(1)
    expect(run.container.querySelector('.chart-series__line--run')).not.toBeNull()
    expect(run.container.querySelector('.chart-series__area')).toBeNull()
    run.unmount()

    const ride = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const area = ride.container.querySelector('.chart-series__area')
    expect(area).toHaveClass('chart-series__area--ride')
    // The area takes its colour from --sport-colour-soft, which data-sport sets for the ride.
    expect(area).toHaveAttribute('data-sport', 'ride')
    expect(area?.getAttribute('d')).toMatch(/Z$/)
  })

  it('emphasises the 20-minute effort and labels it', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(screen.getByTestId('sport-curve-emphasis')).toBeInTheDocument()
    // The label is the value at the emphasised effort, in watts, not its duration.
    expect(container.querySelector('.chart-series__label')?.textContent).toBe('250 W')
  })

  it('emphasises the longest effort instead when there is no 20-minute one', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={[curvePoint(60, 400, 'ride-1'), curvePoint(300, 320, 'ride-1')]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-series__label')?.textContent).toBe('320 W')
  })

  it('draws the previous period dashed and names it in the legend, when given', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={PREVIOUS_RUN}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const previousLine = container.querySelector('[data-testid="sport-curve-previous"]')
    const currentLine = container.querySelector('[data-testid="sport-curve-line"]')
    expect(previousLine).not.toBeNull()
    // The dashed line is its own path through the previous period's points, not a copy of the current one.
    const previousD = previousLine?.getAttribute('d') ?? ''
    expect(previousD).not.toBe(currentLine?.getAttribute('d'))
    // Two points, one per duration the previous period has; the gap at five minutes lifts the pen.
    expect(previousD.match(/M/g)?.length).toBe(2)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Previous 6 weeks')).toBeInTheDocument()
    expect(within(legend).getByText('Run')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Dashed line: Previous 6 weeks\./ })).toBeInTheDocument()
  })

  it('draws no previous line, and no legend, without a previous period', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('[data-testid="sport-curve-previous"]')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('reserves the key row when the period before has nothing to draw, so the plot does not move', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={{ ...PREVIOUS_RUN, curve: [] }}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-frame__legend')).not.toBeNull()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('keeps no key row under All time, which has no period before it', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-frame__legend')).toBeNull()
  })

  it('reserves the key row with a previous period, so the plot does not move when it goes', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={PREVIOUS_RUN}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-frame__legend')).not.toBeNull()
    expect(screen.getByRole('list', { name: 'Legend' })).toBeInTheDocument()
  })

  it('reserves no key row for an empty chart, which shows only its message', () => {
    const { container } = render(
      <SportCurveChart sport="run" curve={[]} previous={null} massKg={MASS_KG} units="metric" />,
    )
    expect(screen.getByText(/Add runs of a minute or more/)).toBeInTheDocument()
    expect(container.querySelector('.chart-frame__legend')).toBeNull()
  })

  it('leaves the previous period out of the drawing, legend and table, and says so, when it has no rides', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={{ curve: [], label: 'Previous 6 weeks' }}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('[data-testid="sport-curve-previous"]')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.getByText('No rides in the previous 6 weeks')).toBeInTheDocument()
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).not.toContain('Previous 6 weeks')
  })

  it('shows the pace in the tooltip, with the previous period beside it', () => {
    render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={PREVIOUS_RUN}
        massKg={MASS_KG}
        units="metric"
        activityNames={NAMES}
      />,
    )
    const plot = screen.getByTestId('plot-surface')
    // Durations of at least a minute, shortest first: 1 min, 5 min, 20 min, 1 h.
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('20 min')
    expect(status).toHaveTextContent('4:10 /km')
    expect(status).toHaveTextContent('from Tempo run')
    expect(status).toHaveTextContent('Previous 6 weeks')
  })

  it('shows watts and the W/kg for cycling in the tooltip', () => {
    render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
        activityNames={NAMES}
      />,
    )
    const plot = screen.getByTestId('plot-surface')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(plot, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('250 W')
    expect(status).toHaveTextContent('3.3 W/kg, from Club ride')
  })

  it('lists each duration in the table, with the previous period and the activity', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
        activityNames={NAMES}
      />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Power', 'W/kg', 'From'])
    expect(rows[2]).toEqual(['20 min', '250 W', '3.3 W/kg', 'Club ride'])
  })

  it('adds the previous period as a column in the table view', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={PREVIOUS_RUN}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Flat pace', 'Previous 6 weeks', 'From'])
    // A minute at 4.8 m/s is 3:28 /km and 20 minutes at 3.8 m/s is 4:23 /km; five minutes has none before.
    expect(rows[0]?.[2]).toBe('3:28 /km')
    expect(rows[1]?.[2]).toBe('—')
    expect(rows[2]?.[2]).toBe('4:23 /km')
  })

  it('shows an empty state with fewer than two durations of this sport', () => {
    render(
      <SportCurveChart
        sport="run"
        curve={[curvePoint(60, 5, 'run-1')]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Add runs of a minute or more to see this curve')).toBeInTheDocument()
  })

  it('captions the table with what its values are', () => {
    const run = render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(run.container.querySelector('caption')?.textContent).toBe(
      'Best flat pace at each duration, per kilometre.',
    )
    run.unmount()
    const ride = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(ride.container.querySelector('caption')?.textContent).toBe(
      'Best power at each duration, in watts, with W/kg at your body mass.',
    )
  })

  it('leaves no NaN or Infinity in the drawing or the table for a zero or negative effort', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={[
          curvePoint(60, 5, 'run-1'),
          curvePoint(300, 0, 'run-1'),
          curvePoint(1200, -2, 'run-2'),
          curvePoint(3600, 3.5, 'run-2'),
        ]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(tableOf(container).rows.flat().join(' ')).not.toMatch(/NaN|Infinity/)
  })
})

describe('SportCurveChart record marks', () => {
  it('marks the 1, 5, 20 and 60 minute efforts, and labels the last point with its value', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={[
          curvePoint(60, 400, 'ride-1'),
          curvePoint(300, 320, 'ride-1'),
          curvePoint(600, 260, 'ride-1'),
          curvePoint(1200, 250, 'ride-1'),
          curvePoint(3600, 210, 'ride-1'),
        ]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )

    // The 20-minute effort is the emphasised point; the 1, 5 and 60 minute efforts are marked too,
    // and 10 minutes is not a record, so it is left unmarked.
    expect(container.querySelectorAll('[data-testid="sport-curve-record"]')).toHaveLength(3)
    const labels = [...container.querySelectorAll('.chart-series__label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['250 W', '210 W'])
  })
})

describe('the last point’s label beside the 20 minute label', () => {
  const CURVE = [
    curvePoint(60, 400, 'ride-1'),
    curvePoint(300, 320, 'ride-1'),
    curvePoint(1200, 250, 'ride-1'),
    curvePoint(1800, 230, 'ride-1'),
  ]

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.style.fontSize = ''
  })

  it('leaves the last label out at a large root font, where its text is wider than at the default', () => {
    // The label is 0.75 rem, so at a 32 px root its text is about 72 px wide for "230 W". The last point
    // sits about 60 px past the 20 minute label, so the label would overlap it there.
    document.documentElement.style.fontSize = '32px'
    chartWidth(575)
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={CURVE}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const labels = [...container.querySelectorAll('.chart-series__label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['250 W'])
  })

  it('leaves the last label out when it would sit on the 20 minute label on a 280 px chart', () => {
    chartWidth(280)
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={CURVE}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const labels = [...container.querySelectorAll('.chart-series__label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['250 W'])
  })

  it('labels the last point where there is room beside the 20 minute label', () => {
    chartWidth(900)
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={CURVE}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const labels = [...container.querySelectorAll('.chart-series__label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['250 W', '230 W'])
  })
})

describe('the curve’s key row, table and labels', () => {
  const ONE_ACTIVITY = [
    curvePoint(60, 5.0, 'run-1'),
    curvePoint(300, 4.5, 'run-1'),
    curvePoint(1200, 4.0, 'run-1'),
  ]

  it('drops the From column, and names the one activity in the caption, when every value is from it', () => {
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={ONE_ACTIVITY}
        previous={null}
        massKg={MASS_KG}
        units="metric"
        activityNames={NAMES}
      />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Flat pace'])
    expect(rows[2]).toEqual(['20 min', '4:10 /km'])
    expect(container.querySelector('caption')).toHaveTextContent('Every value is from Morning run.')
  })

  it('sets the From column on the left, since it holds words, where the numbers sit on the right', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
        activityNames={NAMES}
      />,
    )
    const headers = Array.from(container.querySelectorAll('thead th'))
    expect(headers[1]).toHaveClass('num')
    expect(headers[3]).toHaveTextContent('From')
    expect(headers[3]).not.toHaveClass('num')
  })

  it('keeps the 20 minute tick on a narrow chart, where the thinned ticks would drop it', () => {
    chartWidth(320)
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={[
          curvePoint(60, 5.0, 'run-1'),
          curvePoint(300, 4.5, 'run-1'),
          curvePoint(600, 4.3, 'run-1'),
          curvePoint(1200, 4.0, 'run-1'),
          curvePoint(1800, 3.9, 'run-1'),
          curvePoint(3600, 3.5, 'run-1'),
        ]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const ticks = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(ticks).toContain('20 min')
  })

  it('draws the previous period’s key in the tooltip dashed, in its own mark', () => {
    render(
      <SportCurveChart
        sport="run"
        curve={RUN_SPEEDS}
        previous={PREVIOUS_RUN}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status.querySelector('.chart-tooltip__key--dashed')).not.toBeNull()
    expect(status.querySelector('.chart-tooltip__key--neutral')).toBeNull()
  })

  it('writes a missing previous period in the key row, not under the plot', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={{ curve: [], label: 'Previous 6 weeks' }}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-frame__legend')).toHaveTextContent(
      'No rides in the previous 6 weeks',
    )
    expect(container.querySelector('.chart-frame > .chart-frame__note')).toBeNull()
  })

  it('moves the last label above its point where a label below would sit on the x tick labels', () => {
    // The last point sits 28 px above the plot's bottom, so a label 18 px below it would run past the floor.
    // The chart is wide enough that the padded label still clears the 20 minute label beside it.
    chartWidth(900)
    const { container } = render(
      <SportCurveChart
        sport="run"
        curve={[
          curvePoint(60, 5.0, 'run-1'),
          curvePoint(300, 4.5, 'run-1'),
          curvePoint(1200, 4.0, 'run-1'),
          curvePoint(1800, 3.2, 'run-1'),
        ]}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    const last = [...container.querySelectorAll('.chart-series__label')].find(
      (label) => label.textContent === '5:13 /km',
    )
    // The plot ends 52 px above the SVG's bottom, and a label keeps 12 px clear of that edge.
    expect(Number(last?.getAttribute('y'))).toBeLessThanOrEqual(320 - 52 - 12)
  })

  it('reserves no key row for a curve without a previous period', () => {
    const { container } = render(
      <SportCurveChart
        sport="ride"
        curve={RIDE_WATTS}
        previous={null}
        massKg={MASS_KG}
        units="metric"
      />,
    )
    expect(container.querySelector('.chart-frame__legend')).toBeNull()
  })
})
