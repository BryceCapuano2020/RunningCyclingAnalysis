// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '@rca/core/units'
import type { WeightSettings } from '../athlete'
import { WEIGHT_PURPOSE } from '../weightCopy'
import { SettingsBar } from './SettingsBar'

afterEach(() => {
  cleanup()
})

const SETTINGS: WeightSettings = { massKg: 80, bikeMassKg: 9 }
const UNSET: WeightSettings = { massKg: null, bikeMassKg: 9 }
const SAVED = 'Saved. Balance and ride results now use this.'
const NUMBER_ERROR = 'Enter a number, such as 75 or 165.5'

function renderBar(units: UnitSystem = 'metric', settings: WeightSettings = SETTINGS) {
  const onChange = vi.fn()
  render(<SettingsBar settings={settings} units={units} onChange={onChange} />)
  return {
    onChange,
    body: screen.getByLabelText('Body weight'),
    bike: screen.getByLabelText('Bike and gear weight'),
  }
}

/** Holds settings in state, so a committed value is shown back as the real app would. */
function Harness({ initial, units }: { initial: WeightSettings; units: UnitSystem }) {
  const [settings, setSettings] = useState(initial)
  return (
    <SettingsBar
      settings={settings}
      units={units}
      onChange={(change) => setSettings((current) => ({ ...current, ...change }))}
    />
  )
}

describe('SettingsBar', () => {
  it('shows 75 kg as 165.3 lb', () => {
    render(
      <SettingsBar settings={{ massKg: 75, bikeMassKg: 9 }} units="imperial" onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Body weight')).toHaveValue('165.3')
  })

  it('keeps a whole-pound value as typed, without a decimal', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ massKg: 80, bikeMassKg: 9 }} units="imperial" />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '165')
    await user.tab()
    expect(body).toHaveValue('165')
  })

  it('places the unit inside the input area', () => {
    renderBar('metric')
    expect(screen.getByLabelText('Body weight').parentElement).toHaveTextContent('kg')
  })

  it('shows both weights in kilograms with a kg suffix for metric', () => {
    const { body, bike } = renderBar('metric')
    expect(body).toHaveValue('80')
    expect(bike).toHaveValue('9')
    expect(screen.getAllByText('kg')).toHaveLength(2)
  })

  it('converts both weights to pounds for imperial', () => {
    const { body, bike } = renderBar('imperial')
    expect(body).toHaveValue('176.4')
    expect(bike).toHaveValue('19.8')
    expect(screen.getAllByText('lb')).toHaveLength(2)
  })

  it('says what the body weight drives', () => {
    renderBar()
    expect(
      screen.getByText(
        'Your body weight sets ride W/kg and the balance. Bike and gear weight is used for power on climbs.',
      ),
    ).toBeInTheDocument()
  })

  it('shows no body weight as a blank field, and says what adding one is for', () => {
    const { body } = renderBar('metric', UNSET)
    expect(body).toHaveValue('')
    expect(screen.getByText(`Not entered. Add your weight ${WEIGHT_PURPOSE}`)).toBeInTheDocument()
  })

  it('does not commit on each keystroke, only on blur', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '75')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ massKg: 75 })
  })

  it('commits on Enter', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '72.5{Enter}')
    expect(onChange).toHaveBeenCalledWith({ massKg: 72.5 })
  })

  it('does not commit a second time when blurred after Enter', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '72.5{Enter}')
    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('commits the bike weight to its own field', async () => {
    const user = userEvent.setup()
    const { bike, onChange } = renderBar()
    await user.clear(bike)
    await user.type(bike, '8.5')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ bikeMassKg: 8.5 })
  })

  it('converts typed pounds to kilograms for imperial', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('imperial')
    await user.clear(body)
    await user.type(body, '170')
    await user.tab()
    const [next] = onChange.mock.calls[0] as [Partial<WeightSettings>]
    expect(next.massKg).toBeCloseTo(170 * 0.45359237, 6)
    expect(next).not.toHaveProperty('bikeMassKg')
  })

  it('accepts a decimal comma and a unit typed after the number', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric')
    await user.clear(body)
    await user.type(body, '75,5')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ massKg: 75.5 })
  })

  it('sets a body weight that was not entered', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric', UNSET)
    await user.type(body, '70')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ massKg: 70 })
  })

  it('does not call onChange when focus leaves an unchanged field', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.click(body)
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the text typed with its error until it is corrected, and does not save it', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, 'heavy')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent(NUMBER_ERROR)
    expect(body).toHaveValue('heavy')
    expect(body).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not save a blank body weight once one is set', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent(NUMBER_ERROR)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects a body weight above 200 kg, and keeps the text', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric')
    await user.clear(body)
    await user.type(body, '250')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')
    expect(body).toHaveValue('250')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects a body weight below 30 kg', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric')
    await user.clear(body)
    await user.type(body, '20')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects a bike weight outside 3 to 30 kg, and keeps the text', async () => {
    const user = userEvent.setup()
    const { bike, onChange } = renderBar('metric')
    await user.clear(bike)
    await user.type(bike, '40')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 3 to 30 kg')
    expect(bike).toHaveValue('40')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('states the limits in pounds for imperial, inside the kilogram limits', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('imperial')
    await user.clear(body)
    await user.type(body, '50')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 67 to 440 lb')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears the error when the user starts typing again', async () => {
    const user = userEvent.setup()
    const { body } = renderBar()
    await user.clear(body)
    await user.type(body, 'x')
    await user.tab()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(body)
    await user.type(body, '7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says it is saving, then saved, when the change is stored', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => undefined
    const onChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<SettingsBar settings={SETTINGS} units="metric" onChange={onChange} />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '76')
    await user.tab()
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
    finish()
    expect(await screen.findByText(SAVED)).toBeInTheDocument()
  })

  it('keeps the typed weight, and says so, when the change cannot be stored', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn(() => Promise.reject(new Error('offline')))
    render(<SettingsBar settings={SETTINGS} units="metric" onChange={onChange} />)
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '76')
    await user.tab()
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    expect(body).toHaveValue('76')
  })

  it('keeps the status line mounted, so it can announce each change', () => {
    renderBar()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})

