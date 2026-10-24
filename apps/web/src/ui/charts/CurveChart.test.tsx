// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CurveChart } from './CurveChart'
import { curveOf, rideCurveFixture, rideMetabolicCurveFixture, runCurveFixture } from './fixtures'

const TITLE = 'Running and cycling energy rate in W/kg by duration'

/** The static chart image is named by its title, then its description. */
const named = (title: string) => (name: string) => name.startsWith(title)

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('CurveChart', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws the title, a legend for both sports and end labels', () => {
    render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    expect(screen.getByRole('img', { name: named(TITLE) })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Running')).toBeInTheDocument()
    expect(within(legend).getByText('Cycling')).toBeInTheDocument()
    // Once in the legend, once as the end label of the line.
    expect(screen.getAllByText('Running')).toHaveLength(2)
    expect(screen.getAllByText('Cycling')).toHaveLength(2)
  })

  it('exposes one image per chart and a plot surface described by the tooltip', () => {
    const { container } = render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    expect(container.querySelectorAll('figure [role="img"]')).toHaveLength(1)
    const plot = screen.getByTestId('plot-surface')
    expect(plot).toHaveAttribute('role', 'group')
    expect(plot).toHaveAttribute('tabindex', '0')
    const describedBy = plot.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')).toHaveAttribute('role', 'status')
  })

  it('places one marker per finite point for each sport', () => {
    render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    const markers = screen.getAllByTestId('curve-marker')
    expect(markers).toHaveLength(7)
    expect(markers.filter((m) => m.getAttribute('data-series') === 'run')).toHaveLength(4)
    expect(markers.filter((m) => m.getAttribute('data-series') === 'ride')).toHaveLength(3)
  })

  it('formats each duration in the table view', () => {
    const { container } = render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual([
      'Duration',
      'Running (W/kg)',
      'Flat pace',
      'Cycling (W/kg)',
      'Cycling power',
      'Running from',
      'Cycling from',
    ])
    expect(rows).toEqual([
      // Without activity names the cells stay blank rather than showing a raw id.
      ['1 min', '17.0 W/kg', '4:07 /km', '18.5 W/kg', '1400 W', '', ''],
      ['5 min', '15.6 W/kg', '4:31 /km', '16.4 W/kg', '1230 W', '', ''],
      ['20 min', '14.2 W/kg', '5:00 /km', '14.0 W/kg', '1050 W', '', ''],
      ['1 h', '12.8 W/kg', '5:37 /km', '—', '—', '', '—'],
    ])
  })

  it('names the source activity in the table and tooltip when names are given', () => {
    const { container } = render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
        activityNames={{ 'activity-1': 'Morning run' }}
      />,
    )
    const { rows } = tableOf(container)
    expect(rows[0]?.slice(5)).toEqual(['Morning run', 'Morning run'])

    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('from Morning run')
  })

  it('shows the values for a duration when the arrow keys move the active point', () => {
    render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    const plot = screen.getByTestId('plot-surface')
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('1 min')
    expect(tooltip).toHaveTextContent('17.0 W/kg')
    expect(tooltip).toHaveTextContent('4:07 /km')
    expect(tooltip).toHaveTextContent('18.5 W/kg')
    expect(tooltip).toHaveTextContent('1400 W')

    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('5 min')

    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('plots the sport that has data when the other has none', () => {
    render(
      <CurveChart
        runCurve={curveOf({})}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    expect(screen.getByRole('img', { name: named(TITLE) })).toBeInTheDocument()
    const markers = screen.getAllByTestId('curve-marker')
    expect(markers).toHaveLength(3)
    expect(markers.every((m) => m.getAttribute('data-series') === 'ride')).toBe(true)
  })

  it('shows an empty state when fewer than two durations have a value', () => {
    render(
      <CurveChart
        runCurve={curveOf({ 300: 15 })}
        rideMetabolicCurve={curveOf({})}
        rideCurve={curveOf({})}
        units="metric"
      />,
    )
    expect(
      screen.getByText('Add at least one run and one ride to see both curves'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: named(TITLE) })).toBeNull()
  })

  it('captions the table with the energy rate in W/kg and the activity behind each value', () => {
    const { container } = render(
      <CurveChart
        runCurve={runCurveFixture}
        rideMetabolicCurve={rideMetabolicCurveFixture}
        rideCurve={rideCurveFixture}
        units="metric"
      />,
    )
    expect(container.querySelector('caption')?.textContent).toMatch(/^Best energy rate in W\/kg/)
  })
})
