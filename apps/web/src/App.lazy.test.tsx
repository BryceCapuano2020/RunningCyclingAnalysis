// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { resetAppMocks, showResult } from './test/appMocks'

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

// No preloading: a preload (App starts one when someone is signed in) would load a page the other test needs
// to find unloaded, so the tests would depend on their order.
vi.mock('./ui/lazyPages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui/lazyPages')>()),
  preloadResultPages: () => undefined,
}))

/*
 * The one App test file that does not load the pages first (see lazyPages.tsx): the profile, result and
 * method pages load the first time they are shown. Each test reaches a page that has not loaded yet, so each
 * test uses a page of its own: a page that has loaded renders at once for the rest of the file.
 */

// A page's first load can be slow on a loaded machine.
const LOAD = { timeout: 5000 }

beforeEach(() => {
  resetAppMocks()
  window.location.hash = '#/'
})

describe('pages that load when first shown', () => {
  it('shows a loading status for the profile, then the page, and moves focus to its heading', async () => {
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

  it('shows the method page for a visitor with no results once it has loaded', async () => {
    window.location.hash = '#/method'
    render(<App />)
    expect(screen.getByText('Loading')).toHaveAttribute('role', 'status')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'How sure is this?' }, LOAD),
    ).toBeInTheDocument()
  })
})
