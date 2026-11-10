// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { noFitness } from '@rca/core/fitness/types'
import type { FitnessBySport } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  FITNESS_LIBRARY,
  RECOVERING,
  RIDE_SLIPPING,
  waitingStatus,
} from '../test/fitnessFixtures'
import { dotsFixture } from '../test/fitnessYearsFixtures'
import { SportFitness } from './SportFitness'

afterEach(cleanup)

const NOW = FITNESS_AS_OF_MS + 1000
const BOTH = (run: FitnessBySport['run'], ride = noFitness('ride')): FitnessBySport => ({
  run,
  ride,
})
const WAITING = waitingStatus({ kind: 'recent', have: 1, need: 3, weeks: 12 }, 7, 'ride')

describe('SportFitness', () => {
  it('draws a status with a trend as its level over time, titled by the sport, with today marked', () => {
    const { container } = render(
      <SportFitness
        fitness={BOTH(RECOVERING)}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="run"
        nowMs={NOW}
      />,
    )
    const section = screen.getByRole('region', { name: 'Your fitness' })
    expect(within(section).getByRole('figure', { name: /^Run$/ })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="fitness-now"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="fitness-low"]')).toBeNull()
    // One disclosure for the section: the chart's, holding the sentence, the table and the rows.
    expect(section.querySelectorAll('details')).toHaveLength(1)
    expect(section.querySelector('details .props')).not.toBeNull()
    expect(section.querySelector('.fitness-track')).toBeNull()
    // The sentence is the graph's text, not a line on the page.
    expect(container.querySelector('.fitness-card__line')).toBeNull()
    expect(section.querySelector('.chart-frame__lede')?.textContent).toMatch(
      /^\d:\d{2}\s\/km at 150 bpm\.$/,
    )
  })

  it('draws a status with no trend as the steady rides it rests on, with today marked and no trend line invented', () => {
    const { container } = render(
      <SportFitness
        fitness={BOTH(RECOVERING, WAITING)}
        dots={dotsFixture({ sport: 'ride', years: [2025], perYear: 8 })}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
        nowMs={NOW}
      />,
    )
    expect(screen.getByRole('figure', { name: /^Ride$/ })).toBeInTheDocument()
    expect(container.querySelector('[data-testid="fitness-dots"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="fitness-now-mark"]')?.textContent).toMatch(
      /^Now \d+ W$/,
    )
    expect(container.querySelector('[data-testid="fitness-point"]')).toBeNull()
    expect(container.querySelector('[data-testid="fitness-span"]')).toBeNull()
  })

  it('keeps the one line for a sport with too few steady activities to draw', () => {
    render(
      <SportFitness
        fitness={BOTH(
          RECOVERING,
          waitingStatus({ kind: 'recent', have: 1, need: 3, weeks: 12 }, 2, 'ride'),
        )}
        dots={dotsFixture({ sport: 'ride', years: [2025], perYear: 2 })}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
        nowMs={NOW}
      />,
    )
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('draws a ride status with a trend as its level over time', () => {
    render(
      <SportFitness
        fitness={BOTH(RECOVERING, RIDE_SLIPPING)}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
        nowMs={NOW}
      />,
    )
    expect(screen.getByRole('figure', { name: /^Ride$/ })).toBeInTheDocument()
  })
})
