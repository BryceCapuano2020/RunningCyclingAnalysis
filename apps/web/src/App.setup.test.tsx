// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import {
  app,
  resetAppMocks,
  setAccount,
  setPreferences,
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

const TITLE = 'Before your first analysis'
const RETURNING_TITLE = 'A few details'
const SETUP_KEY = 'rca.setup.v1'

function file(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

function chooseFiles(names: string[]) {
  const input = document.querySelector<HTMLInputElement>('header input[type="file"]')
  if (input === null) throw new Error('the header has no file input')
  fireEvent.change(input, { target: { files: names.map(file) } })
}

function dialog() {
  return screen.queryByRole('dialog', { name: TITLE })
}

/** Signed out, where saving the preferences re-renders the app, as the real preferences hook does. */
function renderSignedOut(): RenderResult {
  setAccount('signed-out')
  let view: RenderResult | undefined
  setPreferences.mockImplementation((next) => {
    app.preferences = next
    view?.rerender(<App />)
  })
  view = render(<App />)
  return view
}

beforeEach(() => {
  localStorage.clear()
  resetAppMocks()
  vi.mocked(app.analysis.addFiles).mockClear()
})

afterEach(() => {
  cleanup()
})

describe('setup before the first import, signed out', () => {
  it('asks once, then sends the held files with the entered weight, and never asks again', async () => {
    const user = userEvent.setup()
    renderSignedOut()

    chooseFiles(['run.fit'])
    expect(dialog()).toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()

    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '180')
    await user.click(panel.getByRole('button', { name: 'Analyse my files' }))

    expect(dialog()).not.toBeInTheDocument()
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
    const [sent] = vi.mocked(app.analysis.addFiles).mock.calls[0] as [File[]]
    expect(sent.map((held) => held.name)).toEqual(['run.fit'])
    expect(app.preferences.settings.massKg).toBeCloseTo(180 * 0.45359237, 6)

    chooseFiles(['ride.gpx'])
    expect(dialog()).not.toBeInTheDocument()
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(2)
  })

  it('holds a file dropped on the page as well, and sends it after Skip', async () => {
    const user = userEvent.setup()
    renderSignedOut()

    fireEvent.drop(window, { dataTransfer: { files: [file('ride.gpx')], types: ['Files'] } })
    expect(dialog()).toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()

    await user.click(within(dialog() as HTMLElement).getByRole('button', { name: 'Skip for now' }))
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
    const [sent] = vi.mocked(app.analysis.addFiles).mock.calls[0] as [File[]]
    expect(sent.map((held) => held.name)).toEqual(['ride.gpx'])
  })

  it('does not ask for the sample', async () => {
    const user = userEvent.setup()
    setAccount('signed-out')
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'See a sample athlete' }))

    expect(app.analysis.loadSample).toHaveBeenCalledOnce()
    expect(dialog()).not.toBeInTheDocument()
  })
})

describe('setup before the first import, signed in', () => {
  it('asks on a new device, saves the changed weight, records the device, and sends the files', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    render(<App />)

    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '80')
    await user.click(panel.getByRole('button', { name: 'Analyse my files' }))

    expect(updateProfile).toHaveBeenCalledWith({ massKg: 80, bikeMassKg: 9 })
    await waitFor(() => expect(app.analysis.addFiles).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(SETUP_KEY)).toBe('1')
    expect(dialog()).not.toBeInTheDocument()
  })

  it('also writes the answers to the saved preferences, so signing out does not ask again', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    render(<App />)

    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '80')
    await user.click(panel.getByRole('button', { name: 'Analyse my files' }))

    await waitFor(() =>
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { massKg: 80, bikeMassKg: 9 },
          units: 'metric',
          setupDone: true,
        }),
      ),
    )
  })

  it('keeps the files and the dialog open, and says why, when the answers cannot be saved', async () => {
    const user = userEvent.setup()
    setAccount('signed-in')
    updateProfile.mockRejectedValueOnce(new Error('Could not save your profile.'))
    render(<App />)

    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    await user.clear(panel.getByLabelText('Body weight'))
    await user.type(panel.getByLabelText('Body weight'), '80')
    await user.click(panel.getByRole('button', { name: 'Analyse my files' }))

    await waitFor(() =>
      expect(within(dialog() as HTMLElement).getByRole('alert')).toHaveTextContent(
        'Could not save your profile.',
      ),
    )
    expect(app.analysis.addFiles).not.toHaveBeenCalled()
    expect(localStorage.getItem(SETUP_KEY)).toBeNull()
    expect(within(dialog() as HTMLElement).getByLabelText('Body weight')).toHaveValue('80')
  })

  it('says the import waits for the account while the account loads, and clears it once known', () => {
    setAccount('loading')
    const view = render(<App />)

    chooseFiles(['run.fit'])
    expect(
      screen.getByText('Waiting for your account…', { selector: '.import-status__text' }),
    ).toBeVisible()
    expect(
      screen.getByText('Waiting for your account…', { selector: '.sr-only' }),
    ).toBeInTheDocument()

    setAccount('signed-in')
    view.rerender(<App />)
    expect(
      screen.queryByText('Waiting for your account…', { selector: '.import-status__text' }),
    ).not.toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
  })

  it('titles the questions "A few details" for a returning signed-out visitor with kept results', () => {
    showResult()
    renderSignedOut()
    fireEvent.drop(window, { dataTransfer: { files: [file('ride.gpx')], types: ['Files'] } })

    expect(screen.getByRole('dialog', { name: RETURNING_TITLE })).toBeInTheDocument()
    expect(dialog()).not.toBeInTheDocument()
  })

  it('does not ask while the account is still loading, then asks once it is known', () => {
    setAccount('loading')
    const view = render(<App />)

    chooseFiles(['run.fit'])
    expect(dialog()).not.toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()

    setAccount('signed-in')
    view.rerender(<App />)
    expect(dialog()).toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()
  })

  it('sends a file without asking when the worker has stopped for good', () => {
    setAccount('signed-out')
    app.analysis.workerStopped = true
    render(<App />)

    chooseFiles(['run.fit'])

    expect(dialog()).not.toBeInTheDocument()
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
  })

  it('does not ask again once answered on this device', () => {
    localStorage.setItem(SETUP_KEY, '1')
    setAccount('signed-in')
    render(<App />)

    chooseFiles(['run.fit'])

    expect(dialog()).not.toBeInTheDocument()
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
  })

  it('leaves the profile alone when the dialog is skipped', async () => {
    const user = userEvent.setup()
    setAccount('signed-in')
    render(<App />)

    chooseFiles(['run.fit'])
    await user.click(within(dialog() as HTMLElement).getByRole('button', { name: 'Skip for now' }))

    expect(updateProfile).not.toHaveBeenCalled()
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(localStorage.getItem(SETUP_KEY)).toBe('1'))
  })
})
