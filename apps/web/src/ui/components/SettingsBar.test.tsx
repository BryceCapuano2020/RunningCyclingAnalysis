// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SettingsBar } from './SettingsBar'

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 80, bikeMassKg: 9 }

function renderBar(units: UnitSystem = 'metric', settings: AthleteSettings = SETTINGS) {
  const onChange = vi.fn()
  render(<SettingsBar settings={settings} units={units} onChange={onChange} />)
  return {
    onChange,
    body: screen.getByLabelText('Body weight'),
    bike: screen.getByLabelText('Bike and kit weight'),
  }
}

/** Holds settings in state, so a committed value is shown back as the real app would. */
function Harness({ initial, units }: { initial: AthleteSettings; units: UnitSystem }) {
  const [settings, setSettings] = useState(initial)
  return <SettingsBar settings={settings} units={units} onChange={setSettings} />
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

  it('shows the real-figure hint', () => {
    renderBar()
    expect(
      screen.getByText('Weight changes every number on this page, so use your real figure'),
    ).toBeInTheDocument()
  })

  it('does not commit on each keystroke, only on blur', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '75')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ massKg: 75, bikeMassKg: 9 })
  })

  it('commits on Enter', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, '72.5{Enter}')
    expect(onChange).toHaveBeenCalledWith({ massKg: 72.5, bikeMassKg: 9 })
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
    expect(onChange).toHaveBeenCalledWith({ massKg: 80, bikeMassKg: 8.5 })
  })

  it('converts typed pounds to kilograms for imperial', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('imperial')
    await user.clear(body)
    await user.type(body, '170')
    await user.tab()
    const [next] = onChange.mock.calls[0] as [AthleteSettings]
    expect(next.massKg).toBeCloseTo(170 * 0.45359237, 6)
    expect(next.bikeMassKg).toBe(9)
  })

  it('does not call onChange when focus leaves an unchanged field', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.click(body)
    await user.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects text, restores the previous value and shows an inline error', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar()
    await user.clear(body)
    await user.type(body, 'heavy')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number')
    expect(body).toHaveValue('80')
    expect(body).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects a body weight above 200 kg', async () => {
    const user = userEvent.setup()
    const { body, onChange } = renderBar('metric')
    await user.clear(body)
    await user.type(body, '250')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')
    expect(body).toHaveValue('80')
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

  it('rejects a bike weight outside 3 to 30 kg', async () => {
    const user = userEvent.setup()
    const { bike, onChange } = renderBar('metric')
    await user.clear(bike)
    await user.type(bike, '40')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 3 to 30 kg')
    expect(bike).toHaveValue('9')
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
})
