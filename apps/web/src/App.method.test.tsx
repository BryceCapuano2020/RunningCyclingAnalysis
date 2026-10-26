// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { app, resetAppMocks, setAccount, showResult } from './test/appMocks'
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
  const { heavyChartStubs, trendCharts } = await import('./test/appMocks')
  return { ...heavyChartStubs, ...(await trendCharts()) }
})

const LANDING_HEADING = 'How balanced are you as an athlete?'

beforeEach(() => {
  resetAppMocks()
})

describe('How sure is this? with no result loaded', () => {
  it('shows the method page, not the landing page, when the hash names it', () => {
    window.location.hash = '#/method'
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: LANDING_HEADING })).toBeNull()
  })

  it('shows no cold notice, since the method needs no files to say what it is', () => {
    window.location.hash = '#/method'
    render(<App />)

    expect(screen.queryByText(COLD_NOTICE)).toBeNull()
  })

  it('keeps the address on How sure is this?, rather than sending the visitor to Balance', () => {
    window.location.hash = '#/method'
    render(<App />)

    expect(window.location.hash).toBe('#/method')
  })

  it('moves focus to the Method heading when results arrive on it, as it does on any page change', async () => {
    window.location.hash = '#/method'
    const { rerender } = render(<App />)
    expect(app.analysis.state.result).toBeNull()

    showResult()
    rerender(<App />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toHaveFocus(),
    )
  })

  it('says saved results are loading once, under the energy view, when the restoring page gives way, while a kept library still loads', () => {
    vi.useFakeTimers()
    try {
      setAccount('loading')
      app.analysis.restoring = true
      window.location.hash = '#/method'
      render(<App />)
      expect(screen.queryAllByText('Your saved results are loading.')).toHaveLength(0)

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(screen.getAllByText('Your saved results are loading.')).toHaveLength(1)
      expect(screen.queryByText('Add your files to see this evidence.')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
