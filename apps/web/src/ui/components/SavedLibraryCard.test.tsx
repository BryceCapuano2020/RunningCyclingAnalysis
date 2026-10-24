// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import type { SavedActivity } from '../../worker/protocol'
import { deleteNoticeText } from '../analysis/copy'
import { SavedLibraryCard } from './SavedLibraryCard'

afterEach(() => {
  cleanup()
})

const KEPT_RUN: SavedActivity = {
  id: 'run-1',
  name: 'Morning run',
  startMs: new Date(2026, 9, 20, 12).getTime(),
  sport: 'run',
  copy: { id: 'run-1', rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
}

/** The card for a signed-out visitor, with the analysis state the test sets. */
function kept(overrides: AnalysisStubOverrides = {}) {
  return <SavedLibraryCard analysis={analysisStub(overrides)} signedIn={false} />
}

function keptSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Kept in this browser' })
}

describe('SavedLibraryCard kept in this browser, after the last activity is deleted', () => {
  it('keeps the section, with its delete outcome, after the last kept activity is deleted', () => {
    const deleteActivity = vi.fn()
    const { rerender } = render(kept({ savedActivities: [KEPT_RUN], deleteActivity }))

    fireEvent.click(screen.getByRole('button', { name: /^Delete Morning run, / }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteActivity).toHaveBeenCalledWith('run-1')

    rerender(kept({ savedActivities: [], libraryNotice: deleteNoticeText(KEPT_RUN) }))

    expect(keptSection()).toBeInTheDocument()
    expect(within(keptSection()).getByRole('status')).toHaveTextContent(deleteNoticeText(KEPT_RUN))
    expect(within(keptSection()).getByText('No saved activities')).toBeInTheDocument()
  })

  it('keeps the section while a failed delete of the last kept activity is shown', () => {
    render(
      kept({
        savedActivities: [],
        libraryError: 'Could not delete Morning run. Try again.',
      }),
    )

    expect(within(keptSection()).getByRole('alert')).toHaveTextContent(
      'Could not delete Morning run. Try again.',
    )
  })

  it('removes the section once its outcome is cleared and nothing is kept', () => {
    const { rerender } = render(
      kept({ savedActivities: [], libraryNotice: deleteNoticeText(KEPT_RUN) }),
    )
    expect(keptSection()).toBeInTheDocument()

    rerender(kept({ savedActivities: [] }))

    expect(screen.queryByRole('region', { name: 'Kept in this browser' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kept in this browser' }),
    ).not.toBeInTheDocument()
  })
})
