// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { analysisStub } from '../../test/analysisStub'
import { QUIET_CHECK_IN } from '../checkInFixtures'
import { FITNESS_LIBRARY, SLIPPING } from '../fitnessFixtures'
import { FitnessAndCheckIn } from './FitnessAndCheckIn'

afterEach(cleanup)

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
