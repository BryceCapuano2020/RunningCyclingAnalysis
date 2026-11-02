// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * The one App test file that does not load the pages first (see lazyPages.ts): the profile, result and
 * method pages load the first time they are shown. Each test reaches a page that has not loaded yet, so each
 * test gets a fresh module graph: a page that has loaded renders at once for the rest of the module's life,
 * and the tests would otherwise depend on their order.
 */

/**
 * A fresh App over fresh mocks, with none of its pages loaded. Nothing is preloaded: a preload (App starts one
 * when someone is signed in) would load the result page that a test needs to find unloaded.
 */
async function freshApp() {
  vi.resetModules()
  const mocks = await import('./test/appMocks')
  vi.doMock('./ui/useAccount', () => ({ useAccount: mocks.useAccountMock }))
  vi.doMock('./ui/useAnalysis', () => ({ useAnalysis: mocks.useAnalysisMock }))
  vi.doMock('./ui/useSettings', () => ({ usePreferences: mocks.usePreferencesMock }))
  vi.doMock('./ui/charts', () => mocks.heavyChartStubs)
  vi.doMock('./ui/lazyPages', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./ui/lazyPages')>()),
    preloadResultPages: () => undefined,
  }))
  mocks.resetAppMocks()
  window.location.hash = '#/'
  const { App } = await import('./App')
  return { App, showResult: mocks.showResult }
}

// A page's first load can be slow on a loaded machine.
const LOAD = { timeout: 5000 }

// The first import of a module transforms it, which is slow for App and its pages. That is paid once here, so
// the first test to open a page does not pay for it. The modules are evaluated again for each test.
beforeAll(async () => {
  await freshApp()
  await Promise.all([
    import('./ui/pages/ResultPage'),
    import('./ui/pages/HistoryPage'),
    import('./ui/pages/ProfilePage'),
    import('./ui/pages/MethodPage'),
  ])
})

describe('pages that load when first shown', () => {
  it('shows a loading status for the profile, then the page, and moves focus to its heading', async () => {
    const { App, showResult } = await freshApp()
    showResult()
    render(<App />)
    // The balance page is still loading, and the profile is not asked for yet.
    expect(screen.getByText('Loading')).toHaveAttribute('role', 'status')
    await screen.findByRole(
      'heading',
      { level: 1, name: /Your balance leans toward running/ },
      LOAD,
    )
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Profile' }))
    // Focus is not claimed for a page that is not on screen; it arrives with the page.
    expect(screen.queryByRole('heading', { level: 1, name: 'Profile' })).not.toBeInTheDocument()
    const heading = await screen.findByRole('heading', { level: 1, name: 'Profile' }, LOAD)
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('loads the History charts when the tab is first opened, apart from the result pages', async () => {
    const { App, showResult } = await freshApp()
    showResult()
    render(<App />)
    await screen.findByRole(
      'heading',
      { level: 1, name: /Your balance leans toward running/ },
      LOAD,
    )
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    // The History page is not in the result pages' chunk: it loads on its own, under a loading status, and focus
    // arrives with it.
    expect(await screen.findByText('Loading', undefined, LOAD)).toHaveAttribute('role', 'status')
    const heading = await screen.findByRole('heading', { level: 1, name: 'History' }, LOAD)
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('shows the method page for a visitor with no results once it has loaded', async () => {
    const { App } = await freshApp()
    window.location.hash = '#/method'
    render(<App />)
    expect(screen.getByText('Loading')).toHaveAttribute('role', 'status')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'How sure is this?' }, LOAD),
    ).toBeInTheDocument()
  })
})
