// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { PROFILE, balanceRows, TWELVE_YEARS } from '../balanceFixtures'
import { BalanceOverYears } from './BalanceOverYears'
import type { BalanceOverYearsProps } from './BalanceOverYears'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ROWS = balanceRows(TWELVE_YEARS)
const BASE: BalanceOverYearsProps = {
  years: ROWS,
  profile: PROFILE,
  missingAge: null,
  weightKnown: true,
  placement: 'history',
}

describe('BalanceOverYears', () => {
  it('draws the chart on the History page, bare, and on the home page as a card', () => {
    const { container, rerender } = render(<BalanceOverYears {...BASE} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(container.querySelector('.balance__panel')).toBeNull()
    rerender(<BalanceOverYears {...BASE} placement="home" />)
    expect(container.querySelector('.balance__panel')).toContainElement(screen.getByRole('figure'))
  })

  it('names the year of birth or sex that grading needs, with a link to add it, on the History page only', () => {
    const missing = { ...BASE, profile: null, missingAge: 'year of birth' as const }
    const { container, rerender } = render(<BalanceOverYears {...missing} />)
    expect(screen.getByText('Age grade by year needs your year of birth.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your year of birth' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByRole('figure')).toBeNull()
    rerender(<BalanceOverYears {...missing} placement="home" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says what to add when no year has a best 20 minutes, on the History page only', () => {
    const none = { ...BASE, years: [] }
    const { container, rerender } = render(<BalanceOverYears {...none} />)
    expect(
      screen.getByText('Add a run or ride of 20 min or more to grade each year.'),
    ).toBeInTheDocument()
    rerender(<BalanceOverYears {...none} placement="home" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for the weight to grade the rides, and plots the runs meanwhile', () => {
    const { container, rerender } = render(<BalanceOverYears {...BASE} />)
    const sports = () =>
      new Set(
        Array.from(container.querySelectorAll('[data-testid="years-dot"]'), (dot) =>
          dot.getAttribute('data-sport'),
        ),
      )
    expect(sports()).toEqual(new Set(['run', 'ride']))
    rerender(<BalanceOverYears {...BASE} weightKnown={false} />)
    expect(sports()).toEqual(new Set(['run']))
    expect(screen.getByRole('figure', { name: 'Running age grade by year' })).toBeInTheDocument()
  })
})
