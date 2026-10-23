// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const { updateProfile, analysisMock, accountMock, componentMock } = vi.hoisted(() => ({
  updateProfile: vi.fn(async () => undefined),
  analysisMock: {
    outdatedActivities: 0,
    incompatibleActivities: 0,
    hiddenDuplicates: 0,
    result: { activities: [], comparison: null, effort: [] } as null | {
      activities: unknown[]
      comparison: null
      effort: unknown[]
    },
    syncIssues: [] as { code: string; count: number }[],
    libraryStatus: 'loaded' as 'idle' | 'loading' | 'loaded' | 'failed',
    missingOriginals: 0,
    importOutcome: null,
    savedActivities: [] as { id: string; name: string; startMs: number; sport: 'run' | 'ride' }[],
    retryLibrary: vi.fn(),
    rebuildSavedActivities: vi.fn(),
    rebuildNotice: null as string | null,
    busy: false,
    error: null as string | null,
    errorIssue: null as string | null,
    libraryAction: null as 'deleting' | null,
    libraryNotice: null as string | null,
    libraryError: null as string | null,
    waitingReason: null as string | null,
    workerStopped: false,
    retryWorker: vi.fn(),
    stop: vi.fn(),
  },
  accountMock: {
    status: 'signed-in' as 'signed-in' | 'unavailable',
    fileRetentionAvailable: true,
    keepFiles: true,
  },
  componentMock: {
    syncStatus: [] as Record<string, unknown>[],
    dropzone: [] as Record<string, unknown>[],
    savedLibrary: [] as Record<string, unknown>[],
  },
}))

vi.mock('./ui/useAccount', () => ({
  useAccount: () => ({
    status: accountMock.status,
    me:
      accountMock.status === 'signed-in'
        ? {
            fileRetentionAvailable: accountMock.fileRetentionAvailable,
            user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
            profile: {
              massKg: 75,
              bikeMassKg: 9,
              units: 'imperial',
              keepFiles: accountMock.keepFiles,
              updatedAt: 1000,
            },
          }
        : null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
    updateProfile,
    error: null,
  }),
}))

