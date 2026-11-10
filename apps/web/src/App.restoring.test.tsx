// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { preloadAllPages } from './ui/lazyPages'
import { keptLibraryHinted } from './ui/analysis/keptLibrary'
import { app, resetAppMocks, setAccount, showResult } from './test/appMocks'

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

describe('restoring kept results on a reload', () => {
  it('shows the page title in place of the landing page, with a loading status, while the account and library load', () => {
    setAccount('loading')
    app.analysis.restoring = true
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Balance' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('status')
        .map((status) => status.textContent),
    ).toContain('Loading')
  })

  it('names the page the address holds, not the landing page, while its results restore', () => {
    setAccount('loading')
    app.analysis.restoring = true
    window.location.hash = '#/run'
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Run' }).closest('[aria-busy="true"]'),
    ).not.toBeNull()
  })

  it('shows the page links and Add files in the header while the results restore', () => {
    setAccount('loading')
    app.analysis.restoring = true
    render(<App />)
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('navigation', { name: 'More pages' })).toBeInTheDocument()
    expect(header.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
  })

  it('keeps the rail beside the restoring state, so the page does not move when the results arrive', () => {
    setAccount('loading')
    app.analysis.restoring = true
    render(<App />)
    const rail = screen.getByRole('navigation', { name: 'Pages' })
    expect(
      within(rail)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Balance', 'Run', 'Ride'])
    expect(rail.closest('.shell')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Balance' }),
    )
  })

  it('shows Add files in the header on Method while the results restore, since that page has none of its own', () => {
    setAccount('loading')
    app.analysis.restoring = true
    window.location.hash = '#/method'
    render(<App />)
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).toBeInTheDocument()
  })

  it('shows Add files in the header on Profile while the results restore, since that page has none of its own', () => {
    setAccount('loading')
    app.analysis.restoring = true
    window.location.hash = '#/profile'
    render(<App />)
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).toBeInTheDocument()
  })

  it('keeps the restoring state and the tabs past three seconds, while the account is still loading', () => {
    vi.useFakeTimers()
    try {
      setAccount('loading')
      app.analysis.restoring = true
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByRole('heading', { level: 1, name: 'Balance' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('navigation', { name: 'More pages' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives way to the landing page only when the library has replied, while the account is still loading', () => {
    setAccount('loading')
    app.analysis.restoring = true
    const view = render(<App />)
    app.analysis.restoring = false
    view.rerender(<App />)
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows the landing page once the library has loaded with nothing in it', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Are you a better runner or a better cyclist?',
      }),
    ).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows the results, not the restoring state, when they have loaded while restoring', () => {
    app.analysis.restoring = true
    showResult()
    render(<App />)
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })
})

describe('the account control when sign-in is unavailable', () => {
  it('says sign-in is unavailable where the sign-in button would be, and nothing more', () => {
    setAccount('unavailable')
    render(<App />)
    expect(screen.getByText('Sign-in is unavailable right now')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('a reload with a kept library, on a deep link', () => {
  afterEach(() => {
    localStorage.removeItem('rca.kept.v1')
  })

  it('shows no notice while the library restores, and keeps the deep link once the results are back', () => {
    localStorage.setItem('rca.kept.v1', '1')
    setAccount('signed-out')
    // useAnalysis is mocked here; the real library state starts restoring from this same hint.
    app.analysis.restoring = keptLibraryHinted()
    window.location.hash = '#/run'
    const view = render(<App />)
    expect(screen.queryByText('Add your files to see this page.')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/run')

    app.analysis.restoring = false
    showResult()
    view.rerender(<App />)
    expect(screen.queryByText('Add your files to see this page.')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/run')
  })
})
