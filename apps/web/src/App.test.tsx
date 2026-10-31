// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { canvasFile } from './share/download'
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
vi.mock('./api/measurements', async () => (await import('./test/appMocks')).measurementsApi)
// The share card is drawn in the browser; the tests count how often its preview is drawn.
vi.mock('./share/download', () => ({
  canShareImage: vi.fn(() => false),
  canvasFile: vi.fn(
    async (_canvas: HTMLCanvasElement, name: string) =>
      new File(['png'], name, { type: 'image/png' }),
  ),
  previewUrl: vi.fn(() => 'blob:preview'),
  releasePreview: vi.fn(),
  saveFile: vi.fn(() => 'saved' as const),
  shareFile: vi.fn(async () => 'shared' as const),
}))
vi.mock('./share/renderCard', () => ({
  loadCardFonts: vi.fn(async () => undefined),
  renderShareCard: vi.fn(() => true),
}))
vi.mock('./ui/charts', async () => {
  const { heavyChartStubs } = await import('./test/appMocks')
  return heavyChartStubs
})

const LANDING_HEADING = 'Are you a better runner or a better cyclist?'

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

  it('keeps the export guides out of the header, which holds only Add files, Profile and the account', () => {
    showResult()
    render(<App />)
    expect(
      within(screen.getByRole('banner')).queryByRole('button', { name: 'How to get your files' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['the landing page', ''],
    ['a deep link to the Run page', '#/run'],
    ['a deep link to an activity', '#/activities/x'],
  ])(
    'leaves Add files out of the header on %s with no result, whose drop zone has its own',
    (_name, hash) => {
      for (const account of ['signed-out', 'signed-in'] as const) {
        setAccount(account)
        window.location.hash = hash
        const { unmount } = render(<App />)
        expect(screen.getByRole('heading', { level: 1, name: LANDING_HEADING })).toBeInTheDocument()
        expect(
          within(screen.getByRole('banner')).queryByRole('button', { name: 'Add files' }),
        ).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
        unmount()
      }
    },
  )

  it('makes the header Add files the primary button only with a result or when signed in', () => {
    window.location.hash = '#/method'
    setAccount('signed-out')
    const { unmount } = render(<App />)
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).toHaveClass('btn')
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).not.toHaveClass('btn-primary')
    unmount()

    setAccount('signed-in')
    const signedIn = render(<App />)
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).toHaveClass('btn-primary')
    signedIn.unmount()

    setAccount('signed-out')
    showResult()
    render(<App />)
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Add files' }),
    ).toHaveClass('btn-primary')
  })

  it.each([
    ['the Balance page', '#/'],
    ['the Run page', '#/run'],
    ['the Ride page', '#/ride'],
    ['the activities page', '#/activities'],
    ['the method page', '#/method'],
    ['the profile page', '#/profile'],
  ])('shows at most one primary button on %s, signed in or out', (_name, hash) => {
    for (const account of ['signed-out', 'signed-in'] as const) {
      setAccount(account)
      showResult()
      window.location.hash = hash
      const { container, unmount } = render(<App />)
      expect(container.querySelectorAll('.btn-primary').length).toBeLessThanOrEqual(1)
      unmount()
    }
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

    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))

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

    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))
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
    // The footer carries the one privacy statement; the drop zone no longer repeats it.
    expect(screen.getByText(/stored in your private library/)).toBeInTheDocument()
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

describe('removing all activities', () => {
  it('keeps the profile until the analysis has cleared, then returns to the landing page', async () => {
    window.location.hash = '#/profile'
    setAccount('signed-out')
    showResult()
    const view = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear the analysis' }))
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
    // The worker reports the library gone, as it does after a real clear.
    app.analysis.clear = vi.fn(() => {
      app.analysis.savedActivities = []
    })
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

  it('forgets the runs counted at walking pace with the account, and not when the deletion fails', async () => {
    window.localStorage.setItem('rca.countedRuns.v1', '["run-5"]')
    window.location.hash = '#/profile'
    app.account.deleteAccount = vi.fn(async () => {
      throw new Error('Busy')
    })
    const view = render(<App />)
    await confirmDeletion()
    await screen.findByText('Your account could not be deleted. Try again.')
    expect(window.localStorage.getItem('rca.countedRuns.v1')).not.toBeNull()
    view.unmount()

    app.account.deleteAccount = vi.fn(async () => setAccount('signed-out'))
    render(<App />)
    await confirmDeletion()
    await waitFor(() => expect(window.localStorage.getItem('rca.countedRuns.v1')).toBeNull())
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

describe('share preview', () => {
  it('draws the preview once when the app renders again with an equal settings object', async () => {
    app.preferences = {
      ...app.preferences,
      settings: { massKg: 75, bikeMassKg: 9 },
      setupDone: true,
    }
    showResult()
    const { rerender } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Share image' }))
    await screen.findByRole('img', { name: 'Preview of the square card' })
    await settle()
    const drawn = vi.mocked(canvasFile).mock.calls.length
    // An equal settings object, built anew, as the preferences hand it out on each change.
    app.preferences = { ...app.preferences, settings: { ...app.preferences.settings } }
    rerender(<App />)
    await settle()
    expect(vi.mocked(canvasFile).mock.calls.length).toBe(drawn)
  })
})

/** Lets the share preview's drawing finish, so a redraw that would follow has happened. */
function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
}

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