vi.mock('./ui/useAnalysis', () => ({
  useAnalysis: () => ({
    state: {
      result: analysisMock.result,
      rejected: [],
      unsupportedFiles: 0,
      isSample: false,
      totalActivities: 0,
      rangeDays: null,
      syncIssues: analysisMock.syncIssues,
      outdatedActivities: analysisMock.outdatedActivities,
      incompatibleActivities: analysisMock.incompatibleActivities,
    },
    busy: analysisMock.busy,
    progress: null,
    uploading: null,
    error: analysisMock.error,
    errorIssue: analysisMock.errorIssue,
    waitingReason: analysisMock.waitingReason,
    libraryAction: analysisMock.libraryAction,
    libraryNotice: analysisMock.libraryNotice,
    libraryError: analysisMock.libraryError,
    libraryStatus: analysisMock.libraryStatus,
    missingOriginals: analysisMock.missingOriginals,
    importOutcome: analysisMock.importOutcome,
    savedActivities: analysisMock.savedActivities,
    deleteActivity: vi.fn(),
    retryLibrary: analysisMock.retryLibrary,
    rebuildNotice: analysisMock.rebuildNotice,
    rebuildSavedActivities: analysisMock.rebuildSavedActivities,
    workerStopped: analysisMock.workerStopped,
    retryWorker: analysisMock.retryWorker,
    stop: analysisMock.stop,
    addFiles: vi.fn(),
    loadSample: vi.fn(),
    setRange: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('./ui/useSettings', () => ({
  usePreferences: () => [{ settings: { massKg: 75, bikeMassKg: 9 }, units: 'imperial' }, vi.fn()],
}))

vi.mock('./ui/charts', () => ({
  AccuracyScatter: () => null,
  CurveChart: () => null,
  HrScatter: () => null,
  RatioChart: () => null,
}))

vi.mock('./ui/components', () => ({
  AccountMenu: () => null,
  ActivitiesTable: () => null,
  Dropzone: (props: Record<string, unknown>) => {
    componentMock.dropzone.push(props)
    return null
  },
  EquivalenceTable: () => null,
  Header: ({ onUnitsChange }: { onUnitsChange: (units: 'metric') => void }) => (
    <button type="button" onClick={() => onUnitsChange('metric')}>
      Change units
    </button>
  ),
  Headline: () => null,
  Methodology: () => null,
  PrivacyNote: () => null,
  RangePicker: () => null,
  RejectedFiles: () => null,
  SavedLibrary: (props: Record<string, unknown>) => {
    componentMock.savedLibrary.push(props)
    return null
  },
  SettingsBar: ({
    onChange,
  }: {
    onChange: (settings: { massKg: number; bikeMassKg: number }) => void
  }) => (
    <button type="button" onClick={() => onChange({ massKg: 80, bikeMassKg: 10 })}>
      Change weight
    </button>
  ),
  ShareImageButton: () => null,
  SignInCallout: () => null,
  SyncStatus: (props: Record<string, unknown>) => {
    componentMock.syncStatus.push(props)
    return null
  },
  pickHeadline: () => null,
}))

afterEach(() => {
  updateProfile.mockReset()
  updateProfile.mockImplementation(async () => undefined)
  analysisMock.outdatedActivities = 0
  analysisMock.incompatibleActivities = 0
  analysisMock.result = { activities: [], comparison: null, effort: [] }
  analysisMock.syncIssues = []
  analysisMock.libraryStatus = 'loaded'
  analysisMock.missingOriginals = 0
  analysisMock.rebuildNotice = null
  analysisMock.busy = false
  analysisMock.error = null
  analysisMock.errorIssue = null
  analysisMock.libraryAction = null
  analysisMock.libraryNotice = null
  analysisMock.libraryError = null
  analysisMock.waitingReason = null
  analysisMock.savedActivities = []
  analysisMock.retryLibrary.mockClear()
  analysisMock.rebuildSavedActivities.mockClear()
  accountMock.status = 'signed-in'
  accountMock.fileRetentionAvailable = true
  accountMock.keepFiles = true
  componentMock.syncStatus.length = 0
  componentMock.dropzone.length = 0
  componentMock.savedLibrary.length = 0
})

describe('App profile persistence', () => {
  it('sends only the field each edit changes', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Change units' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2))

    expect(updateProfile).toHaveBeenNthCalledWith(1, { units: 'metric' })
    expect(updateProfile).toHaveBeenNthCalledWith(2, { massKg: 80, bikeMassKg: 10 })
  })

  it('does not resend a failed edit with a later one', async () => {
    updateProfile.mockRejectedValueOnce(new Error('offline'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Change units' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2))

    expect(updateProfile).toHaveBeenNthCalledWith(2, { massKg: 80, bikeMassKg: 10 })
  })

  it('sends a retention change as its own field', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))
    expect(updateProfile).toHaveBeenCalledWith({ keepFiles: false })
  })
})

describe('outdated saved activities', () => {
  it('shows the stale count and lets the signed-in user rebuild saved activities', () => {
    analysisMock.outdatedActivities = 2
    render(<App />)

    expect(screen.getByText(/2 saved activities use an older analysis model/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild saved activities' }))
    expect(analysisMock.rebuildSavedActivities).toHaveBeenCalledOnce()
  })

  it('shows a newer-version notice even when no compatible result exists', () => {
    analysisMock.incompatibleActivities = 1
    analysisMock.result = null
    render(<App />)

    expect(
      screen.getByText(
        /1 saved activity was created with a newer app version and is excluded from analysis/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /How do your running and cycling energy estimates compare/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Rebuild saved activities' }),
    ).not.toBeInTheDocument()
  })
})

describe('file retention availability', () => {
  it('lets a new library opt into original files before its first import', () => {
    analysisMock.result = null
    accountMock.keepFiles = false
    render(<App />)

    const retention = screen.getByRole('checkbox', { name: 'Keep original files in my library' })
    expect(retention).not.toBeChecked()
    expect(retention).toHaveAccessibleDescription(/Turning this off deletes saved originals/)
    fireEvent.click(retention)
    expect(updateProfile).toHaveBeenCalledWith({ keepFiles: true })
  })

  it('disables retention without changing the saved preference when storage is unavailable', () => {
    accountMock.fileRetentionAvailable = false
    render(<App />)

    const retention = screen.getByRole('checkbox', { name: 'Keep original files in my library' })
    expect(retention).toBeChecked()
    expect(retention).toBeDisabled()
    expect(
      screen.getByText(/Your saved preference is preserved; new imports save summaries only/),
    ).toBeInTheDocument()
    expect(screen.getByText(/existing saved originals are not deleted/i)).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    expect(updateProfile).toHaveBeenCalledWith({ massKg: 80, bikeMassKg: 10 })
  })

  it('disables saved-activity rebuilding when original file storage is unavailable', () => {
    accountMock.fileRetentionAvailable = false
    analysisMock.outdatedActivities = 2
    render(<App />)

    expect(screen.getByRole('button', { name: 'Rebuild saved activities' })).toBeDisabled()
    expect(screen.getByText(/Import the original files to update them/)).toBeInTheDocument()
  })
})

describe('library and sync status', () => {
  it('passes the sync issues and the signed-in state to the status line and the dropzone', () => {
    analysisMock.syncIssues = [{ code: 'network', count: 2 }]
    render(<App />)

    expect(componentMock.syncStatus.at(-1)).toMatchObject({
      issues: [{ code: 'network', count: 2 }],
      signedIn: true,
    })
    expect(componentMock.dropzone.at(-1)).toMatchObject({ signedIn: true })
  })

  it('offers a retry when the signed-in library could not be loaded', () => {
    analysisMock.libraryStatus = 'failed'
    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('Your library could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(analysisMock.retryLibrary).toHaveBeenCalledOnce()
  })

  it('says how many saved activities need their original file re-imported', () => {
    analysisMock.missingOriginals = 3
    render(<App />)

    expect(
      screen.getByText(
        '3 activities are missing their original file. Re-import them to restore the originals.',
      ),
    ).toBeInTheDocument()
  })

  it('hides the missing-original notice when originals are not kept', () => {
    analysisMock.missingOriginals = 3
    accountMock.keepFiles = false
    render(<App />)

    expect(screen.queryByText(/missing their original file/)).not.toBeInTheDocument()
  })

  it('says the library is unavailable and that nothing is saved', () => {
    accountMock.status = 'unavailable'
    render(<App />)

    expect(
      screen.getByText(
        'Your library is unavailable right now. Analysis still runs in your browser and nothing is being saved.',
      ),
    ).toBeInTheDocument()
  })

  it('links to the privacy page from the footer', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })
})

describe('library actions and notices', () => {
  it('keeps the rebuild outcome visible after every saved activity is rebuilt', () => {
    analysisMock.outdatedActivities = 0
    analysisMock.rebuildNotice = 'Rebuilt 2 saved activities.'
    render(<App />)

    expect(screen.getByText('Rebuilt 2 saved activities.')).toHaveAttribute('role', 'status')
  })

  it('shows a daily-limit error without the generic "Something went wrong" prefix', () => {
    analysisMock.error =
      'You have reached the daily limit for this account. The limit resets at 00:00 UTC.'
    analysisMock.errorIssue = 'daily-limit'
    render(<App />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/^You have reached the daily limit/)
    expect(alert).not.toHaveTextContent('Something went wrong')
  })

  it('keeps the saved library section when the library is loaded and has no activities', () => {
    analysisMock.savedActivities = []
    render(<App />)

    expect(screen.getByRole('region', { name: 'Saved library' })).toBeInTheDocument()
    expect(componentMock.savedLibrary.at(-1)).toMatchObject({ activities: [] })
  })

  it('passes the library notice and error to the saved library, and marks it busy while deleting', () => {
    analysisMock.libraryNotice = 'Deleted Morning run (20/10/2026).'
    analysisMock.libraryError = 'Could not delete the activity. Network down'
    analysisMock.libraryAction = 'deleting'
    render(<App />)

    expect(componentMock.savedLibrary.at(-1)).toMatchObject({
      status: 'Deleted Morning run (20/10/2026).',
      error: 'Could not delete the activity. Network down',
      busy: true,
    })
  })

  it('does not show the saved library while the library is still loading', () => {
    analysisMock.libraryStatus = 'loading'
    render(<App />)

    expect(screen.queryByRole('region', { name: 'Saved library' })).not.toBeInTheDocument()
  })

  it('passes the reason imports are waiting to the dropzone', () => {
    analysisMock.busy = true
    analysisMock.waitingReason = 'Waiting for your library to load'
    render(<App />)

    expect(componentMock.dropzone.at(-1)).toMatchObject({
      busy: true,
      waiting: 'Waiting for your library to load',
    })
  })
})
