// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccuracyScatter } from './AccuracyScatter'
import { accuracyFixture, emptyAccuracyFixture } from './fixtures'

const TITLE = 'Estimated against measured power on climbs'

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('AccuracyScatter', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws one dot per climb and the labelled perfect-estimate line', () => {
    render(<AccuracyScatter accuracy={accuracyFixture} />)
    expect(screen.getByRole('img', { name: TITLE })).toBeInTheDocument()
    expect(screen.getAllByTestId('accuracy-dot')).toHaveLength(2)
    expect(screen.getByTestId('accuracy-reference')).toBeInTheDocument()
    expect(screen.getByText('Perfect estimate')).toBeInTheDocument()
  })

  it('formats measured, estimated and signed error in the table view', () => {
    const { container } = render(<AccuracyScatter accuracy={accuracyFixture} />)
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Measured', 'Estimated', 'Error'])
    expect(rows).toEqual([
      ['250 W', '262 W', '+5%'],
      ['300 W', '285 W', '-5%'],
    ])
  })

  it('shows the measured, estimated, error and length of a climb on keyboard focus', () => {
    render(<AccuracyScatter accuracy={accuracyFixture} />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('Climb')
    expect(tooltip).toHaveTextContent('250 W')
    expect(tooltip).toHaveTextContent('262 W')
    expect(tooltip).toHaveTextContent('+5%')
    expect(tooltip).toHaveTextContent('4 min')
  })

  it('shows an empty state when there are no climbs', () => {
    render(<AccuracyScatter accuracy={emptyAccuracyFixture} />)
    expect(
      screen.getByText('No climbs of two minutes or more with power-meter data yet'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: TITLE })).toBeNull()
  })
})
