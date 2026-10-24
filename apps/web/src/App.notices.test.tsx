// @vitest-environment jsdom
import type { Copy } from '@rca/core/session'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
  const { heavyChartStubs, trendCharts } = await import('./test/appMocks')
  return { ...heavyChartStubs, ...(await trendCharts()) }
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
      screen.getByRole('heading', { level: 1, name: 'How balanced are you as an athlete?' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })

  it('shows Updating… and disables the button while a rebuild runs', () => {
    setSession({ outdatedActivities: 2 })
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
    render(<App />)
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled()
    expect(screen.getByText(ORIGINALS_UNAVAILABLE)).toBeInTheDocument()
  })
})

describe('missing original files', () => {
  it('says how many saved activities need their original file re-imported', () => {
    app.analysis.missingOriginals = 3
    render(<App />)
    expect(
      screen.getByText(
        '3 activities are missing their original file. Re-import them to restore the originals.',
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
        '2 activities were not fully saved because the connection dropped. Re-import them to retry.',
      ),
    ).toHaveAttribute('role', 'status')
  })
})

describe('rebuild, error and wait messages', () => {
  it('keeps the rebuild outcome in a status region', () => {
    app.analysis.rebuildNotice = 'Rebuilt 2 saved activities.'
    render(<App />)
    expect(screen.getByText('Rebuilt 2 saved activities.')).toHaveAttribute('role', 'status')
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
    app.analysis.busy = true
    app.analysis.waitingReason = 'Waiting for your library to load'
    render(<App />)
    expect(screen.getByText('Waiting for your library to load')).toBeInTheDocument()
  })

  it('announces the waiting reason when an import starts waiting', () => {
    const view = render(<App />)
    app.analysis.busy = true
    app.analysis.waitingReason = 'Waiting for your library to load'
    view.rerender(<App />)
    expect(announcements()).toContain('Waiting for your library to load')
  })
})

describe('saved library', () => {
  it('passes the library notice and error to the list, and disables delete while deleting', () => {
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
    app.analysis.libraryNotice = 'Deleted Morning run (20/10/2026).'
    app.analysis.libraryError = 'Could not delete the activity. Network down'
    app.analysis.libraryAction = 'deleting'
    render(<App />)

    const region = screen.getByRole('region', { name: 'Saved library' })
    expect(within(region).getByRole('status')).toHaveTextContent(
      'Deleted Morning run (20/10/2026).',
    )
    expect(within(region).getByRole('alert')).toHaveTextContent(
      'Could not delete the activity. Network down',
    )
    expect(within(region).getByRole('button', { name: /^Delete Morning run, / })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
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
      /^Showing a sample athlete\. Add your own files to replace it\.$/,
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
