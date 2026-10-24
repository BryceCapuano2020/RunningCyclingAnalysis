// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrendPoint } from '@rca/core/digest'
import { App } from './App'
import {
  app,
  resetAppMocks,
  setAccount,
  setPreferences,
  setSession,
  showResult,
  updateProfile,
} from './test/appMocks'

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
  const { TrendChart } = await import('./ui/charts/TrendChart')
  return { ...heavyChartStubs, TrendChart }
})

const LANDING_HEADING = 'How balanced are you as an athlete?'

/** A weekly trend point ending at week (0 = the first week) with the given run and ride values. */
const week = (index: number, runWkg: number | null, rideWkg: number | null): TrendPoint => ({
  endMs: Date.UTC(2025, 0, 12 + index * 7, 23, 59, 59, 999),
  runWkg,
  rideWkg,
  runCount: runWkg === null ? 0 : 1,
  rideCount: rideWkg === null ? 0 : 1,
})

beforeEach(() => {
  resetAppMocks()
})

describe('header', () => {
  it('hides the section tabs on the landing page', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
  })

  it('shows the section tabs once there is a result, with Balance marked as the current page', () => {
    showResult()
    render(<App />)
    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(sections).getByRole('link', { name: 'Balance' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(sections).getByRole('link', { name: 'Run' })).toHaveAttribute('href', '#/run')
    expect(within(sections).getByRole('link', { name: 'Activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
  })

  it('makes Add files the primary button only with a result or when signed in', () => {
    setAccount('signed-out')
    const { unmount } = render(<App />)
    expect(screen.getByRole('button', { name: 'Add files' })).toHaveClass('btn')
    expect(screen.getByRole('button', { name: 'Add files' })).not.toHaveClass('btn-primary')
    unmount()

    setAccount('signed-in')
    const signedIn = render(<App />)
    expect(screen.getByRole('button', { name: 'Add files' })).toHaveClass('btn-primary')
    signedIn.unmount()

    setAccount('signed-out')
    showResult()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Add files' })).toHaveClass('btn-primary')
  })

  it('opens the profile page without a result, from its own link', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Profile' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: LANDING_HEADING })).toBeNull()
  })

  it('renders the profile page when the hash names it, with no result', () => {
    window.location.hash = '#/profile'
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: LANDING_HEADING })).toBeNull()
  })
})

describe('profile persistence', () => {
  beforeEach(() => {
    window.location.hash = '#/profile'
  })

  it('saves a unit change as the units field alone', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: 'Metric' }))
    expect(updateProfile).toHaveBeenCalledOnce()
    expect(updateProfile).toHaveBeenCalledWith({ units: 'metric' })
  })

  it('saves only the body weight that was entered when Enter is pressed', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    render(<App />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '80{Enter}')
    expect(updateProfile).toHaveBeenCalledWith({ massKg: 80 })
  })

  it('tells the athlete a weight was not saved when the account refuses it', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    updateProfile.mockRejectedValueOnce(new Error('offline'))
    render(<App />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '80{Enter}')
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    expect(body).toHaveValue('80')
  })

  it('does not resend a failed weight edit with a later units change', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    updateProfile.mockRejectedValueOnce(new Error('offline'))
    render(<App />)

    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '80{Enter}')
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(updateProfile).toHaveBeenCalledTimes(2)
    expect(updateProfile).toHaveBeenNthCalledWith(2, { units: 'imperial' })
  })

  it('mirrors a signed-in edit into the saved preferences, so signing out shows it', async () => {
    setAccount('signed-in', { units: 'metric' })
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))

    await waitFor(() =>
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ sex: 'male', units: 'metric' }),
      ),
    )
    expect(updateProfile).toHaveBeenCalledWith({ sex: 'male' })
  })

  it('does not mirror an edit the account refused', async () => {
    setAccount('signed-in', { units: 'metric' })
    updateProfile.mockRejectedValueOnce(new Error('offline'))
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: 'Male' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(setPreferences).not.toHaveBeenCalled()
  })

  it('keeps a signed-out visitor’s edits on this device instead of saving them', () => {
    setAccount('signed-out')
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: 'Metric' }))
    expect(setPreferences).toHaveBeenCalledWith({
      settings: { massKg: null, bikeMassKg: 9 },
      units: 'metric',
      birthYear: null,
      sex: null,
      setupDone: false,
    })
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

describe('original file retention', () => {
  beforeEach(() => {
    window.location.hash = '#/profile'
  })

  it('lets a new library opt into original files before its first import', () => {
    setAccount('signed-in', { keepFiles: false })
    render(<App />)
    const retention = screen.getByRole('checkbox', { name: 'Keep original files in my library' })
    expect(retention).not.toBeChecked()
    expect(retention).toHaveAccessibleDescription(/Turning this off deletes saved originals/)
    fireEvent.click(retention)
    expect(updateProfile).toHaveBeenCalledWith({ keepFiles: true })
  })

  it('disables retention without changing the saved preference when storage is unavailable', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { fileRetentionAvailable: false, units: 'metric' })
    render(<App />)

    const retention = screen.getByRole('checkbox', { name: 'Keep original files in my library' })
    expect(retention).toBeChecked()
    expect(retention).toBeDisabled()
    expect(
      screen.getByText(/Your saved preference is preserved; new imports save summaries only/),
    ).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()

    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '80{Enter}')
    expect(updateProfile).toHaveBeenCalledWith({ massKg: 80 })
  })
})