describe('SettingsBar: a body weight outside 45 to 160 kg', () => {
  it('is not saved when the field is left, and asks to be saved as typed', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '34')
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('That is 34.0 kg, outside 45 to 160 kg.')
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toBeInTheDocument()
  })

  it('saves it once the athlete chooses to save it', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '34')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save 34.0 kg' }))
    expect(onChange).toHaveBeenCalledWith({ massKg: 34 })
  })

  it('drops the question when the weight is typed again', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '34')
    await user.tab()
    await user.click(body)
    await user.type(body, '5')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save 34.0 kg' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('saves a weight in 45 to 160 kg at once, as before', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '70')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ massKg: 70 })
  })

  it('keeps the save control, with the reason, when the save is refused', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    onChange.mockRejectedValueOnce(new Error('offline'))
    await user.clear(body)
    await user.type(body, '34')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Save 34.0 kg' }))
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save. Try again.")
    expect(screen.getByRole('alert')).toHaveTextContent('That is 34.0 kg, outside 45 to 160 kg.')
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toBeInTheDocument()
  })

  it('shows the question and its save control only once the field is left', async () => {
    const user = userEvent.setup()
    const { body } = renderBar()
    await user.clear(body)
    await user.type(body, '34')
    expect(body).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Save 34.0 kg' })).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toBeInTheDocument()
  })

  it('moves focus to the save control when Tab leaves the body weight for the bike weight', async () => {
    const user = userEvent.setup()
    const { body } = renderBar()
    await user.clear(body)
    await user.type(body, '34')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toHaveFocus()
  })

  it('never shows the save control while pounds are typed, however the figure builds up', async () => {
    const user = userEvent.setup()
    const { body } = renderBar('imperial')
    await user.clear(body)
    for (const digit of ['1', '8', '0']) {
      await user.type(body, digit)
      expect(screen.queryByRole('button', { name: /^Save / })).not.toBeInTheDocument()
    }
  })

  it('does not take focus when the field is left for a control outside the bar', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SettingsBar settings={SETTINGS} units="metric" onChange={vi.fn()} />
        <button type="button">Outside</button>
      </>,
    )
    const body = screen.getByLabelText('Body weight')
    await user.clear(body)
    await user.type(body, '34')
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
  })

  it('does not take focus when the field is left with no control to move to', () => {
    const { body } = renderBar()
    body.focus()
    fireEvent.change(body, { target: { value: '34' } })
    fireEvent.blur(body)
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).not.toHaveFocus()
  })

  it('drops a question about pounds when the units switch, with its save control', () => {
    const onChange = vi.fn()
    const view = render(<SettingsBar settings={SETTINGS} units="imperial" onChange={onChange} />)
    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '75' } })
    fireEvent.blur(body)
    expect(screen.getByRole('alert')).toHaveTextContent('75 lb is 34.0 kg, outside 45 to 160 kg.')
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toBeInTheDocument()

    view.rerender(<SettingsBar settings={SETTINGS} units="metric" onChange={onChange} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('quotes a pound figure as typed when the field is in pounds', async () => {
    const user = userEvent.setup()
    renderBar('imperial')
    await user.clear(screen.getByLabelText('Body weight'))
    await user.type(screen.getByLabelText('Body weight'), '75')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('75 lb is 34.0 kg, outside 45 to 160 kg.')
    expect(screen.getByRole('button', { name: 'Save 34.0 kg' })).toBeInTheDocument()
  })
})

describe('SettingsBar units agree with what is saved', () => {
  it('saves a metric entry as kilograms, unconverted, under a kg label', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric')
    expect(screen.getByLabelText('Body weight').parentElement).toHaveTextContent('kg')
    await user.clear(body)
    await user.type(body, '82')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith({ massKg: 82 })
  })

  it('saves an imperial entry as kilograms, converted, under an lb label', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('imperial')
    expect(screen.getByLabelText('Body weight').parentElement).toHaveTextContent('lb')
    await user.clear(body)
    await user.type(body, '185')
    await user.tab()
    const [change] = onChange.mock.calls[0] as [Partial<WeightSettings>]
    expect(change.massKg).toBeCloseTo(185 * 0.45359237, 6)
  })
})
