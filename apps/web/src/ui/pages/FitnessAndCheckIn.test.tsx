// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { analysisStub } from '../../test/analysisStub'
import { QUIET_CHECK_IN } from '../checkInFixtures'
import { FITNESS_AS_OF_MS, FITNESS_LIBRARY, SLIPPING } from '../fitnessFixtures'
import { yearsWords } from '../yearsRow'
import { YEARS_LOOKBACK } from '../yearsFixtures'
import { FitnessAndCheckIn } from './FitnessAndCheckIn'

/** The status is as of the fixtures' day; today is read for how new it is, so the tests set it. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FITNESS_AS_OF_MS)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SEEN = { checkIn: QUIET_CHECK_IN, seen: true }
const UNSEEN = { checkIn: QUIET_CHECK_IN, seen: false }

function slot(over: Parameters<typeof analysisStub>[0] = {}, withCard = true) {
  const analysis = analysisStub({
    ...over,
    state: {
      fitness: { run: withCard ? SLIPPING : NO_FITNESS.run, ride: NO_FITNESS.ride },
      ...over.state,
    },
  })
  return <FitnessAndCheckIn analysis={analysis} units="metric" library={FITNESS_LIBRARY} />
}

/** Whether `a` comes before `b` in the page. */
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the fitness cards and the check-in row', () => {
  it('puts the row under the fitness card', () => {
    render(slot({ checkIn: UNSEEN }))
    expect(before(screen.getByTestId('fitness-section'), screen.getByTestId('checkin-row'))).toBe(
      true,
    )
  })

  it('leads only when there is no card to lead', () => {
    render(slot({ checkIn: UNSEEN }, false))
    expect(screen.getByTestId('checkin-row')).toBeInTheDocument()
    expect(screen.queryByTestId('fitness-section')).toBeNull()
  })

  it('shows nothing for a check-in that has been seen, none, the sample, or an import that stopped short', () => {
    for (const over of [
      { checkIn: SEEN },
      { checkIn: { checkIn: null, seen: false } },
      { checkIn: UNSEEN, state: { isSample: true } },
      { checkIn: UNSEEN, incompleteImport: { id: 'x' } as never },
    ]) {
      const { unmount } = render(slot(over))
      expect(screen.queryByTestId('checkin-row'), JSON.stringify(Object.keys(over))).toBeNull()
      unmount()
    }
  })

  it('keeps a row it has shown when it becomes seen, until it is hidden', () => {
    const markCheckInSeen = vi.fn()
    const { rerender } = render(slot({ checkIn: UNSEEN, markCheckInSeen }))
    expect(screen.getByTestId('checkin-row')).toBeInTheDocument()
    rerender(slot({ checkIn: SEEN, markCheckInSeen }))
    expect(screen.getByTestId('checkin-row')).toBeInTheDocument()
  })

  it('does not bring back a row that was seen before the page loaded', () => {
    render(slot({ checkIn: SEEN }))
    expect(screen.queryByTestId('checkin-row')).toBeNull()
  })
})

describe('the fitness cards and "Your years"', () => {
  /** What names the lead these years open on, as the row asks the worker about it. */
  const LEAD = yearsWords(YEARS_LOOKBACK, { run: SLIPPING, ride: NO_FITNESS.ride }, 'metric')!.key
  const withYears = (over: Parameters<typeof analysisStub>[0] = {}) =>
    slot({ ...over, state: { lookBack: YEARS_LOOKBACK, ...over.state } })

  it('puts the years under the card when the check-in has nothing new', () => {
    render(withYears())
    expect(before(screen.getByTestId('fitness-section'), screen.getByTestId('years-row'))).toBe(
      true,
    )
    expect(screen.queryByTestId('checkin-row')).toBeNull()
  })

  it('gives the place to the check-in while that is unseen, and to the years once it is', () => {
    const first = render(withYears({ checkIn: UNSEEN }))
    expect(screen.getByTestId('checkin-row')).toBeInTheDocument()
    expect(screen.queryByTestId('years-row')).toBeNull()
    first.unmount()
    render(withYears({ checkIn: SEEN }))
    expect(screen.getByTestId('years-row')).toBeInTheDocument()
    expect(screen.queryByTestId('checkin-row')).toBeNull()
  })

  it('shows nothing for years whose lead has been seen, the sample, an import that stopped short, or no years', () => {
    for (const over of [
      { checkIn: { checkIn: null, seen: false, lookBackSeenFor: LEAD } },
      { state: { isSample: true } },
      { incompleteImport: { id: 'x' } as never },
      { state: { lookBack: NO_LOOKBACK } },
    ]) {
      const { unmount } = render(withYears(over as never) ?? <></>)
      expect(screen.queryByTestId('years-row'), JSON.stringify(Object.keys(over))).toBeNull()
      unmount()
    }
  })

  it('keeps the row it has shown when its lead becomes seen, until it is hidden', () => {
    const { rerender } = render(withYears())
    expect(screen.getByTestId('years-row')).toBeInTheDocument()
    rerender(withYears({ checkIn: { checkIn: null, seen: false, lookBackSeenFor: LEAD } }))
    expect(screen.getByTestId('years-row')).toBeInTheDocument()
  })

  it('shows a lead the athlete has not seen though they have seen another', () => {
    render(
      withYears({ checkIn: { checkIn: null, seen: false, lookBackSeenFor: 'run:other:2009-03:' } }),
    )
    expect(screen.getByTestId('years-row')).toBeInTheDocument()
  })

  it('asks the worker about the lead it shows', () => {
    const markLookBackSeen = vi.fn()
    render(withYears({ markLookBackSeen }))
    // Opening is seen too, and leaves the row where it is (Hide keeps a flag for the page load).
    const details = screen.getByTestId('years-row').querySelector('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(markLookBackSeen).toHaveBeenCalledWith('open', LEAD)
  })

  it('leads when there is no card to lead', () => {
    render(slot({ state: { lookBack: YEARS_LOOKBACK } }, false))
    expect(screen.getByTestId('years-row')).toBeInTheDocument()
    expect(screen.queryByTestId('fitness-section')).toBeNull()
  })
})