describe('signed-in and unavailable library', () => {
  it('offers no sample on the landing page once signed in, and says where imports are saved', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: 'See a sample athlete' })).not.toBeInTheDocument()
    expect(screen.getByText(/Activity summaries are saved to your library/)).toBeInTheDocument()
  })

  it('says sign-in is unavailable and that results are kept in this browser', () => {
    setAccount('unavailable')
    render(<App />)
    expect(
      screen.getByText(
        'Sign-in is unavailable right now. Your results are kept in this browser in the meantime.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the saved library section on the profile page once loaded, even with no activities', () => {
    window.location.hash = '#/profile'
    render(<App />)
    const region = screen.getByRole('region', { name: 'Saved library' })
    expect(within(region).getByText('No saved activities')).toBeInTheDocument()
  })

  it('does not show the saved library while the library is still loading', () => {
    window.location.hash = '#/profile'
    app.analysis.libraryStatus = 'loading'
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Saved library' })).not.toBeInTheDocument()
  })
})

describe('fitness over time', () => {
  it('is on the Balance page, and shown only once two weeks have a run or ride value', () => {
    showResult()
    setSession({ trend: [week(0, null, null), week(1, 15, null), week(2, null, null)] })
    const { unmount } = render(<App />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Fitness over time' })).toBeNull()
    unmount()

    setSession({ trend: [week(0, null, null), week(1, 15, null), week(2, 15.2, 14)] })
    render(<App />)
    expect(screen.getByRole('heading', { level: 2, name: 'Fitness over time' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: /^Running grade-adjusted pace per (kilometre|mile), best 20 minutes by week\./,
      }),
    ).toBeInTheDocument()
  })
})

describe('removing all activities', () => {
  it('keeps the profile until the analysis has cleared, then returns to the landing page', async () => {
    window.location.hash = '#/profile'
    setAccount('signed-out')
    showResult()
    const view = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(app.analysis.clear).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('#/profile')

    setSession({ result: null })
    view.rerender(<App />)

    await waitFor(() => expect(window.location.hash).toBe('#/'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus(),
    )
  })
})

describe('removing kept activities with no result on screen', () => {
  it('goes to the landing page at once, and moves focus to its heading', async () => {
    window.location.hash = '#/profile'
    setAccount('signed-out')
    app.analysis.savedActivities = [
      {
        id: 'run-1',
        name: 'Morning run',
        startMs: Date.UTC(2026, 9, 20, 12),
        sport: 'run',
        copy: { id: 'run-1', rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
      },
    ]
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }))

    await waitFor(() => expect(window.location.hash).toBe('#/'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus(),
    )
    expect(app.analysis.clear).toHaveBeenCalledOnce()
  })
})

describe('deleting the account', () => {
  /** Opens the delete dialog from Profile, types the account's email and confirms. */
  async function confirmDeletion() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete account…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your account?' })
    await user.type(within(dialog).getByLabelText('Email address'), 'ada@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }))
  }

  it('returns to the landing page once the account is gone', async () => {
    window.location.hash = '#/profile'
    app.account.deleteAccount = vi.fn(async () => setAccount('signed-out'))
    render(<App />)

    await confirmDeletion()

    await waitFor(() => expect(window.location.hash).toBe('#/'))
    expect(await screen.findByRole('heading', { level: 1, name: LANDING_HEADING })).toHaveFocus()
  })

  it('says on the landing page that the account and its data were deleted', async () => {
    window.location.hash = '#/profile'
    app.account.deleteAccount = vi.fn(async () => setAccount('signed-out'))
    render(<App />)

    await confirmDeletion()

    expect(await screen.findByText('Your account and data were deleted.')).toBeInTheDocument()
  })

  it('stays on the profile page when the account could not be deleted', async () => {
    window.location.hash = '#/profile'
    app.account.deleteAccount = vi.fn(async () => {
      throw new Error('Busy')
    })
    render(<App />)

    await confirmDeletion()

    expect(
      await screen.findByText('Your account could not be deleted. Try again.'),
    ).toBeInTheDocument()
    expect(window.location.hash).toBe('#/profile')
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  })
})

describe('footer', () => {
  it('links to the privacy page', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  it('carries the one privacy note on Profile, so the page does not repeat it', () => {
    window.location.hash = '#/profile'
    render(<App />)
    expect(document.querySelectorAll('.privacy-note')).toHaveLength(1)
  })
})
