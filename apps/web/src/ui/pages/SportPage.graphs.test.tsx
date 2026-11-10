// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_HISTORY } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { makeResult } from '../components/test/fixtures'
import { dotsFixture, slipAndRise } from '../test/fitnessYearsFixtures'
import { profileActivities } from '../test/profileFixtures'
import { YEARS_LOOKBACK } from '../test/yearsFixtures'
import { NO_LOOKBACK } from '@rca/core/lookback'
import { SportPage } from './SportPage'

afterEach(cleanup)

function page(sport: Sport, lookBack = YEARS_LOOKBACK, withDots = true) {
  const activities = profileActivities(sport)
  return render(
    <SportPage
      sport={sport}
      result={makeResult({ activities })}
      previous={null}
      previousLabel={null}
      change={null}
      lookBack={lookBack}
      fitnessDots={
        withDots
          ? {
              ...NO_HISTORY.fitness,
              [sport]: dotsFixture({ sport, years: [2021, 2022, 2023], spans: slipAndRise(2021) }),
            }
          : undefined
      }
      units="metric"
      massKg={75}
      weighted
      profile={null}
      missingAge={null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing."
      inLibrary={activities.length}
      library={activities}
      onAddFiles={vi.fn()}
    />,
  )
}

describe('SportPage: the History row as a graph', () => {
  it('draws the sport’s years with its slips shaded, and keeps the link to the History page', () => {
    const { container } = page('run')
    const years = screen.getByRole('region', { name: 'History' })
    expect(within(years).getByRole('figure', { name: 'History' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="fitness-span"]').length).toBeGreaterThan(0)
    expect(within(years).getByRole('link', { name: 'See History' })).toBeInTheDocument()
  })

  it('keeps the axes and the dots for a sport too short for a history, with the reason beside the link', () => {
    page('ride', {
      ...NO_LOOKBACK,
      sports: {
        ...NO_LOOKBACK.sports,
        ride: {
          ...NO_LOOKBACK.sports.ride,
          fitness: { kind: 'too-short', steady: 4, weeks: 5, needSteady: 8, needWeeks: 12 },
        },
      },
    })
    const years = screen.getByRole('region', { name: 'History' })
    expect(within(years).getByRole('figure')).toBeInTheDocument()
    expect(years).toHaveTextContent('Not enough steady rides for a fitness history. See History')
  })

  it('keeps the sentence where the library has no dots to draw', () => {
    page('run', YEARS_LOOKBACK, false)
    const years = screen.getByRole('region', { name: 'History' })
    expect(within(years).queryByRole('figure')).toBeNull()
    expect(years).toHaveTextContent('Slipped in 2021, then came back. See History')
  })
})
