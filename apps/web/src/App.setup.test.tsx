// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import {
  app,
  measurementsApi,
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
vi.mock('./api/measurements', async () => (await import('./test/appMocks')).measurementsApi)
vi.mock('./ui/charts', async () => {
  const { heavyChartStubs } = await import('./test/appMocks')
  return heavyChartStubs
})

const TITLE = 'A few details'
const SETUP_KEY = 'rca.setup.v1'

function file(name: string): File {
  return new File(['data'], name, { type: 'application/octet-stream' })
}

// The landing page has no header Add files, so its drop zone's chooser is the one on the page.
function chooseFiles(names: string[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) throw new Error('the page has no file input')
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

  it('keeps a weight typed before Skip, and still sends the held files', async () => {
    const user = userEvent.setup()
    renderSignedOut()

    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '180')
    await user.click(panel.getByRole('button', { name: 'Skip for now' }))

    expect(dialog()).not.toBeInTheDocument()
    expect(app.preferences.settings.massKg).toBeCloseTo(180 * 0.45359237, 6)
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
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

    expect(updateProfile).toHaveBeenCalledWith({ massKg: 80 })
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
    setAccount('signed-in', { units: 'metric' })
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

  it('closes on Skip even when the kept answers cannot be saved, and sends the files without marking setup done', async () => {
    const user = userEvent.setup()
    setAccount('signed-in', { units: 'metric' })
    updateProfile.mockRejectedValueOnce(new Error('Could not save your profile.'))
    render(<App />)

    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '80')
    await user.click(panel.getByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(app.analysis.addFiles).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(SETUP_KEY)).toBeNull()
  })

  it('keeps what the visitor typed when the account answers while the questions are open', () => {
    setAccount('loading')
    const view = render(<App />)
    chooseFiles(['run.fit'])
    fireEvent.change(within(dialog() as HTMLElement).getByLabelText('Body weight'), {
      target: { value: '82' },
    })

    setAccount('signed-in')
    view.rerender(<App />)

    expect(within(dialog() as HTMLElement).getByLabelText('Body weight')).toHaveValue('82')
  })

  it('starts the questions over with the new profile when the account answers while they are open', () => {
    app.preferences = {
      ...app.preferences,
      settings: { massKg: 70, bikeMassKg: 9 },
      units: 'metric',
    }
    setAccount('loading')
    const view = render(<App />)
    chooseFiles(['run.fit'])
    expect(within(dialog() as HTMLElement).getByLabelText('Body weight')).toHaveValue('70')

    // A new profile holds no weight, since none was given: the field the saved value showed is cleared.
    setAccount('signed-in')
    if (app.account.me) {
      app.account.me = {
        ...app.account.me,
        profile: { ...app.account.me.profile, massKg: null },
      }
    }
    view.rerender(<App />)

    expect(within(dialog() as HTMLElement).getByLabelText('Body weight')).toHaveValue('')
  })

  it('opens the questions at once while the account loads, and holds the files for no account', () => {
    setAccount('loading')
    render(<App />)

    chooseFiles(['run.fit'])

    expect(dialog()).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for your account/)).not.toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()
  })

  it('titles the questions "A few details" when a signed-out visitor drops files with results kept', () => {
    showResult()
    renderSignedOut()
    fireEvent.drop(window, { dataTransfer: { files: [file('ride.gpx')], types: ['Files'] } })

    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()
  })

  it('asks at once while the account is still loading, and still asks once it is signed in', () => {
    setAccount('loading')
    const view = render(<App />)

    chooseFiles(['run.fit'])
    expect(dialog()).toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()

    setAccount('signed-in')
    view.rerender(<App />)
    expect(dialog()).toBeInTheDocument()
    expect(app.analysis.addFiles).not.toHaveBeenCalled()
  })

  it('sends answers given while the account loaded once its dated settings have loaded, not before', async () => {
    const user = userEvent.setup()
    let listed: (entries: never[]) => void = () => undefined
    measurementsApi.listMeasurements.mockReturnValue(
      new Promise<never[]>((resolve) => {
        listed = resolve
      }),
    )
    setAccount('loading')
    let view: RenderResult | undefined
    setPreferences.mockImplementation((next) => {
      app.preferences = next
      view?.rerender(<App />)
    })
    view = render(<App />)
    chooseFiles(['run.fit'])
    const panel = within(dialog() as HTMLElement)
    const weight = panel.getByLabelText('Body weight')
    await user.clear(weight)
    await user.type(weight, '80 kg')
    await user.click(panel.getByRole('button', { name: 'Analyse my files' }))
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())

    // The account answers, but its dated settings are still on their way: the weight waits for them.
    setAccount('signed-in', { units: 'metric' })
    view.rerender(<App />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(updateProfile).not.toHaveBeenCalled()

    listed([])
    await waitFor(() => expect(updateProfile).toHaveBeenCalled())
    expect(updateProfile.mock.calls[0]?.[0]).toMatchObject({ massKg: 80 })
    // The answers reached the account, so the questions do not come back.
    expect(localStorage.getItem(SETUP_KEY)).toBe('1')
    expect(dialog()).not.toBeInTheDocument()
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
