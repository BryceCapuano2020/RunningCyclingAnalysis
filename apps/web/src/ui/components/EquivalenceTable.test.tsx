// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { UnitSystem } from '@rca/core/units'
import { interval, makeEquivalence } from './fixtures'
import { EquivalenceTable } from './EquivalenceTable'

afterEach(() => {
  cleanup()
})

function renderTable(
  equivalents = [makeEquivalence()],
  units: UnitSystem = 'metric',
  weighted = true,
  estimated: (durationS: number) => boolean = () => false,
) {
  return render(
    <EquivalenceTable
      equivalents={equivalents}
      units={units}
      weighted={weighted}
      estimated={estimated}
    />,
  )
}

describe('EquivalenceTable', () => {
  it('lists the ride effort, the flat running pace it matches and its 90% model range', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Ride effort', 'Flat running pace', '90% model range'])

    const row = within(screen.getByRole('row', { name: /20 min at 250 W/ }))
    expect(row.getByText('20 min at 250 W')).toBeInTheDocument()
    expect(row.getByText('4:10 /km')).toBeInTheDocument()
    // Faster pace first: the p95 speed gives the faster pace.
    expect(row.getByText('3:58 to 4:23 /km')).toBeInTheDocument()
  })

  it('shows paces per mile for imperial', () => {
    renderTable([makeEquivalence()], 'imperial')
    expect(screen.getByText('6:42 /mi')).toBeInTheDocument()
    // The unit appears once, at the end of the range.
    expect(screen.getByText('6:23 to 7:04 /mi')).toBeInTheDocument()
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

  it('tags the watts of a row estimated when its ride had no power meter, and not otherwise', () => {
    renderTable(
      [
        makeEquivalence({ durationS: 300, ridePowerW: 300 }),
        makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
      ],
      'metric',
      true,
      (durationS) => durationS === 300,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Estimated')).toBeInTheDocument()
    expect(within(rows[1]!).queryByText('Estimated')).not.toBeInTheDocument()
  })

  it('holds every ride figure without a weight, and asks for the weight instead', () => {
    renderTable([makeEquivalence()], 'metric', false)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('4:10 /km')).not.toBeInTheDocument()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
  })

  it('asks for a ride of 3 min when there are no equivalents', () => {
    renderTable([])
    expect(screen.getByText('Needs at least one ride of 3 min or more')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a range that is a single pace when the interval collapses', () => {
    renderTable([makeEquivalence({ runSpeed: interval(4.0, 4.0, 4.0) })])
    expect(screen.getByText('4:10 to 4:10 /km')).toBeInTheDocument()
  })
})
