// @vitest-environment jsdom
import type { Copy } from '@rca/core/session'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import {
  announcements,
  app,
  resetAppMocks,
  setAccount,
  setSession,
  showResult,
} from './test/appMocks'
import { ORIGINALS_UNAVAILABLE } from './ui/analysis/copy'
import { makeActivity, makeResult } from './ui/components/fixtures'

const SAVED_COPY: Copy = {
  id: 'saved-copy',
  rank: 3,
  hasPower: false,
  hasHeartRate: true,
  durationS: 3600,
}

vi.mock('./ui/useAccount', async () => ({
  useAccount: (await import('./test/appMocks')).useAccountMock,
}))
vi.mock('./ui/useAnalysis', async () => ({
  useAnalysis: (await import('./test/appMocks')).useAnalysisMock,
}))
vi.mock('./ui/useSettings', async () => ({
  usePreferences: (await import('./test/appMocks')).usePreferencesMock,
}))
vi.mock('./ui/charts', async () => {
  const { heavyChartStubs } = await import('./test/appMocks')
  return heavyChartStubs
})

/** The status regions in the page right now, before a message is put into one of them. */
function mountedStatusRegions(): Element[] {
  return Array.from(document.querySelectorAll('[role="status"]'))
}

/** Asserts that the message sits in a region that was mounted before the message appeared. */
function expectAnnouncedFromMountedRegion(regions: Element[], text: RegExp) {
  const message = screen.getByText(text)
  expect(regions).toContain(message.closest('[role="status"]'))
}

beforeEach(() => {
  resetAppMocks()
})

