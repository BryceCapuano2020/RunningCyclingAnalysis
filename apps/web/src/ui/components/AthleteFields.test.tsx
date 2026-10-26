// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sex } from '@rca/contract'
import { AthleteFields } from './AthleteFields'

afterEach(() => {
  cleanup()
})

const HINT =
  'Used only to grade your results by age. Standards differ for women and men, so without sex no level is shown.'

/** Holds the year and sex in state, as the callers do, so a choice is shown back. */
function Harness({
  initialSex = null,
  onSexChange = vi.fn(),
}: {
  initialSex?: Sex | null
  onSexChange?: (sex: Sex | null) => void
}) {
  const [sex, setSex] = useState<Sex | null>(initialSex)
  const [year, setYear] = useState('')
  return (
    <AthleteFields
      birthYear={year}
      sex={sex}
      onBirthYearChange={setYear}
      onSexChange={(next) => {
        setSex(next)
        onSexChange(next)
      }}
    />
  )
}

describe('AthleteFields', () => {
  it('groups the year and sex as an optional level', () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: 'Your level (optional)' })
    expect(within(group).getByLabelText('Year of birth')).toBeInTheDocument()
    expect(within(group).getByRole('group', { name: 'Sex' })).toBeInTheDocument()
  })

  it('asks for the year with the birth-year autocomplete and a numeric keyboard', () => {
    render(<Harness />)
    const year = screen.getByLabelText('Year of birth')
    expect(year).toHaveAttribute('autocomplete', 'bday-year')
    expect(year).toHaveAttribute('inputmode', 'numeric')
  })

  it('says what the optional level is for, once, under the sex choice', () => {
    render(<Harness />)
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(screen.getByLabelText('Year of birth')).toHaveAccessibleDescription(HINT)
  })

  it('checks no sex until one is chosen', () => {
    render(<Harness />)
    const sex = screen.getByRole('group', { name: 'Sex' })
    expect(within(sex).queryAllByRole('radio', { checked: true })).toHaveLength(0)
  })

  it('checks the sex saved', () => {
    render(<Harness initialSex="female" />)
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked()
  })

  it('reports the sex chosen', async () => {
    const user = userEvent.setup()
    const onSexChange = vi.fn()
    render(<Harness onSexChange={onSexChange} />)
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    expect(onSexChange).toHaveBeenLastCalledWith('male')
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
  })

  it('shows Prefer not to say as chosen, and reports it as no sex', async () => {
    const user = userEvent.setup()
    const onSexChange = vi.fn()
    render(<Harness initialSex="female" onSexChange={onSexChange} />)
    await user.click(screen.getByRole('radio', { name: 'Prefer not to say' }))
    expect(onSexChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Female' })).not.toBeChecked()
  })
})
