// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AthleteValues } from '../profilePatch'
import { WEIGHT_PROMPT_TEXT } from '../weightCopy'
import { SetupDialog } from './SetupDialog'
import type { SetupDialogProps } from './SetupDialog'

afterEach(() => {
  cleanup()
})

const TITLE = 'Before your first analysis'
const NUMBER_ERROR = 'Enter a number, such as 75 or 165.5'
const SKIP_NOTE = WEIGHT_PROMPT_TEXT
const INITIAL: AthleteValues = {
  settings: { massKg: 75, bikeMassKg: 9 },
  units: 'metric',
  birthYear: null,
  sex: null,
}
const UNSET: AthleteValues = { ...INITIAL, settings: { massKg: null, bikeMassKg: 9 } }

function renderDialog(
  initial: AthleteValues = INITIAL,
  extra: Partial<Pick<SetupDialogProps, 'saving' | 'error'>> = {},
) {
  const onConfirm = vi.fn()
  const onSkip = vi.fn()
  render(<SetupDialog initial={initial} onConfirm={onConfirm} onSkip={onSkip} {...extra} />)
  return { onConfirm, onSkip, dialog: screen.getByRole('dialog', { name: TITLE }) }
}

function weight() {
  return screen.getByLabelText('Body weight')
}

function year() {
  return screen.getByLabelText('Year of birth')
}

