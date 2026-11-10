// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { PROFILE, balanceRows, TWELVE_YEARS } from '../test/balanceFixtures'
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
}

describe('BalanceOverYears', () => {
  it('draws the chart bare', () => {
    const { container } = render(<BalanceOverYears {...BASE} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(container.querySelector('.balance__panel')).toBeNull()
  })

  it('names the year of birth or sex that grading needs, with a link to add it', () => {
    const missing = { ...BASE, profile: null, missingAge: 'year of birth' as const }
    render(<BalanceOverYears {...missing} />)
    expect(screen.getByText('Age grade by year needs your year of birth.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your year of birth' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('says what to add when no year has a threshold', () => {
    const none = { ...BASE, years: [] }
    render(<BalanceOverYears {...none} />)
    expect(
      screen.getByText(
        'Add a run effort of 8 min or more, or a ride effort of 3 min or more, to grade each year.',
      ),
    ).toBeInTheDocument()
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
    expect(screen.getByRole('figure', { name: 'Run grade by year' })).toBeInTheDocument()
  })

  it('leaves the latest year to the levels row ', () => {
    class Phone {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe() {
        const entry = { contentRect: { width: 360 } } as unknown as ResizeObserverEntry
        this.callback([entry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Phone)
    render(<BalanceOverYears {...BASE} />)
    expect(screen.getByTestId('chart-readout').getAttribute('data-idle')).toMatch(/^Latest: /)
  })
})
