// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import type { SavedActivity } from '../../worker/protocol'
import { SavedLibraryCard } from './SavedLibraryCard'

afterEach(() => {
  cleanup()
})

function saved(id: string, sport: 'run' | 'ride', year: number, month: number): SavedActivity {
  return {
    id,
    name: `Activity ${id}`,
    startMs: new Date(year, month, 12, 12).getTime(),
    sport,
    copy: { id, rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
  }
}

function card(signedIn: boolean, overrides: AnalysisStubOverrides = {}) {
  return render(<SavedLibraryCard analysis={analysisStub(overrides)} signedIn={signedIn} />)
}

describe('SavedLibraryCard', () => {
  it('shows nothing signed out until something is kept', () => {
    const { container } = card(false)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing signed in until the library has loaded', () => {
    const { container } = card(true, { libraryStatus: 'loading' })
    expect(container).toBeEmptyDOMElement()
  })

  it('says a loaded signed-in library is empty', () => {
    card(true, { libraryStatus: 'loaded' })
    expect(
      within(screen.getByRole('region', { name: 'Saved library' })).getByText(
        'No saved activities',
      ),
    ).toBeInTheDocument()
  })

  it('offers no delete: an activity is deleted from its row or its page', () => {
    card(false, { savedActivities: [saved('a', 'run', 2026, 9)] })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See them in Activities' })).toBeInTheDocument()
  })
})