describe('SetupDialog', () => {
  it('is a dialog headed "Before your first analysis", with the help line', () => {
    renderDialog()
    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your weight puts rides and runs on one scale. Age and sex are optional: they set your level in each sport. They stay on this device unless you sign in.',
      ),
    ).toBeInTheDocument()
  })

  it('is headed "A few details" for a returning visitor whose results are kept here', () => {
    render(<SetupDialog initial={INITIAL} onConfirm={vi.fn()} onSkip={vi.fn()} returning />)
    expect(screen.getByRole('dialog', { name: 'A few details' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'A few details' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument()
  })

  it('asks for units, body weight, year of birth and sex', () => {
    renderDialog()
    expect(weight()).toHaveValue('75')
    expect(screen.getByText('kg', { selector: '.number-field__unit' })).toBeInTheDocument()
    const units = screen.getByRole('group', { name: 'Units' })
    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked()
    expect(year()).toHaveAttribute('inputmode', 'numeric')
    expect(year()).toHaveAttribute('autocomplete', 'bday-year')
    const sex = screen.getByRole('group', { name: 'Sex' })
    expect(within(sex).queryAllByRole('radio', { checked: true })).toHaveLength(0)
  })

  it('puts the units before the body weight', () => {
    renderDialog()
    const units = screen.getByRole('group', { name: 'Units' })
    expect(units.compareDocumentPosition(weight()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the weight in the units it was saved in', () => {
    renderDialog({ ...INITIAL, units: 'imperial' })
    expect(weight()).toHaveValue('165.3')
    expect(screen.getByRole('group', { name: 'Units' })).toBeInTheDocument()
  })

  it('leaves the weight blank when none has been entered, and confirms without one', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog(UNSET)
    expect(weight()).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({})
  })

  it('shows the note about a missing weight only while none is entered', () => {
    renderDialog(UNSET)
    expect(screen.getByText(SKIP_NOTE)).toBeInTheDocument()
  })

  it('does not say a weight waits when one is entered', () => {
    renderDialog()
    expect(screen.queryByText(SKIP_NOTE)).not.toBeInTheDocument()
  })

  it('shows the kilograms the imperial weight is stored as', () => {
    renderDialog({ ...INITIAL, units: 'imperial' })
    expect(screen.getByText('Stored as 75 kg')).toBeInTheDocument()
  })

  it('offers Analyse my files as the primary button and Skip for now as the other', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Analyse my files' })).toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: 'Skip for now' })).toHaveClass('btn')
    expect(screen.getByRole('button', { name: 'Skip for now' })).not.toHaveClass('btn-primary')
  })

  it('opens with the heading focused, so a phone does not raise the keyboard first', () => {
    renderDialog()
    expect(screen.getByRole('heading', { level: 2, name: TITLE })).toHaveFocus()
  })

  it('confirms with an empty patch when nothing was changed', async () => {
    const user = userEvent.setup()
    const { onConfirm, onSkip } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({})
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('sends only the body weight that changed', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), '82.5')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ settings: { massKg: 82.5 } })
  })

  it('sends the weight entered when none was saved before', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog(UNSET)
    await user.type(weight(), '70')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ settings: { massKg: 70 } })
  })

  it('accepts a decimal comma in the weight', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), '75,5')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ settings: { massKg: 75.5 } })
  })

  it('takes a pound unit typed after the weight, even in metric', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), '150 lb')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    const [patch] = onConfirm.mock.calls[0] as [{ settings: { massKg: number } }]
    expect(patch.settings.massKg).toBeCloseTo(150 * 0.45359237, 6)
  })

  it('converts a typed weight from pounds when the units are imperial', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, units: 'imperial' })
    await user.clear(weight())
    await user.type(weight(), '170')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    const [patch] = onConfirm.mock.calls[0] as [{ settings: { massKg: number } }]
    expect(patch.settings.massKg).toBeCloseTo(170 * 0.45359237, 6)
  })

  it('keeps the same weight when the units are switched and back, without a change', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, settings: { massKg: 80.4, bikeMassKg: 9 } })
    await user.click(screen.getByRole('radio', { name: 'Imperial' }))
    await user.click(screen.getByRole('radio', { name: 'Metric' }))
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({})
  })

  it('sends the units chosen, and converts the weight already typed to them', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(weight()).toHaveValue('165.3')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ units: 'imperial' })
  })

  it('rejects text in the weight, shows the error, and does not confirm', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), 'heavy')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent(NUMBER_ERROR)
    expect(weight()).toHaveAttribute('aria-invalid', 'true')
    expect(weight()).toHaveFocus()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not accept a blank weight once one is saved, and says why', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent(NUMBER_ERROR)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps the weight as typed, to the kilogram, when units switch and it is saved', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, units: 'imperial' })
    await user.clear(weight())
    await user.type(weight(), '165')
    await user.click(screen.getByRole('radio', { name: 'Metric' }))
    expect(weight()).toHaveValue('74.8')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    const [patch] = onConfirm.mock.calls[0] as [{ settings: { massKg: number } }]
    expect(patch.settings.massKg).toBeCloseTo(165 * 0.45359237, 3)
  })

  it('clears a weight error that the new units make valid', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.clear(weight())
    await user.type(weight(), '250')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')

    await user.click(screen.getByRole('radio', { name: 'Imperial' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(weight()).not.toHaveAttribute('aria-invalid')
  })

  it('states the limits in the new units when a weight is still wrong after a switch', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.clear(weight())
    await user.type(weight(), '20')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')

    await user.click(screen.getByRole('radio', { name: 'Imperial' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 67 to 440 lb')
    expect(weight()).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a body weight outside 30 to 200 kg', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), '250')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a weight from 30 to 200 kg')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('sends a year of birth typed in range', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.type(year(), '1990')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ birthYear: 1990 })
  })

  it('rejects a year outside the age range, and focuses it', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.type(year(), '1800')
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/^Enter a year from \d{4} to \d{4}$/)
    expect(year()).toHaveAttribute('aria-invalid', 'true')
    expect(year()).toHaveFocus()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clears a saved year of birth when the field is emptied', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, birthYear: 1990 })
    expect(year()).toHaveValue('1990')
    await user.clear(year())
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({ birthYear: null })
  })

  it('leaves sex unchosen until the athlete picks it', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenCalledWith({})
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).not.toBeChecked()
  })

  it('sends the sex chosen, and Prefer not to say clears a saved sex', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, sex: 'female' })
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenLastCalledWith({ sex: 'male' })
  })

  it('shows Prefer not to say as chosen, and sends it as no sex', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ ...INITIAL, sex: 'female' })
    await user.click(screen.getByRole('radio', { name: 'Prefer not to say' }))
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Analyse my files' }))
    expect(onConfirm).toHaveBeenLastCalledWith({ sex: null })
  })

  it('shows a save error as an alert, and keeps the values typed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onSkip = vi.fn()
    const view = render(<SetupDialog initial={INITIAL} onConfirm={onConfirm} onSkip={onSkip} />)
    await user.clear(weight())
    await user.type(weight(), '90')

    view.rerender(
      <SetupDialog
        initial={INITIAL}
        onConfirm={onConfirm}
        onSkip={onSkip}
        error="Your answers could not be saved."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Your answers could not be saved.')
    expect(weight()).toHaveValue('90')
  })

  it('holds both buttons and Escape while the answers are being saved', async () => {
    const user = userEvent.setup()
    const { onConfirm, onSkip, dialog } = renderDialog(INITIAL, { saving: true })
    const analyse = screen.getByRole('button', { name: 'Analyse my files' })
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    expect(analyse).toHaveAttribute('aria-disabled', 'true')
    expect(skip).toHaveAttribute('aria-disabled', 'true')

    await user.click(analyse)
    await user.click(skip)
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
    expect(cancel.defaultPrevented).toBe(true)
  })

  it('skips without applying what was typed, and does not confirm', async () => {
    const user = userEvent.setup()
    const { onConfirm, onSkip } = renderDialog()
    await user.clear(weight())
    await user.type(weight(), '90')
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('treats Escape as Skip, and keeps the browser from closing the dialog itself', () => {
    const { onSkip, onConfirm, dialog } = renderDialog()
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

/** Opens the dialog from a button, as the header's Add files does, and unmounts it on close. */
function Opener() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add files
      </button>
      {open && (
        <SetupDialog
          initial={INITIAL}
          onConfirm={() => setOpen(false)}
          onSkip={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** Mounted from outside, as a file dropped on the page opens it: nothing has focus then. */
function Dropped({ open }: { open: boolean }) {
  return (
    <>
      <h1 id="page-heading" tabIndex={-1}>
        Landing
      </h1>
      {open && <SetupDialog initial={INITIAL} onConfirm={vi.fn()} onSkip={vi.fn()} />}
    </>
  )
}

describe('SetupDialog: the account answers after the visitor has changed units', () => {
  const UNSET: AthleteValues = {
    settings: { massKg: null, bikeMassKg: 9 },
    units: 'metric',
    birthYear: null,
    sex: null,
  }
  const SAVED: AthleteValues = {
    settings: { massKg: 75, bikeMassKg: 9 },
    units: 'metric',
    birthYear: null,
    sex: null,
  }

  it('shows the saved weight in the units the visitor picked, and keeps those units', async () => {
    const user = userEvent.setup()
    const view = render(<SetupDialog initial={UNSET} onConfirm={vi.fn()} onSkip={vi.fn()} />)
    await user.click(screen.getByRole('radio', { name: 'Imperial' }))

    view.rerender(<SetupDialog initial={SAVED} onConfirm={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getByLabelText('Body weight')).toHaveValue('165.3')
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
  })
})

describe('SetupDialog focus', () => {
  it('returns focus to the control that opened it when it closes', async () => {
    const user = userEvent.setup()
    render(<Opener />)
    await user.click(screen.getByRole('button', { name: 'Add files' }))
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add files' })).toHaveFocus()
  })

  it('returns focus to the page heading when nothing had focus to return to', () => {
    const { rerender } = render(<Dropped open={false} />)
    expect(document.activeElement).toBe(document.body)
    rerender(<Dropped open />)
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument()
    rerender(<Dropped open={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Landing' })).toHaveFocus()
  })
})
