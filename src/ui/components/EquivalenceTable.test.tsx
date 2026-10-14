// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { UnitSystem } from '../../core/units'
import { interval, makeEquivalence } from './fixtures'
import { EquivalenceTable } from './EquivalenceTable'

afterEach(() => {
  cleanup()
})

function renderTable(equivalents = [makeEquivalence()], units: UnitSystem = 'metric') {
  return render(<EquivalenceTable equivalents={equivalents} units={units} />)
}

describe('EquivalenceTable', () => {
  it('lists the ride effort, the equal flat running pace and its likely range', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Cycling effort', 'Equal running pace on flat ground', 'Likely range'])

    const row = within(screen.getByRole('row', { name: /20 min at 250 W/ }))
    expect(row.getByText('20 min at 250 W')).toBeInTheDocument()
    expect(row.getByText('4:10 /km')).toBeInTheDocument()
    // Faster pace first: the p95 speed gives the faster pace.
    expect(row.getByText('3:58 /km to 4:23 /km')).toBeInTheDocument()
  })

  it('shows paces per mile for imperial', () => {
    renderTable([makeEquivalence()], 'imperial')
    expect(screen.getByText('6:42 /mi')).toBeInTheDocument()
  })

  it('shows one row per equivalent in order', () => {
    renderTable([
      makeEquivalence({ durationS: 300, ridePowerW: 300 }),
      makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
    ])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('5 min at 300 W')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('1 h at 200 W')).toBeInTheDocument()
  })

  it('asks for a five minute ride when there are no equivalents', () => {
    renderTable([])
    expect(screen.getByText('Needs at least one ride of five minutes or more')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a range that is a single pace when the interval collapses', () => {
    renderTable([makeEquivalence({ runSpeed: interval(4.0, 4.0, 4.0) })])
    expect(screen.getByText('4:10 /km to 4:10 /km')).toBeInTheDocument()
  })
})
