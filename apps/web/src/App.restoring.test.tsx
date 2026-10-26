// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { keptLibraryHinted } from './ui/analysis/keptLibrary'
import { RESTORING_BOUND_MS } from './ui/useRestoringWindow'
import { app, resetAppMocks, setAccount, showResult } from './test/appMocks'

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

beforeEach(() => {
  resetAppMocks()
})

describe('restoring kept results on a reload', () => {
  it('shows the restoring state in place of the landing page while the account and library load', () => {
    setAccount('loading')
    app.analysis.restoring = true
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Restoring your results' }),
    ).toBeInTheDocument()
  })

  it('shows the tabs, and no Add files in the header, while the results restore', () => {
    setAccount('loading')
    app.analysis.restoring = true
    render(<App />)
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
    expect(header.queryByRole('button', { name: 'Add files' })).not.toBeInTheDocument()
  })

  it('keeps the tabs after the restoring page gives way, while the account is still loading', () => {
    vi.useFakeTimers()
    try {
      setAccount('loading')
      app.analysis.restoring = true
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(RESTORING_BOUND_MS + 100)
      })
      expect(
        screen.queryByRole('heading', { level: 1, name: 'Restoring your results' }),
      ).not.toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).getByRole('navigation', { name: 'Sections' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the landing page once the library has loaded with nothing in it', () => {
    render(<App />)
    expect(
      screen.queryByRole('heading', { name: 'Restoring your results' }),
    ).not.toBeInTheDocument()
  })

  it('shows the results, not the restoring state, when they have loaded while restoring', () => {
    app.analysis.restoring = true
    showResult()
    render(<App />)
    expect(
      screen.queryByRole('heading', { name: 'Restoring your results' }),
    ).not.toBeInTheDocument()
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
