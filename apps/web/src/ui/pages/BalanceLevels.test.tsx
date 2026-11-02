// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GradeOutcome } from '../grades'
import { BalanceLevels } from './BalanceLevels'
import { balanceLevels } from './levelsModel'

afterEach(cleanup)

const band = (grade: number, level: string) => ({ grade, level })

/** A run's grade: one recorded effort, so its range is none. */
const RUN: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: { centre: band(0.65, 'Local'), range: null },
}
/** A ride whose whole range sits in one band. */
const RIDE_IN_ONE_BAND: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: {
    centre: band(0.64, 'Local'),
    range: { low: band(0.61, 'Local'), high: band(0.68, 'Local') },
  },
}
/** A ride whose range crosses from Recreational into Local. */
const RIDE_ACROSS_TWO: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: {
    centre: band(0.61, 'Recreational'),
    range: { low: band(0.55, 'Recreational'), high: band(0.67, 'Local') },
  },
}

const IN_PERIOD = { run: 3, ride: 3 }

function rows(ride: GradeOutcome) {
  const model = balanceLevels({
    grades: { run: RUN, ride },
    inPeriod: IN_PERIOD,
    missingAge: null,
  })
  render(<BalanceLevels model={model} />)
  return [...document.querySelectorAll('.balance-levels__row')].map((row) => {
    const copy = row.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

describe('the level on each sport’s line', () => {
  it('names the level of a run and of a ride whose whole range sits in one band', () => {
    expect(rows(RIDE_IN_ONE_BAND)).toEqual(['Running 65% Local', 'Cycling 64% Local'])
  })

  it('names no level for a ride whose range crosses two bands, and gives its range instead', () => {
    expect(rows(RIDE_ACROSS_TWO)).toEqual(['Running 65% Local', 'Cycling 61% (55 to 67)'])
  })

  it('defines the level once, on the first line that names one', () => {
    rows(RIDE_ACROSS_TWO)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Local' })).toBeInTheDocument()
    cleanup()
    const model = balanceLevels({
      grades: { run: null, ride: RIDE_ACROSS_TWO },
      sports: ['ride'],
      inPeriod: IN_PERIOD,
      missingAge: null,
    })
    render(<BalanceLevels model={model} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says nothing about how hard the best was, which the line under the lede does', () => {
    const [run] = rows(RIDE_IN_ONE_BAND)
    expect(run).not.toMatch(/hard|all-out|checked|confirmed/)
  })
})
