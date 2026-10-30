// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { app, resetAppMocks, setAccount, setSession, showResult } from './test/appMocks'

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

const LANDING_HEADING = 'Are you a better runner or a better cyclist?'

beforeEach(() => {
  resetAppMocks()
})

describe('focus on navigation', () => {
  beforeEach(() => {
    showResult()
  })

  it.each(['Run', 'Ride', 'Activities'])(
    'opens the %s page and moves focus to its heading',
    async (name) => {
      render(<App />)
      const sections = screen.getByRole('navigation', { name: 'Sections' })
      fireEvent.click(within(sections).getByRole('link', { name }))
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name })).toHaveFocus())
    },
  )

  it('moves focus to the new heading when the method page is left for Balance', async () => {
    window.location.hash = '#/method'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeInTheDocument()
    const sections = screen.getByRole('navigation', { name: 'Sections' })
    fireEvent.click(within(sections).getByRole('link', { name: 'Balance' }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: /Your balance leans toward running/ }),
      ).toHaveFocus(),
    )
  })

  it('opens an activity from the list and moves focus to its heading', async () => {
    window.location.hash = '#/activities'
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Morning run' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Morning run' })).toHaveFocus(),
    )
  })

  it('opens the profile from the header and moves focus to its heading', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Profile' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toHaveFocus(),
    )
  })

  it('moves focus to the new page when a followed link still has focus', async () => {
    render(<App />)
    const run = within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', {
      name: 'Run',
    })
    run.focus()
    fireEvent.click(run)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Run' })).toHaveFocus(),
    )
  })

  it('leaves focus where the browser put it on the first render', () => {
    window.location.hash = '#/run'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Run' })).not.toHaveFocus()
  })
})

describe('focus when a page changes by itself', () => {
  it('moves focus to the landing heading when the library replies and the restoring page gives way', () => {
    setAccount('loading')
    app.analysis.restoring = true
    const view = render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Restoring your results' }),
    ).toBeInTheDocument()

    // The library replies with nothing kept, so the landing page takes the restoring page's place.
    app.analysis.restoring = false
    view.rerender(<App />)

    expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus()
  })

  it('moves focus to the new page when focus was lost with the old one', () => {
    const view = render(<App />)
    showResult()
    view.rerender(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /Your balance leans toward running/ }),
    ).toHaveFocus()
  })

  it('leaves focus on a header control that the visitor is still using', () => {
    const view = render(<App />)
    const profile = screen.getByRole('link', { name: 'Profile' })
    profile.focus()
    showResult()
    view.rerender(<App />)

    expect(profile).toHaveFocus()
  })
})

/** The busy strip, with its Stop button, shows once a run has lasted about 400 ms. */
function afterStripDelay() {
  act(() => {
    vi.advanceTimersByTime(400)
  })
}

describe('focus after an action completes', () => {
  it('moves focus to the landing heading when a stopped import ends, not to the page body', () => {
    vi.useFakeTimers()
    try {
      app.analysis.busy = true
      app.analysis.stop = vi.fn(() => {
        app.analysis.busy = false
      })
      render(<App />)
      afterStripDelay()
      const stop = screen.getByRole('button', { name: 'Stop current analysis' })
      stop.focus()
      fireEvent.click(stop)

      expect(
        screen.queryByRole('button', { name: 'Stop current analysis' }),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for the Stop button to go when the click did not focus it, as in Safari', () => {
    vi.useFakeTimers()
    try {
      app.analysis.busy = true
      // Stopping takes a moment: the button stays until the worker has restarted.
      app.analysis.stop = vi.fn()
      const view = render(<App />)
      afterStripDelay()
      const heading = () => screen.getByRole('heading', { level: 1, name: LANDING_HEADING })
      fireEvent.click(screen.getByRole('button', { name: 'Stop current analysis' }))
      expect(document.body).toHaveFocus()
      expect(heading()).not.toHaveFocus()

      app.analysis.busy = false
      view.rerender(<App />)
      expect(heading()).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves focus to the page heading when a restart clears its error', () => {
    showResult()
    app.analysis.error = 'Analysis stopped. Re-import your files to continue.'
    app.analysis.workerStopped = true
    app.analysis.retryWorker = vi.fn(() => {
      app.analysis.error = null
      app.analysis.workerStopped = false
    })
    render(<App />)
    const restart = screen.getByRole('button', { name: 'Restart analysis' })
    restart.focus()
    fireEvent.click(restart)

    expect(screen.queryByRole('button', { name: 'Restart analysis' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: /Your balance leans toward running/ }),
    ).toHaveFocus()
  })

  it('moves focus to the landing heading when a library retry starts loading', () => {
    app.analysis.libraryStatus = 'failed'
    app.analysis.retryLibrary = vi.fn(() => {
      app.analysis.libraryStatus = 'loading'
    })
    render(<App />)
    const retry = screen.getByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.click(retry)

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus()
  })

  it('moves focus to the rebuild notice when a rebuild ends and its button goes away', () => {
    setSession({ outdatedActivities: 2 })
    app.analysis.outdatedWithOriginal = 2
    app.analysis.rebuildSavedActivities = vi.fn(() => {
      app.analysis.busy = true
    })
    const view = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    view.rerender(<App />)

    app.analysis.busy = false
    setSession({ outdatedActivities: 0 })
    app.analysis.rebuildNotice = 'Rebuilt 2 saved activities.'
    view.rerender(<App />)

    expect(screen.getByText('Rebuilt 2 saved activities.')).toHaveFocus()
  })
})