describe('saved activities that need updating', () => {
  it('shows the stale count, and Update now rebuilds the saved activities', () => {
    setSession({ outdatedActivities: 2 })
    app.analysis.outdatedWithOriginal = 2
    render(<App />)
    expect(
      screen.getByText(
        '2 saved activities need a quick update before they count in these results.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(app.analysis.rebuildSavedActivities).toHaveBeenCalledOnce()
  })

  it('shows the newer-version notice on the landing page, without an update button', () => {
    setSession({ incompatibleActivities: 1 })
    render(<App />)
    expect(
      screen.getByText(
        '1 saved activity was made by a newer version of this app and is left out. Reload the page to update the app.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Are you a better runner or a better cyclist?',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })

  it('shows Updating… and disables the button while a rebuild runs', () => {
    setSession({ outdatedActivities: 2 })
    app.analysis.outdatedWithOriginal = 2
    app.analysis.busy = true
    render(<App />)
    expect(screen.getByRole('button', { name: 'Updating…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('disables Update now and says why when original file storage is unavailable', () => {
    setAccount('signed-in', { fileRetentionAvailable: false })
    setSession({ outdatedActivities: 2 })
    app.analysis.outdatedWithOriginal = 2
    render(<App />)
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled()
    expect(screen.getByText(ORIGINALS_UNAVAILABLE)).toBeInTheDocument()
  })
})

describe('missing original files', () => {
  it('says how many saved activities need their original file added again', () => {
    app.analysis.missingOriginals = 3
    render(<App />)
    expect(
      screen.getByText(
        '3 activities are missing their original file. Add their files again to restore the originals.',
      ),
    ).toBeInTheDocument()
  })

  it('hides the missing-original notice when originals are not kept', () => {
    app.analysis.missingOriginals = 3
    setAccount('signed-in', { keepFiles: false })
    render(<App />)
    expect(screen.queryByText(/missing their original file/)).not.toBeInTheDocument()
  })
})

describe('library failure', () => {
  it('offers a retry when the signed-in library could not be loaded', () => {
    app.analysis.libraryStatus = 'failed'
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('Your library could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(app.analysis.retryLibrary).toHaveBeenCalledOnce()
  })

  it('reports sync issues in the status line, in words that say the fix', () => {
    setSession({ syncIssues: [{ code: 'network', count: 2 }] })
    render(<App />)
    expect(
      screen.getByText(
        '2 activities were not fully saved because the connection dropped. Add them again to retry.',
      ),
    ).toBeInTheDocument()
    // Added to the notice region that is already mounted, which announces it.
    expect(screen.getByText(/connection dropped/).closest('[role="status"]')).not.toBeNull()
  })
})

describe('rebuild, error and wait messages', () => {
  it('keeps the rebuild outcome in a status region', () => {
    app.analysis.rebuildNotice = 'Rebuilt 2 saved activities.'
    render(<App />)
    expect(
      screen.getByText('Rebuilt 2 saved activities.').closest('[role="status"]'),
    ).not.toBeNull()
  })

  it('shows a daily-limit error without the generic "Something went wrong" prefix', () => {
    app.analysis.error =
      'You have reached the daily limit for this account. The limit resets at 00:00 UTC.'
    app.analysis.errorIssue = 'daily-limit'
    render(<App />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/^You have reached the daily limit/)
    expect(alert).not.toHaveTextContent('Something went wrong')
  })

  it('prefixes any other analysis error with "Something went wrong"', () => {
    app.analysis.error = 'The file could not be read.'
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong: The file could not be read.',
    )
  })

  it('shows the reason imports are waiting in the import progress', () => {
    vi.useFakeTimers()
    try {
      app.analysis.busy = true
      app.analysis.waitingReason = 'Checking your saved results…'
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(screen.getByText('Checking your saved results…')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces the waiting reason when an import starts waiting', () => {
    const view = render(<App />)
    app.analysis.busy = true
    app.analysis.waitingReason = 'Checking your saved results…'
    view.rerender(<App />)
    expect(announcements()).toContain('Checking your saved results…')
  })
})

describe('saved library', () => {
  it('counts the saved activities on the profile page and leaves deleting to the activity pages', () => {
    window.location.hash = '#/profile'
    app.analysis.savedActivities = [
      {
        id: 'run-1',
        name: 'Morning run',
        startMs: Date.UTC(2026, 9, 20, 7),
        sport: 'run',
        copy: SAVED_COPY,
      },
    ]
    render(<App />)

    const region = screen.getByRole('region', { name: /Kept in this browser|Saved library/ })
    expect(within(region).getByText('1 run, Oct 2026')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'See them in Activities' })).toBeInTheDocument()
  })
})

describe('a kept activity on the Activities page, by sign-in state', () => {
  it.each([
    { signedIn: true, from: 'your library' },
    { signedIn: false, from: 'this browser' },
  ])('says the removal is from $from', ({ signedIn, from }) => {
    window.location.hash = '#/activities'
    setAccount(signedIn ? 'signed-in' : 'signed-out')
    const run = makeActivity({
      id: 'run-1',
      name: 'Morning run',
      sport: 'run',
      startMs: Date.UTC(2026, 9, 20, 7),
    })
    showResult(makeResult({ activities: [run] }))
    app.analysis.savedActivities = [
      { id: 'saved-1', name: run.name, startMs: run.startMs, sport: 'run', copy: SAVED_COPY },
    ]
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Morning run' }))
    expect(
      screen.getByText(`Delete “Morning run”? It is removed from ${from}.`),
    ).toBeInTheDocument()
  })
})

describe('status messages go into regions that are already mounted', () => {
  it('announces that sign-in is unavailable', () => {
    setAccount('loading')
    const view = render(<App />)
    const regions = mountedStatusRegions()
    setAccount('unavailable')
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(regions, /Sign-in is unavailable right now/)
  })

  it('announces missing original files', () => {
    const view = render(<App />)
    const regions = mountedStatusRegions()
    app.analysis.missingOriginals = 2
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(regions, /2 activities are missing their original file/)
  })

  it('announces outdated saved activities', () => {
    const view = render(<App />)
    const regions = mountedStatusRegions()
    setSession({ outdatedActivities: 2 })
    app.analysis.outdatedWithOriginal = 2
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(regions, /2 saved activities need a quick update/)
  })

  it('announces incompatible saved activities', () => {
    const view = render(<App />)
    const regions = mountedStatusRegions()
    setSession({ incompatibleActivities: 1 })
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(regions, /1 saved activity was made by a newer version/)
  })

  it('announces the sample athlete when the sample loads', () => {
    const view = render(<App />)
    const regions = mountedStatusRegions()
    showResult()
    setSession({ isSample: true })
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(
      regions,
      /^Sample athlete, a 37-year-old man at 75 kg\. Not kept: add files to replace it\.$/,
    )
  })

  it('announces a finished upload in the sync status region', () => {
    app.analysis.uploading = 2
    const view = render(<App />)
    const regions = mountedStatusRegions()
    app.analysis.uploading = null
    view.rerender(<App />)
    expectAnnouncedFromMountedRegion(regions, /Saved 2 activities to your library/)
  })
})

describe('what the app noted about the data', () => {
  it('is forgotten when the visitor signs out', async () => {
    window.localStorage.setItem('rca.aboutDataSeen', '{"walking":3}')
    render(<App />)
    fireEvent.click(document.querySelector('.account-menu__trigger')!)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(app.account.signOut).toHaveBeenCalledOnce())
    expect(window.localStorage.getItem('rca.aboutDataSeen')).toBeNull()
  })

  it('forgets the runs counted at walking pace once the visitor is signed out, and not if signing out failed', async () => {
    window.localStorage.setItem('rca.countedRuns.v1', '["run-5"]')
    app.account.signOut = vi.fn(async () => {
      throw new Error('offline')
    })
    const view = render(<App />)
    fireEvent.click(document.querySelector('.account-menu__trigger')!)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(app.account.signOut).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(window.localStorage.getItem('rca.countedRuns.v1')).not.toBeNull()
    view.unmount()

    app.account.signOut = vi.fn(async () => undefined)
    render(<App />)
    fireEvent.click(document.querySelector('.account-menu__trigger')!)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(window.localStorage.getItem('rca.countedRuns.v1')).toBeNull())
  })
})

describe('a sign-in the API refused', () => {
  it('says why on arrival in the notice region, and takes the reason out of the address', () => {
    window.history.replaceState(null, '', '#/?signin=rate_limited')
    render(<App />)

    const message = screen.getByText(/Too many sign-in attempts from this network/)
    expect(message.closest('[role="status"]')).not.toBeNull()
    expect(window.location.hash).toBe('#/')
  })
})
