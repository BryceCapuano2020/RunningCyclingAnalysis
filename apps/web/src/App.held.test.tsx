// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { app, resetAppMocks, setAccount, setSession } from './test/appMocks'
import { COLD_NOTICE } from './ui/useRouteGuard'

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

const LANDING = 'Are you a better runner or a better cyclist?'

/** A signed-in library whose every digest is held out for an older model: no result, a library all the same. */
function staleLibrary(count = 3000) {
  setAccount('signed-in')
  app.analysis.libraryStatus = 'loaded'
  app.analysis.savedActivities = Array.from({ length: Math.min(count, 3) }, (_, i) => ({
    id: `s${i}`,
    name: `Run ${i}`,
    startMs: Date.UTC(2024, 0, 1 + i),
    sport: 'run' as const,
    copy: { id: `s${i}`, rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
  }))
  setSession({
    result: null,
    outdatedActivities: count,
    libraryActivities: count,
    heldOut: Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      name: `Run ${i}`,
      sport: 'run' as const,
      startMs: Date.UTC(2024, 0, 1 + i),
      status: 'stale' as const,
    })),
  })
}

beforeEach(() => {
  resetAppMocks()
  window.location.hash = '#/'
})

describe('a signed-in library with every digest held out', () => {
  it('shows the update page, not the landing page or the sample', () => {
    staleLibrary()
    app.analysis.outdatedWithOriginal = 3000
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Update your library' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: LANDING })).not.toBeInTheDocument()
    expect(
      screen.getByText('3,000 activities will be rebuilt from your saved files.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Sample athlete/)).not.toBeInTheDocument()
  })

  it('has one Update now, on the page, which rebuilds; the notices do not repeat it', () => {
    staleLibrary()
    app.analysis.outdatedWithOriginal = 3000
    render(<App />)
    const buttons = screen.getAllByRole('button', { name: 'Update now' })
    expect(buttons).toHaveLength(1)
    // One primary action on the screen: Update now, not the header's Add files as well.
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(buttons[0]).toHaveClass('btn-primary')
    expect(screen.queryByLabelText('Saved activity updates')).not.toBeInTheDocument()
    fireEvent.click(buttons[0]!)
    expect(app.analysis.rebuildSavedActivities).toHaveBeenCalledOnce()
  })

  it('keeps the section tabs and a primary Add files, and lists what is held out', () => {
    staleLibrary()
    render(<App />)
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
    expect(header.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Activities held out of the analysis' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('asks for the files of activities with no original', () => {
    staleLibrary(412)
    app.analysis.outdatedWithOriginal = 0
    render(<App />)
    expect(screen.getByText(/412 activities need their files added again/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add files' }).length).toBeGreaterThan(0)
    // With no Update now, Add files is the one primary action.
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1)
  })

  it('never says "add your files first" on a deep link, since the library is there', () => {
    staleLibrary()
    window.location.hash = '#/run'
    render(<App />)
    expect(screen.queryByText(COLD_NOTICE)).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Update your library' }),
    ).toBeInTheDocument()
  })

  it('keeps How sure is this? as its own page', () => {
    staleLibrary()
    window.location.hash = '#/method'
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Update your library' })).not.toBeInTheDocument()
  })

  it('has its own document title, not Balance', () => {
    staleLibrary()
    render(<App />)
    expect(document.title).toMatch(/^Update your library · /)
  })
})

describe('a library made only by a newer app', () => {
  it('says to reload, with no update button', () => {
    setAccount('signed-in')
    app.analysis.libraryStatus = 'loaded'
    setSession({ result: null, incompatibleActivities: 4, libraryActivities: 4 })
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your library needs a newer app' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument()
  })
})

describe('a library that has not answered', () => {
  it('shows the restoring page while a signed-in library loads, never the landing page', () => {
    setAccount('signed-in')
    app.analysis.libraryStatus = 'loading'
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Restoring your results' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: LANDING })).not.toBeInTheDocument()
  })

  it('says it is not showing yet, with the retry above, when the library could not be loaded', () => {
    setAccount('signed-in')
    app.analysis.libraryStatus = 'failed'
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your library is not showing yet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: LANDING })).not.toBeInTheDocument()
  })

  it('has its own document title while it restores', () => {
    setAccount('signed-in')
    app.analysis.libraryStatus = 'loading'
    render(<App />)
    expect(document.title).toMatch(/^Restoring your results · /)
  })

  it('says to reload, with no Retry, when this browser’s library could not be read', () => {
    setAccount('signed-out')
    app.analysis.deviceIssue = { issue: 'notRead' }
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your library is not showing yet' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Reload the page to try again/).length).toBeGreaterThan(0)
    expect(document.title).toMatch(/^Your library is not showing yet · /)
  })

  it('shows the landing page once a signed-in library has loaded and is empty', () => {
    setAccount('signed-in')
    app.analysis.libraryStatus = 'loaded'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: LANDING })).toBeInTheDocument()
  })
})
