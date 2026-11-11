// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { QUIET_CHECK_IN } from '../test/checkInFixtures'
import { FITNESS_AS_OF_MS } from '../test/fitnessFixtures'
import { CheckInLine } from './CheckInLine'

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

function slot(over: Parameters<typeof analysisStub>[0] = {}) {
  return <CheckInLine analysis={analysisStub(over)} units="metric" />
}

describe('the check-in line', () => {
  it('shows a check-in that has not been seen, with no fitness card beside it', () => {
    render(slot({ checkIn: UNSEEN }))
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
