// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  FITNESS_LIBRARY,
  FITNESS_RIDE_LIBRARY,
  SLIPPING,
  waitingStatus,
} from '../fitnessFixtures'
import { FitnessSection } from './FitnessSection'
import type { FitnessSectionProps } from './FitnessSection'

afterEach(cleanup)

const BANNED = /limiter|weak|strength|holding you back|ahead of|because|caused/i

/** A card's words as read, without the notes its defined terms keep in the markup. */
function spoken(node: Element): string {
  const copy = node.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function renderSection(over: Partial<FitnessSectionProps> & { run?: typeof SLIPPING } = {}) {
  const { run = SLIPPING, ...rest } = over
  return render(
    <FitnessSection
      nowMs={FITNESS_AS_OF_MS}
      fitness={{ run, ride: NO_FITNESS.ride }}
      units="metric"
      library={FITNESS_LIBRARY}
      {...rest}
    />,
  )
}

/** A status that cannot call a trend tells its level, and what a trend needs, in place of a change. */
describe('FitnessSection for a sport that cannot call a trend', () => {
  it('tells a ride that cannot call a trend as its level on one line on the home page, linked to the Ride page, and as a card on the Ride page', () => {
    const waiting = waitingStatus(
      { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
      7,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: waiting }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('200 W at 140 bpm (194 to 206). From 7 steady rides.')
    expect(line).not.toHaveTextContent(/Ride fitness|not enough|of 12|trend/)
    expect(within(line).getByRole('link')).toHaveAttribute('href', '#/ride')
    cleanup()
    // The Ride page draws the full card, with the level and what a trend needs.
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: waiting }}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
      />,
    )
    const card = screen.getByRole('article', { name: 'No trend yet' })
    expect(spoken(card)).toContain('200 W at 140 bpm (194 to 206).')
    expect(spoken(card)).toContain('From 7 steady rides.')
    expect(screen.getByTestId('fitness-needs')).toHaveTextContent(
      '5 more earlier rides to see a trend.',
    )
    expect(screen.queryByTestId('ride-fitness-line')).toBeNull()
  })

  it('tells a ride that has too few recent rides, or whose range is too wide, as its level on the home page too', () => {
    const recent = waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }, 30, 'ride')
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: NO_FITNESS.run, ride: recent }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByTestId('ride-fitness-line')).toHaveTextContent(
      '200 W at 140 bpm (194 to 206). From 30 steady rides.',
    )
    cleanup()
    const imprecise = waitingStatus({ kind: 'imprecise', within: 0.07 }, 33, 'ride')
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: imprecise }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('200 W at 140 bpm (194 to 206). From 33 steady rides.')
    expect(line).not.toHaveTextContent(/uncertain|not enough|of \d+ /)
  })

  it('dates the level of a break on the card, and says what a trend needs', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{
          run: waitingStatus({ kind: 'break', weeksSince: 9 }, 40),
          ride: NO_FITNESS.ride,
        }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    const card = screen.getByRole('article', { name: 'No trend yet' })
    expect(spoken(card)).toContain('(4:54 to 5:13) in October.')
    expect(spoken(card)).toContain('From 40 steady runs.')
    expect(screen.getByTestId('fitness-needs')).toHaveTextContent(
      'A steady run in the last 4 weeks to see a trend.',
    )
    expect(spoken(card)).not.toMatch(BANNED)
  })

  it('is one line, and no card, for a sport with fewer than 3 steady activities: linked on the home page, plain on its own page', () => {
    const few = waitingStatus(
      { kind: 'history', have: 2, need: 12, weeks: 2, needWeeks: 8 },
      2,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: few }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByTestId('ride-fitness-line')).toHaveTextContent(
      '2 steady rides with a power meter so far.',
    )
    expect(within(screen.getByTestId('ride-fitness-line')).getByRole('link')).toHaveAttribute(
      'href',
      '#/ride',
    )
    cleanup()
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: few }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
        sport="ride"
      />,
    )
    expect(screen.queryByRole('article')).toBeNull()
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('2 steady rides with a power meter so far.')
    expect(within(line).queryByRole('link')).toBeNull()
    cleanup()
    // A run is the same: the first sport is a card with a level, and a line without one.
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{
          run: waitingStatus({ kind: 'history', have: 1, need: 12, weeks: 1, needWeeks: 8 }, 1),
          ride: NO_FITNESS.ride,
        }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByTestId('run-fitness-line')).toHaveTextContent(
      '1 steady run with heart rate so far.',
    )
  })

  it('tells a run that cannot call a trend as a card: its level, the runs behind it and what a trend needs, with no track and no evidence panel', () => {
    const { container } = renderSection({
      run: waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
    })
    expect(screen.getByRole('article', { name: 'No trend yet' })).toBeInTheDocument()
    const words = spoken(screen.getByRole('article'))
    expect(words).toContain('5:03 /km at 150 bpm (4:54 to 5:13).')
    expect(words).toContain('From 7 steady runs.')
    expect(words).toContain('5 more earlier runs to see a trend.')
    expect(words).not.toMatch(BANNED)
    expect(words).not.toMatch(/slower|faster|%/)
    // The count is the line above, not a second row of pills.
    expect(container.querySelector('.fitness-progress')).toBeNull()
    expect(container.querySelector('.fitness-track')).toBeNull()
    expect(screen.queryByText('See the evidence')).not.toBeInTheDocument()
  })

  it('defines the heart rate and the range of a level in place', () => {
    renderSection({
      run: waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
    })
    const terms = within(screen.getByRole('article'))
      .getAllByRole('button', { expanded: false })
      .map((button) => button.textContent)
    expect(terms).toEqual(['at 150 bpm', '(4:54 to 5:13)', 'steady runs'])
  })
})
