// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiftPicker } from './LiftPicker'

const recent = [{ exercise: 'deadlift', equipment: 'barbell' as const }]

function setup(onChoose = vi.fn()) {
  const user = userEvent.setup()
  render(<LiftPicker recent={recent} onChoose={onChoose} />)
  return { user, onChoose, input: screen.getByRole('combobox', { name: 'Lift' }) }
}

afterEach(cleanup)

describe('LiftPicker', () => {
  it('lists recent lifts first when focused', async () => {
    const { user, input } = setup()
    await user.click(input)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Deadlift, barbell')
    expect(options.length).toBeGreaterThan(5)
  })

  it('filters as you type, in any case', async () => {
    const { user, input } = setup()
    await user.type(input, 'BENCH')
    const names = screen.getAllByRole('option').map((o) => o.textContent)
    expect(names).toContain('Bench press')
    expect(names).not.toContain('Deadlift, barbell')
  })

  it('offers Add with the typed name when nothing matches, and chooses its slug', async () => {
    const { user, input, onChoose } = setup()
    await user.type(input, 'Bulgarian split squat x')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Add ‘Bulgarian split squat x’')
    await user.click(options[0]!)
    expect(onChoose).toHaveBeenCalledWith({ exercise: 'bulgarian-split-squat-x' })
  })

  it('says why a name that is too long cannot be added', async () => {
    const { user, input } = setup()
    await user.type(input, 'zzq'.repeat(20))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('alert')).toHaveTextContent('48 characters or fewer')
  })

  it('chooses with the arrows and Enter, and closes with Escape', async () => {
    const { user, input, onChoose } = setup()
    await user.type(input, 'press')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChoose).toHaveBeenCalledTimes(1)
    const choice = onChoose.mock.calls[0]![0] as { exercise: string }
    expect(choice.exercise).toMatch(/press/)
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.clear(input)
    await user.type(input, 'sq')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('passes the equipment of a recent lift', async () => {
    const { user, input, onChoose } = setup()
    await user.click(input)
    await user.keyboard('{Enter}')
    expect(onChoose).toHaveBeenCalledWith({ exercise: 'deadlift', equipment: 'barbell' })
  })

  it('tells the parent when typing clears the choice', async () => {
    const onChoose = vi.fn()
    const user = userEvent.setup()
    render(<LiftPicker recent={recent} selected="deadlift" onChoose={onChoose} />)
    await user.type(screen.getByRole('combobox', { name: 'Lift' }), 'x')
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose).toHaveBeenCalledWith(null)
  })

  it('on blur keeps an exact name and otherwise reverts to the chosen lift', async () => {
    const onChoose = vi.fn()
    const user = userEvent.setup()
    render(<LiftPicker recent={[]} selected="deadlift" onChoose={onChoose} />)
    const input = screen.getByRole('combobox', { name: 'Lift' })
    await user.clear(input)
    await user.type(input, 'bench press')
    await user.tab()
    expect(onChoose).toHaveBeenLastCalledWith({ exercise: 'bench-press' })
    expect(input).toHaveValue('Bench press')
    await user.type(input, ' x')
    await user.tab()
    expect(input).toHaveValue('Deadlift')
  })

  it('moves to the first and last option with Home and End', async () => {
    const { user, input } = setup()
    await user.click(input)
    await user.keyboard('{End}')
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1]!.id)
    await user.keyboard('{Home}')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
  })
})
