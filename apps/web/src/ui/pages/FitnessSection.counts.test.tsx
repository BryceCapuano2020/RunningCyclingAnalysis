// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { makeActivity } from '../components/fixtures'
import { FITNESS_AS_OF_MS, SLIPPING, waitingStatus } from '../fitnessFixtures'
import { FitnessSection } from './FitnessSection'

afterEach(cleanup)

/** Rides, the first few with a power meter and the rest ridden on the model's watts. */
function rides(measured: number, total: number): ActivitySummary[] {
  return Array.from({ length: total }, (_, i) =>
    makeActivity({
      id: `ride-${i}`,
      sport: 'ride',
      powerSource: i < measured ? 'measured' : 'virtual',
    }),
  )
}

const FEW = waitingStatus({ kind: 'history', have: 2, need: 12, weeks: 2, needWeeks: 8 }, 2, 'ride')

describe('the ride’s fitness line with too few rides measured', () => {
  it('says how many rides have a power meter, linked to the Ride page, in place of the steady count', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: FEW }}
        units="metric"
        library={rides(4, 31)}
      />,
    )
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent(/^4 of 31 rides have a power meter\. Fitness needs more\.$/)
    expect(within(line).getByRole('link')).toHaveAttribute('href', '#/ride')
  })

  it('says it plainly on the Ride page itself', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: NO_FITNESS.run, ride: FEW }}
        units="metric"
        library={rides(4, 31)}
        sport="ride"
      />,
    )
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('4 of 31 rides have a power meter. Fitness needs more.')
    expect(within(line).queryByRole('link')).toBeNull()
  })

  it('keeps the steady count where every ride has a meter, and a level where there is one to tell', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: FEW }}
        units="metric"
        library={rides(31, 31)}
      />,
    )
    expect(screen.getByTestId('ride-fitness-line')).toHaveTextContent(
      '2 steady rides with a power meter so far.',
    )
    cleanup()
    const level = waitingStatus(
      { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
      7,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: level }}
        units="metric"
        library={rides(7, 31)}
      />,
    )
    expect(screen.getByTestId('ride-fitness-line')).toHaveTextContent(
      '200 W (194 to 206) at 140 bpm. From 7 steady rides.',
    )
  })

  it('says it for a library of rides alone when some have a meter but no steady one is on file', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: NO_FITNESS.run, ride: NO_FITNESS.ride }}
        units="metric"
        library={rides(4, 31)}
        soleSport="ride"
      />,
    )
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      /^4 of 31 rides have a power meter\. Fitness needs more\.$/,
    )
    cleanup()
    // With no meter at all the line still asks for one.
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: NO_FITNESS.run, ride: NO_FITNESS.ride }}
        units="metric"
        library={rides(0, 31)}
        soleSport="ride"
      />,
    )
    expect(screen.getByTestId('fitness-lack-line')).toHaveTextContent(
      'Fitness needs power. Add rides recorded with a power meter.',
    )
  })
})
