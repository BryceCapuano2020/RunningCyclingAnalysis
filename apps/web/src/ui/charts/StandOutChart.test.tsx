// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProfileRow } from '@rca/core/profile'
import { StandOutChart } from './StandOutChart'

const TITLE = 'Each best against your other bests, by duration'

function row(durationS: number, residual: number, standsOut: ProfileRow['standsOut']): ProfileRow {
  return { durationS, residual, low: residual - 0.08, high: residual + 0.08, standsOut }
}

const ROWS: ProfileRow[] = [
  row(5, -0.01, null),
  row(60, 0.14, 'above'),
  row(120, -0.09, 'below'),
  row(1200, 0.02, null),
  row(3600, -0.03, null),
]

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('StandOutChart', () => {
  afterEach(cleanup)

  it('draws a zero line, and a point with a range bar for each duration', () => {
    render(<StandOutChart sport="run" rows={ROWS} />)
    expect(screen.getByRole('figure', { name: TITLE })).toBeInTheDocument()
    expect(screen.getByTestId('stand-out-zero')).toBeInTheDocument()
    expect(screen.getAllByTestId('stand-out-bar')).toHaveLength(ROWS.length)
    expect(screen.getAllByTestId('stand-out-mark')).toHaveLength(ROWS.length)
  })

  it('fills the points that stand out and leaves the others hollow', () => {
    render(<StandOutChart sport="run" rows={ROWS} />)
    const marks = screen.getAllByTestId('stand-out-mark')
    const filled = marks.filter((mark) => mark.classList.contains('stand-out__mark--filled'))
    const hollow = marks.filter((mark) => mark.classList.contains('stand-out__mark--hollow'))
    expect(filled).toHaveLength(2)
    expect(hollow).toHaveLength(3)
    expect(marks[1]).toHaveClass('stand-out__mark--filled')
  })

  it('draws a run as dots and a ride as diamonds, each in its sport’s colour', () => {
    const { unmount } = render(<StandOutChart sport="run" rows={ROWS} />)
    const run = screen.getAllByTestId('stand-out-mark')
    expect(run.every((mark) => mark.tagName === 'circle')).toBe(true)
    expect(run[0]?.closest('[data-sport]')).toHaveAttribute('data-sport', 'run')
    unmount()
    render(<StandOutChart sport="ride" rows={ROWS} />)
    const ride = screen.getAllByTestId('stand-out-mark')
    expect(ride.every((mark) => mark.tagName === 'path')).toBe(true)
    expect(ride[0]?.closest('[data-sport]')).toHaveAttribute('data-sport', 'ride')
  })

  it('keys a filled point, a hollow one and the bar, in words', () => {
    render(<StandOutChart sport="run" rows={ROWS} />)
    const key = screen.getByRole('list', { name: 'Legend' })
    expect(key).toHaveTextContent('Stands out')
    expect(key).toHaveTextContent('In line')
    expect(key).toHaveTextContent('Likely range')
    // A run's hollow point is a ring, a ride's a hollow diamond, as its filled point is a dot or a diamond.
    expect(key.querySelector('.chart-legend__key--dot')).not.toBeNull()
    expect(key.querySelector('.chart-legend__key--ring')).not.toBeNull()
  })

  it('keys a ride’s points as diamonds, hollow when in line', () => {
    render(<StandOutChart sport="ride" rows={ROWS} />)
    const key = screen.getByRole('list', { name: 'Legend' })
    expect(key.querySelector('.chart-legend__key--diamond')).not.toBeNull()
    expect(key.querySelector('.chart-legend__key--ring-diamond')).not.toBeNull()
  })

  it('labels the vertical axis as percent either side of zero, and the duration axis in minutes', () => {
    const { container } = render(<StandOutChart sport="run" rows={ROWS} />)
    const y = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(y).toContain('0%')
    expect(y.some((label) => label?.startsWith('+'))).toBe(true)
    expect(y.some((label) => label?.startsWith('-'))).toBe(true)
    const x = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(x).toContain('60 min')
    expect(x.join(' ')).not.toContain('1 h')
  })

  it('lists every value in a table, saying which stand out', () => {
    const { container } = render(<StandOutChart sport="run" rows={ROWS} />)
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Duration', 'Difference', 'Likely range'])
    expect(rows[0]).toEqual(['5 s', '-1%', '-9% to +7%'])
    expect(rows[1]).toEqual(['1 min', '+14% above', '+6% to +22%'])
    expect(rows[2]).toEqual(['2 min', '-9% below', '-17% to -1%'])
    expect(rows).toHaveLength(ROWS.length)
  })

  it('reads a duration’s difference and range on keyboard focus, and says a low one may be untested', () => {
    render(<StandOutChart sport="run" rows={ROWS} />)
    const surface = screen.getByTestId('plot-surface')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('5 s')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('+14%')
    expect(screen.getByRole('status')).not.toHaveTextContent('untested')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('-9%')
    expect(screen.getByRole('status')).toHaveTextContent('-17% to -1%')
    expect(screen.getByRole('status')).toHaveTextContent('May be relatively low, or untested')
  })

  it('grows the active point', () => {
    render(<StandOutChart sport="run" rows={ROWS} />)
    const before = Number(screen.getAllByTestId('stand-out-mark')[0]?.getAttribute('r'))
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(Number(screen.getAllByTestId('stand-out-mark')[0]?.getAttribute('r'))).toBeGreaterThan(
      before,
    )
  })

  it('keeps the axis wide enough for the widest range, so no bar leaves the plot', () => {
    const wide = [row(5, 0.4, 'above'), row(60, -0.3, 'below'), row(1200, 0, null)]
    const { container } = render(<StandOutChart sport="ride" rows={wide} />)
    const y = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (t) => t.textContent,
    )
    expect(y).toContain('+60%')
  })
})
