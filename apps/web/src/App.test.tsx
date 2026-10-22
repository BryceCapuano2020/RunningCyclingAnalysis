// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const { updateProfile, analysisMock, accountMock } = vi.hoisted(() => ({
  updateProfile: vi.fn(async () => undefined),
  analysisMock: {
    outdatedActivities: 0,
    incompatibleActivities: 0,
    result: { activities: [], comparison: null, effort: [] } as null | {
      activities: unknown[]
      comparison: null
      effort: unknown[]
    },
    rebuildSavedActivities: vi.fn(),
    workerStopped: false,
    retryWorker: vi.fn(),
    stop: vi.fn(),
  },
  accountMock: { fileRetentionAvailable: true, keepFiles: true },
}))

vi.mock('./ui/useAccount', () => ({
  useAccount: () => ({
    status: 'signed-in',
    me: {
      fileRetentionAvailable: accountMock.fileRetentionAvailable,
      user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
      profile: {
        massKg: 75,
        bikeMassKg: 9,
        units: 'imperial',
        keepFiles: accountMock.keepFiles,
        updatedAt: 1000,
      },
    },
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
      syncFailures: 0,
      outdatedActivities: analysisMock.outdatedActivities,
      incompatibleActivities: analysisMock.incompatibleActivities,
    },
    busy: false,
    progress: null,
    uploading: null,
    error: null,
    rebuildNotice: null,
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
  Dropzone: () => null,
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
  SettingsBar: ({
    onChange,
  }: {
    onChange: (settings: { massKg: number; bikeMassKg: number }) => void
  }) => (
    <button type="button" onClick={() => onChange({ massKg: 80, bikeMassKg: 10 })}>
      Change weight
    </button>
  ),
  SignInCallout: () => null,
  SyncStatus: () => null,
  pickHeadline: () => null,
}))

afterEach(() => {
  updateProfile.mockClear()
  analysisMock.outdatedActivities = 0
  analysisMock.incompatibleActivities = 0
  analysisMock.result = { activities: [], comparison: null, effort: [] }
  analysisMock.rebuildSavedActivities.mockClear()
  accountMock.fileRetentionAvailable = true
  accountMock.keepFiles = true
})

describe('App profile persistence', () => {
  it('merges quick profile edits using the latest intended values', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Change units' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2))

    expect(updateProfile).toHaveBeenNthCalledWith(1, {
      massKg: 75,
      bikeMassKg: 9,
      units: 'metric',
      keepFiles: true,
    })
    expect(updateProfile).toHaveBeenNthCalledWith(2, {
      massKg: 80,
      bikeMassKg: 10,
      units: 'metric',
      keepFiles: true,
    })
  })

  it('rolls back a failed profile draft before an unrelated edit', async () => {
    updateProfile.mockRejectedValueOnce(new Error('offline'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Change units' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2))

    expect(updateProfile).toHaveBeenNthCalledWith(2, {
      massKg: 80,
      bikeMassKg: 10,
      units: 'imperial',
      keepFiles: true,
    })
  })

  it('keeps an earlier successful edit when a queued later edit fails', async () => {
    let failWeightEdit: (reason: Error) => void = () => undefined
    updateProfile
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failWeightEdit = reject
          }),
      )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Change units' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change weight' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2))

    await act(async () => {
      failWeightEdit(new Error('offline'))
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(3))

    expect(updateProfile).toHaveBeenNthCalledWith(3, {
      massKg: 75,
      bikeMassKg: 9,
      units: 'metric',
      keepFiles: false,
    })
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
    expect(updateProfile).toHaveBeenCalledWith({
      massKg: 75,
      bikeMassKg: 9,
      units: 'imperial',
      keepFiles: true,
    })
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
    expect(updateProfile).toHaveBeenCalledWith({
      massKg: 80,
      bikeMassKg: 10,
      units: 'imperial',
      keepFiles: true,
    })
  })

  it('disables saved-activity rebuilding when original file storage is unavailable', () => {
    accountMock.fileRetentionAvailable = false
    analysisMock.outdatedActivities = 2
    render(<App />)

    expect(screen.getByRole('button', { name: 'Rebuild saved activities' })).toBeDisabled()
    expect(screen.getByText(/Import the original FIT files to update them/)).toBeInTheDocument()
  })
})
