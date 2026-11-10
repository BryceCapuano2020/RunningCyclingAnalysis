// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LiftGrade } from '@rca/core/lift'
import { risingSquats } from './liftFixtures'
import { liftOverviewOf } from './liftEntries'
import type { LiftLead as Lead } from './liftEntries'
import { LiftLead } from './LiftLead'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const lead = (grade?: LiftGrade | null, change?: Lead['change']): Lead => ({
  ...liftOverviewOf(
    risingSquats(),
    SETTINGS,
    { birthYear: 1990, sex: 'male' },
    'metric',
    '2031-03-02',
  ).lead!,
  ...(grade !== undefined && { grade }),
  ...(change !== undefined && { change }),
})

describe('LiftLead', () => {
  it('shows the max with its range, the floor with its date, the change and the level', () => {
    const model = lead()
    render(<LiftLead lead={model} units="metric" />)
    expect(screen.getByRole('heading', { name: 'Back squat, barbell' })).toBeInTheDocument()
    const max = screen.getByTestId('lift-max')
    expect(within(max).getByText('One-rep max')).toBeInTheDocument()
    expect(max).toHaveTextContent(/to .* kg/)
    expect(screen.getByTestId('lift-floor')).toHaveTextContent(`× ${model.floor.reps}`)
    expect(screen.getByTestId('lift-floor')).toHaveTextContent(model.floorDate)
    expect(screen.getByTestId('lift-change')).toHaveTextContent('Change on the 8 weeks before')
    expect(screen.getByTestId('lift-level')).toHaveTextContent(/%/)
  })

  it('says no clear change when a period has no estimate, and names up or down as core gave it', () => {
    const { rerender } = render(<LiftLead lead={lead(null, null)} units="metric" />)
    expect(screen.getByTestId('lift-change')).toHaveTextContent('no clear change')
    rerender(<LiftLead lead={lead(null, 'up')} units="metric" />)
    expect(screen.getByTestId('lift-change')).toHaveTextContent('up')
    expect(screen.queryByTestId('lift-level')).toBeNull()
  })

  it('asks for what the grade needs, and says nothing where it has no grade to give', () => {
    const { rerender } = render(
      <LiftLead lead={lead({ kind: 'gap', why: 'no-profile' })} units="metric" />,
    )
    expect(screen.getByTestId('lift-level')).toHaveTextContent('year of birth and sex')
    rerender(<LiftLead lead={lead({ kind: 'gap', why: 'no-mass' })} units="metric" />)
    expect(screen.getByTestId('lift-level')).toHaveTextContent('weight')
    rerender(<LiftLead lead={lead({ kind: 'gap', why: 'out-of-range' })} units="metric" />)
    expect(screen.queryByTestId('lift-level')).toBeNull()
  })
})
