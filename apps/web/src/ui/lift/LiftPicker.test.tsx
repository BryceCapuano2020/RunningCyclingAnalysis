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
})
