// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LiftTile } from './LiftTile'

afterEach(cleanup)

describe('LiftTile', () => {
  it('shows the figure big and each lift in Details, closed to start with', () => {
    render(
      <LiftTile
        tile={{
          heading: 'Big three total',
          figure: { number: '310', unit: 'kg' },
          rows: [
            { label: 'Squat', value: '40% · 100 kg' },
            { label: 'Deadlift', value: '39% · 140 kg' },
          ],
        }}
      />,
    )
    const tile = screen.getByRole('article', { name: 'Big three total' })
    expect(tile.querySelector('.stat-tile__number')).toHaveTextContent('310')
    expect(tile.querySelector('summary')).toHaveTextContent(/^Details/)
    expect(tile.querySelector('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Squat').nextElementSibling).toHaveTextContent('40% · 100 kg')
    expect(screen.getByText('Deadlift').nextElementSibling).toHaveTextContent('39% · 140 kg')
    // One link, to the Lifting section of Method, under the rows.
    expect(screen.getByRole('link', { name: /^Method/ })).toHaveAttribute('href', '#/method')
  })

  it('asks for a first lift, linking to the Lift page, when there is no figure', () => {
    render(<LiftTile tile={{ heading: 'Big three total', figure: null, rows: [] }} />)
    expect(screen.getByRole('link', { name: 'Log a squat, bench or deadlift' })).toHaveAttribute(
      'href',
      '#/lift',
    )
    expect(screen.queryByText('Details')).toBeNull()
  })
})
