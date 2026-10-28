// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDateOf } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { App } from './App'
import {
  app,
  measurementsApi,
  resetAppMocks,
  setAccount,
  setPreferences,
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

const TODAY = localDateOf(Date.now())
const OLD_MASS: Measurement = { kind: 'massKg', value: 90, from: '2020-01-01' }
const STORAGE_KEY = 'rca.measurements.v1'

beforeEach(() => {
  resetAppMocks()
  window.location.hash = '#/profile'
  localStorage.clear()
  measurementsApi.listMeasurements.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The field a setting's value is typed in, named by the setting and its unit: "Body weight, kg". */
const valueField = () => screen.getByLabelText(/^[A-Z][^,]*, (kg|lb|bpm|W|\/km|\/mi)$/)

async function addSetting(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.selectOptions(screen.getByLabelText('Setting'), label)
  await user.clear(valueField())
  await user.type(valueField(), value)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

describe('dated settings on Profile, signed in', () => {
  beforeEach(() => setAccount('signed-in', { units: 'metric' }))

  it('lists what the account holds, newest first within each setting', async () => {
    measurementsApi.listMeasurements.mockResolvedValue([
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
    measurementsApi.listMeasurements.mockResolvedValue([
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
    measurementsApi.listMeasurements.mockResolvedValue([OLD_MASS])
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
    measurementsApi.listMeasurements.mockResolvedValue([
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
    measurementsApi.putMeasurement.mockRejectedValueOnce(new Error('Too many settings'))
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    await addSetting(user, 'Max heart rate (run)', '190')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many settings')
    expect(valueField()).toHaveValue('190')
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

  it('shows the dated weight in effect today as the current weight, whatever the profile holds', async () => {
    measurementsApi.listMeasurements.mockResolvedValue([OLD_MASS])
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    await waitFor(() => expect(screen.getByLabelText('Body weight')).toHaveValue('90'))
  })

  it('leaves a weight dated for a later day out of the current weight until that day', async () => {
    measurementsApi.listMeasurements.mockResolvedValue([
      OLD_MASS,
      { kind: 'massKg', value: 60, from: '2099-01-01' },
    ])
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    await waitFor(() => expect(screen.getByLabelText('Body weight')).toHaveValue('90'))
  })

  it('does not save a weight while the account’s dated settings are still loading', async () => {
    const user = userEvent.setup()
    measurementsApi.listMeasurements.mockReturnValue(new Promise(() => undefined))
    render(<App />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '78{Enter}')
    expect(await screen.findByText(/dated settings are still loading/)).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('does not save a weight, or let the data be downloaded, when the dated settings did not load', async () => {
    const user = userEvent.setup()
    measurementsApi.listMeasurements.mockRejectedValue(new Error('offline'))
    render(<App />)
    await screen.findByText(/could not be loaded/)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '78{Enter}')
    expect(await screen.findByText(/Reload the page and try again/)).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Download my data' }))
    expect((await screen.findAllByText(/could not be loaded/)).length).toBeGreaterThan(1)
    expect(app.analysis.exportData).not.toHaveBeenCalled()
  })

  it('holds the download until the dated settings are known', async () => {
    const user = userEvent.setup()
    measurementsApi.listMeasurements.mockReturnValue(new Promise(() => undefined))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Download my data' }))
    expect(await screen.findByText(/dated settings are still loading/)).toBeInTheDocument()
    expect(app.analysis.exportData).not.toHaveBeenCalled()
  })

  it('says what was saved when the weight is kept but its dated copy is refused', async () => {
    const user = userEvent.setup()
    measurementsApi.listMeasurements.mockResolvedValue([OLD_MASS])
    measurementsApi.putMeasurement.mockRejectedValueOnce(new Error('Too many settings'))
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '78{Enter}')
    expect(
      await screen.findByText(/Saved as your profile weight, but not as a dated weight/),
    ).toBeInTheDocument()
    expect(updateProfile).toHaveBeenCalledWith({ massKg: 78 })
  })

  it('says when a second entry for the same day replaced the first', async () => {
    const user = userEvent.setup()
    measurementsApi.listMeasurements.mockResolvedValue([{ ...OLD_MASS, from: TODAY }])
    render(<App />)
    await screen.findByRole('table', { name: 'Your dated settings' })
    await addSetting(user, 'Body weight', '88')
    expect(await screen.findByText(/^Updated body weight from/)).toBeInTheDocument()
  })

  it('names a date that is not usable beside the date, and keeps the value', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/No dated settings yet/)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } })
    await user.type(valueField(), '80')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const date = screen.getByLabelText('From')
    expect(await screen.findByText('Pick a date from 1970 to 2100')).toBeInTheDocument()
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(date).toHaveAccessibleDescription('Pick a date from 1970 to 2100')
    expect(valueField()).toHaveValue('80')
    expect(measurementsApi.putMeasurement).not.toHaveBeenCalled()
  })

  it('tells a signed-in athlete about dated settings this browser still holds', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([OLD_MASS]))
    render(<App />)
    expect(
      await screen.findByText(/This browser also holds 1 dated setting from before you signed in/),
    ).toBeInTheDocument()
    // They are not the account's, so they are not listed or used.
    expect(screen.queryByRole('table', { name: 'Your dated settings' })).not.toBeInTheDocument()
  })

  it('says when the list could not be loaded and offers no form', async () => {
    measurementsApi.listMeasurements.mockRejectedValue(new Error('offline'))
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
