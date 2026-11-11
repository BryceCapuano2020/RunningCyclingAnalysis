// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLiftState } from '@rca/core/lift'
import { squat } from './liftFixtures'
import { bigThreeLeadOf } from './bigThreeModel'
import { resultsFor } from './liftResultsKit'
import { BigThreeLead } from './BigThreeLead'

afterEach(cleanup)

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const
const modelOf = (
  sets: Parameters<typeof buildLiftState>[0],
  profile: typeof PROFILE | null = PROFILE,
) => bigThreeLeadOf(resultsFor(sets, SETTINGS, profile), 'metric')!

describe('BigThreeLead', () => {
  it('shows the three side by side, each with its one-rep max, a bar filled to its grade, and the total', () => {
    const model = modelOf([
      squat('2031-01-02', 120),
      squat('2031-01-03', 90, { exercise: 'bench-press', equipment: 'barbell' }),
      squat('2031-01-04', 160, { exercise: 'deadlift', equipment: 'barbell' }),
    ])
    const { container } = render(<BigThreeLead model={model} />)
    expect(screen.getByRole('heading', { name: 'Big three' })).toBeInTheDocument()
    expect(screen.getByTestId('big-three-total')).toHaveTextContent(
      `${model.total!.number} kg total`,
    )
    for (const entry of model.lifts) {
      const column = screen.getByTestId(`big-three-${entry.lift}`)
      expect(column).toHaveTextContent(entry.label)
      expect(column).toHaveTextContent(entry.max!.number)
      const grade = entry.grade!.kind === 'graded' ? entry.grade!.grade.centre.grade : NaN
      const fill = column.querySelector('.big-three__fill') as HTMLElement
      expect(fill.style.width).toBe(`${Math.round(grade * 100)}%`)
    }
    expect(container.querySelectorAll('.big-three__bar[aria-hidden="true"]')).toHaveLength(3)
  })

  it('offers to log a lift not logged yet, and says what a grade needs once', () => {
    const onLog = vi.fn()
    render(<BigThreeLead model={modelOf([squat('2031-01-02', 120)], null)} onLog={onLog} />)
    expect(screen.queryByTestId('big-three-total')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Log a bench' }))
    expect(onLog).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Log a deadlift' })).toBeInTheDocument()
    expect(screen.getAllByText(/Age grades need your year of birth and sex/)).toHaveLength(1)
  })
})
