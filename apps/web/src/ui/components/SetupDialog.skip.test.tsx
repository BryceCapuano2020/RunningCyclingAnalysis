// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AthleteValues } from '../profilePatch'
import { SetupDialog } from './SetupDialog'

afterEach(() => {
  cleanup()
})

const INITIAL: AthleteValues = {
  settings: { massKg: null, bikeMassKg: 9 },
  units: 'metric',
  birthYear: null,
  sex: null,
}

function renderDialog() {
  const onSkip = vi.fn()
  render(<SetupDialog initial={INITIAL} onConfirm={vi.fn()} onSkip={onSkip} />)
  return {
    onSkip,
    weight: screen.getByLabelText('Body weight'),
    year: screen.getByLabelText('Year of birth'),
    skip: screen.getByRole('button', { name: 'Skip for now' }),
  }
}

describe('SetupDialog Skip with text that is not an answer', () => {
  it('skips with nothing kept from unreadable weight and year, and clears their errors', async () => {
    const user = userEvent.setup()
    const { onSkip, weight, year, skip } = renderDialog()
    await user.type(weight, 'heavy')
    await user.type(year, '19x6')
    await user.click(skip)
    expect(onSkip).toHaveBeenCalledWith({})
    expect(weight).toHaveValue('')
    expect(year).toHaveValue('')
    expect(screen.queryByText(/Enter a/)).not.toBeInTheDocument()
  })

  it('drops the text and the errors of fields judged before the press, and keeps the valid answer', async () => {
    const user = userEvent.setup()
    const { onSkip, weight, year, skip } = renderDialog()
    await user.type(weight, '80')
    await user.type(year, 'nineteen')
    await user.tab()
    expect(screen.getByText(/Enter a year from/)).toBeInTheDocument()
    await user.click(skip)
    expect(onSkip).toHaveBeenCalledWith({ settings: { massKg: 80 } })
    expect(year).toHaveValue('')
    expect(screen.queryByText(/Enter a year from/)).not.toBeInTheDocument()
  })

  it('does not take focus off a field when it is pressed, so the field’s error cannot move it first', () => {
    const { skip } = renderDialog()
    // fireEvent returns false when the event was cancelled, which is what keeps the focus where it was.
    expect(fireEvent.mouseDown(skip)).toBe(false)
  })

  it('skips on Escape the same way', () => {
    const { onSkip, weight, year } = renderDialog()
    fireEvent.change(weight, { target: { value: 'heavy' } })
    fireEvent.change(year, { target: { value: '19x6' } })
    const dialog = screen.getByRole('dialog', { name: 'A few details' })
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onSkip).toHaveBeenCalledWith({})
  })
})
