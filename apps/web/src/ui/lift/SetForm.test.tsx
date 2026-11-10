// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SetForm } from './SetForm'
import type { SetFormProps } from './SetForm'

function setup(props: Partial<SetFormProps> = {}) {
  const onSave = vi.fn()
  const user = userEvent.setup()
  render(
    <SetForm
      exercise="back-squat"
      date="2030-03-04"
      setOrder={2}
      units="metric"
      onSave={onSave}
      onDone={() => undefined}
      now={() => new Date(2030, 2, 4, 7, 5)}
      {...props}
    />,
  )
  return { user, onSave }
}

const field = (name: string) => screen.getByRole('textbox', { name })

afterEach(cleanup)

describe('SetForm', () => {
  it('saves a valid set through core and keeps the values', async () => {
    const { user, onSave } = setup()
    await user.type(field('Reps'), '5')
    await user.type(field('Load'), '102,5')
    await user.selectOptions(screen.getByLabelText('Effort (RPE)'), '8.5')
    await user.click(screen.getByRole('checkbox', { name: 'Warm-up' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({
      date: '2030-03-04',
      exercise: 'back-squat',
      equipment: 'barbell',
      setOrder: 2,
      reps: 5,
      loadKg: 102.5,
      rpe: 8.5,
      warmup: true,
      time: '07:05',
      timePrecision: 'set',
    })
    expect(field('Reps')).toHaveValue('5')
    expect(screen.getByLabelText('Effort (RPE)')).toHaveValue('8.5')
  })

  it('offers Not rated, then 6 to 10 in halves, right after Load', () => {
    setup()
    const options = Array.from(screen.getByLabelText<HTMLSelectElement>('Effort (RPE)').options)
    expect(options.map((o) => o.value)).toEqual([
      '',
      '6',
      '6.5',
      '7',
      '7.5',
      '8',
      '8.5',
      '9',
      '9.5',
      '10',
    ])
    expect(options[0]).toHaveTextContent('Not rated')
    const labels = screen
      .getAllByText(/^(Equipment|Reps|Load|Effort \(RPE\))$/)
      .map((n) => n.textContent)
    expect(labels).toEqual(['Equipment', 'Reps', 'Load', 'Effort (RPE)'])
  })

  it('starts effort from the initial value', () => {
    setup({ initial: { rpe: 9, reps: 3, loadKg: 60 } })
    expect(screen.getByLabelText('Effort (RPE)')).toHaveValue('9')
  })

  it('shows each error with its bound and does not save', async () => {
    const { user, onSave } = setup()
    const save = screen.getByRole('button', { name: 'Save' })
    await user.type(field('Reps'), '101')
    await user.type(field('Load'), '1000.5')
    await user.click(save)
    expect(screen.getByText('Enter whole reps from 1 to 100')).toBeInTheDocument()
    expect(screen.getByText('Enter a load from 0 to 1000 kg')).toBeInTheDocument()
    await user.clear(field('Reps'))
    await user.type(field('Reps'), '0')
    await user.clear(field('Load'))
    await user.type(field('Load'), '-1')
    await user.click(save)
    expect(screen.getByText('Enter whole reps from 1 to 100')).toBeInTheDocument()
    expect(screen.getByText('Enter a load from 0 to 1000 kg')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('converts pounds to kilograms to 0.01', async () => {
    const { user, onSave } = setup({ units: 'imperial' })
    await user.type(field('Reps'), '3')
    await user.type(field('Load'), '225')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0].loadKg).toBe(102.06)
  })

  it('bounds the load in pounds when imperial', async () => {
    const { user } = setup({ units: 'imperial' })
    await user.type(field('Reps'), '3')
    await user.type(field('Load'), '2300')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a load from 0 to 2204 lb')).toBeInTheDocument()
  })

  it('labels a bodyweight lift Added load and lets it be empty', async () => {
    const { user, onSave } = setup({ exercise: 'pull-up' })
    expect(field('Added load')).toBeInTheDocument()
    await user.type(field('Reps'), '8')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ equipment: 'bodyweight', loadKg: 0, reps: 8 })
  })

  it('keeps the original time of an edited set', async () => {
    const { user, onSave } = setup({
      initial: { reps: 5, loadKg: 60, time: '18:30', timePrecision: 'session' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ time: '18:30', timePrecision: 'session' })
  })

  it('moves an off-grid initial effort to the nearest half and drops one out of range', () => {
    const { unmount } = render(
      <SetForm
        exercise="deadlift"
        date="2030-03-04"
        setOrder={1}
        units="metric"
        initial={{ rpe: 8.25 }}
        onSave={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Effort (RPE)')).toHaveValue('8.5')
    unmount()
    render(
      <SetForm
        exercise="deadlift"
        date="2030-03-04"
        setOrder={1}
        units="metric"
        initial={{ rpe: 3 }}
        onSave={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Effort (RPE)')).toHaveValue('')
  })

  it('refuses 1,000 as a load rather than reading 1', async () => {
    const { user, onSave } = setup()
    await user.type(field('Reps'), '3')
    await user.type(field('Load'), '1,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a load from 0 to 1000 kg')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows a form-level error when core refuses what the fields do not show', async () => {
    const { user, onSave } = setup({ date: 'not-a-date' })
    await user.type(field('Reps'), '3')
    await user.type(field('Load'), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This set cannot be saved')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('starts over when the lift changes', async () => {
    const props = {
      date: '2030-03-04',
      setOrder: 1,
      units: 'metric' as const,
      onSave: vi.fn(),
      onDone: vi.fn(),
    }
    const { rerender } = render(<SetForm exercise="back-squat" {...props} />)
    await userEvent.type(field('Reps'), '5')
    rerender(<SetForm exercise="pull-up" {...props} />)
    expect(field('Reps')).toHaveValue('')
    expect(screen.getByLabelText('Equipment')).toHaveValue('bodyweight')
  })

  it('shows Delete only when editing, and it calls onDelete', async () => {
    const { unmount } = render(
      <SetForm
        exercise="deadlift"
        date="2030-03-04"
        setOrder={1}
        units="metric"
        onSave={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    unmount()
    const onDelete = vi.fn()
    render(
      <SetForm
        exercise="deadlift"
        date="2030-03-04"
        setOrder={1}
        units="metric"
        onSave={vi.fn()}
        onDelete={onDelete}
        onDone={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
