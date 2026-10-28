// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDateOf } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { App } from './App'
import * as measurementsApi from './api/measurements'
import { resetAppMocks, setAccount, setPreferences, updateProfile } from './test/appMocks'

vi.mock('./ui/useAccount', async () => ({
  useAccount: (await import('./test/appMocks')).useAccountMock,
}))
vi.mock('./ui/useAnalysis', async () => ({
  useAnalysis: (await import('./test/appMocks')).useAnalysisMock,
}))
vi.mock('./ui/useSettings', async () => ({
  usePreferences: (await import('./test/appMocks')).usePreferencesMock,
}))
vi.mock('./api/measurements', () => ({
  listMeasurements: vi.fn(async () => []),
  putMeasurement: vi.fn(async (entry: Measurement) => entry),
  deleteMeasurement: vi.fn(async () => undefined),
}))

const TODAY = localDateOf(Date.now())
const OLD_MASS: Measurement = { kind: 'massKg', value: 90, from: '2020-01-01' }
const STORAGE_KEY = 'rca.measurements.v1'

beforeEach(() => {
  resetAppMocks()
  window.location.hash = '#/profile'
  localStorage.clear()
  vi.mocked(measurementsApi.listMeasurements).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function addSetting(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.selectOptions(screen.getByLabelText('Setting'), label)
  await user.clear(screen.getByLabelText('Value'))
  await user.type(screen.getByLabelText('Value'), value)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

describe('dated settings on Profile, signed in', () => {
  beforeEach(() => setAccount('signed-in', { units: 'metric' }))

  it('lists what the account holds, newest first within each setting', async () => {
    vi.mocked(measurementsApi.listMeasurements).mockResolvedValue([
      OLD_MASS,
      { kind: 'massKg', value: 80, from: '2024-05-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2023-02-01' },
    ])
    render(<App />)
    const table = await screen.findByRole('table', { name: 'Your dated settings' })
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .slice(0, 3)
          .map((cell) => cell.textContent),
      )
    expect(rows).toEqual([
      ['Body weight', expect.stringContaining('2024'), '80 kg'],
      ['Body weight', expect.stringContaining('2020'), '90 kg'],
      ['Max heart rate (run)', expect.stringContaining('2023'), '188 bpm'],
    ])
  })

  it('keeps a dated weight in the account, and makes it the current weight when it is the latest', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    await addSetting(user, 'Body weight', '82')
    await waitFor(() =>
      expect(measurementsApi.putMeasurement).toHaveBeenCalledWith(
        { kind: 'massKg', value: 82, from: TODAY },
        'user-1',
      ),
    )
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ massKg: 82 }))
    expect(await screen.findByText(/^Added body weight/)).toBeInTheDocument()
  })

  it('does not change the current weight for a weight dated before a later one', async () => {
    const user = userEvent.setup()
    vi.mocked(measurementsApi.listMeasurements).mockResolvedValue([
      { kind: 'massKg', value: 75, from: '2024-05-01' },
    ])
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2022-01-01' } })
    await addSetting(user, 'Body weight', '90')
    await waitFor(() => expect(measurementsApi.putMeasurement).toHaveBeenCalled())
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('adds a dated weight from today when the current weight is set, once weights are dated', async () => {
    const user = userEvent.setup()
    vi.mocked(measurementsApi.listMeasurements).mockResolvedValue([OLD_MASS])
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '78{Enter}')
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ massKg: 78 }))
    await waitFor(() =>
      expect(measurementsApi.putMeasurement).toHaveBeenCalledWith(
        { kind: 'massKg', value: 78, from: TODAY },
        'user-1',
      ),
    )
  })

  it('does not date the current weight while no weight is dated', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '78{Enter}')
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ massKg: 78 }))
    expect(measurementsApi.putMeasurement).not.toHaveBeenCalled()
  })

  it('brings the current weight back to the one in effect when the latest is deleted', async () => {
    const user = userEvent.setup()
    vi.mocked(measurementsApi.listMeasurements).mockResolvedValue([
      OLD_MASS,
      { kind: 'massKg', value: 75, from: '2024-05-01' },
    ])
    render(<App />)
    const table = await screen.findByRole('table', { name: 'Your dated settings' })
    // The latest is first. Deleting it leaves the 90 kg of 2020 in effect today.
    await user.click(within(table).getAllByRole('button', { name: /^Delete body weight/ })[0]!)
    await waitFor(() =>
      expect(measurementsApi.deleteMeasurement).toHaveBeenCalledWith(
        { kind: 'massKg', value: 75, from: '2024-05-01' },
        'user-1',
      ),
    )
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ massKg: 90 }))
  })

  it('says why an entry was refused and keeps what was typed', async () => {
    const user = userEvent.setup()
    vi.mocked(measurementsApi.putMeasurement).mockRejectedValueOnce(new Error('Too many settings'))
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    await addSetting(user, 'Max heart rate (run)', '190')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many settings')
    expect(screen.getByLabelText('Value')).toHaveValue('190')
  })

  it('refuses a value outside the limits before asking the server', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    await addSetting(user, 'Threshold power (ride)', '9000')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a whole number from 50 to 700',
    )
    expect(measurementsApi.putMeasurement).not.toHaveBeenCalled()
  })

  it('says when the list could not be loaded and offers no form', async () => {
    vi.mocked(measurementsApi.listMeasurements).mockRejectedValue(new Error('offline'))
    render(<App />)
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})

describe('dated settings on Profile, signed out', () => {
  beforeEach(() => setAccount('signed-out'))

  it('keeps them in this browser and never asks the server', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addSetting(user, 'Max heart rate (ride)', '181')
    expect(await screen.findByRole('table', { name: 'Your dated settings' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
      { kind: 'maxHeartRate', sport: 'ride', value: 181, from: TODAY },
    ])
    expect(measurementsApi.listMeasurements).not.toHaveBeenCalled()
    expect(measurementsApi.putMeasurement).not.toHaveBeenCalled()
  })

  it('shows the ones kept here, and makes a dated weight the current weight', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([OLD_MASS]))
    render(<App />)
    expect(await screen.findByRole('table', { name: 'Your dated settings' })).toBeInTheDocument()
    await addSetting(user, 'Body weight', '82.5 kg')
    await waitFor(() =>
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ settings: { massKg: 82.5, bikeMassKg: 9 } }),
      ),
    )
  })

  it('reads a damaged stored list as no settings', async () => {
    localStorage.setItem(STORAGE_KEY, '{"not":"a list"}')
    render(<App />)
    expect(await screen.findByText(/No dated settings yet/)).toBeInTheDocument()
  })
})
