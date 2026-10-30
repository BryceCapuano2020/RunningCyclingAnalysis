// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
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
  const { heavyChartStubs } = await import('./test/appMocks')
  return heavyChartStubs
})

const LANDING_HEADING = 'Are you a better runner or a better cyclist?'

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

  it('shows How sure is this? with its own content and loading line, not the restoring page, while a kept library still loads', () => {
    setAccount('loading')
    app.analysis.restoring = true
    window.location.hash = '#/method'
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeInTheDocument()
    expect(screen.getAllByText('Your saved results are loading.')).toHaveLength(1)
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Restoring your results' }),
    ).not.toBeInTheDocument()
  })
})
