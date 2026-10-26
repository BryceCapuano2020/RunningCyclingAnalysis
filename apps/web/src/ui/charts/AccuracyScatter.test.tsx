// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccuracyScatter } from './AccuracyScatter'
import { accuracyFixture, emptyAccuracyFixture } from './fixtures'

const TITLE = 'Estimated against measured power on climbs'

/** The static chart image is named by its title, then its description. */

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('AccuracyScatter', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws one dot per climb and the labelled perfect-estimate line', () => {
    render(<AccuracyScatter accuracy={accuracyFixture} />)
    expect(screen.getByRole('figure', { name: TITLE })).toBeInTheDocument()
    expect(screen.getAllByTestId('accuracy-dot')).toHaveLength(2)
    expect(screen.getByTestId('accuracy-reference')).toBeInTheDocument()
    // The line is named in the key, not on the plot, where it would sit on the dots.
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Perfect estimate')
    expect(document.querySelector('.accuracy-scatter__reference-label')).toBeNull()
    expect(screen.getByText('2 climbs. Mean absolute error 5%, bias 0%')).toBeInTheDocument()
  })

  it('keeps each axis to at most five tick labels', () => {
    const many = {
      ...accuracyFixture,
      nSegments: 40,
      segments: Array.from({ length: 40 }, (_, i) => ({
        activityId: 'ride-1',
        start: i * 300,
        end: i * 300 + 240,
        measuredW: 150 + i * 7,
        estimatedW: 155 + i * 6.5,
      })),
    }
    const { container } = render(<AccuracyScatter accuracy={many} />)
    expect(container.querySelectorAll('.chart-x-axis__tick').length).toBeLessThanOrEqual(5)
    expect(container.querySelectorAll('.chart-y-axis__tick').length).toBeLessThanOrEqual(5)
    expect(screen.getByText('40 climbs. Mean absolute error 5%, bias 0%')).toBeInTheDocument()
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
    expect(screen.queryByRole('img')).toBeNull()
  })
})
