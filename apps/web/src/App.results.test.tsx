// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { preloadAllPages } from './ui/lazyPages'
import { app, resetAppMocks, setAccount, setSession } from './test/appMocks'

// The pages load on first use in the app; these tests render one the moment its route is chosen.
beforeAll(preloadAllPages)

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

beforeEach(() => {
  resetAppMocks()
})

/** Signed in, the library read has answered with two saved activities, and the server's results have not come. */
function indexLoadedNoResults() {
  setAccount('signed-in')
  app.analysis.libraryStatus = 'loaded'
  app.analysis.savedActivities = [
    { id: 'a', name: 'Morning run', startMs: 1, sport: 'run' },
    { id: 'b', name: 'Evening ride', startMs: 2, sport: 'ride' },
  ] as never
  setSession({ libraryActivities: 2 })
}

describe('a library whose index has loaded and whose results have not come', () => {
  it('shows the loading state, not that the library holds no runs or rides, while the server computes', () => {
    indexLoadedNoResults()
    app.analysis.resultsWaiting = true
    render(<App />)
    expect(screen.queryByText(/holds no runs or rides yet/)).toBeNull()
    expect(screen.queryByRole('heading', { level: 1, name: 'Your library is here' })).toBeNull()
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('status')
        .map((status) => status.textContent),
    ).toContain('Loading')
  })

  it('says it is not showing yet, with a retry, when the results could not be fetched', () => {
    indexLoadedNoResults()
    app.analysis.resultsFailed = true
    app.analysis.retryResults = vi.fn()
    render(<App />)
    expect(screen.queryByText(/holds no runs or rides yet/)).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your library is not showing yet' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your results could not be fetched.')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing was lost/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(app.analysis.retryResults).toHaveBeenCalledTimes(1)
    expect(app.analysis.retryLibrary).not.toHaveBeenCalled()
  })

  it('offers no retry when the day’s budget is spent, which asking again cannot mend', () => {
    indexLoadedNoResults()
    app.analysis.resultsFailed = true
    app.analysis.retryResults = null
    render(<App />)
    expect(screen.getByText('Your results could not be fetched.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByText('Fetching is available again tomorrow.')).toBeInTheDocument()
  })

  it('still shows the held page for a library whose results are here and hold nothing to show', () => {
    indexLoadedNoResults()
    setSession({ outdatedActivities: 2 })
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Update your library' }),
    ).toBeInTheDocument()
  })
})
