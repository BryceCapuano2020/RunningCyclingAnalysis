// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_HISTORY } from '@rca/core/history'
import { NO_LOOKBACK } from '@rca/core/lookback'
import type { HindsightFitness } from '@rca/core/lookback'
import '../../../test/deviceZone'
import { dotsFixture } from '../../fitnessYearsFixtures'
import { YEARS_LOOKBACK } from '../../yearsFixtures'
import { FitnessYearsSection } from './FitnessYearsSection'

class SizedObserver {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {
    this.callback([{ contentRect: { width: 800 } } as ResizeObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const run = dotsFixture({ years: [2021, 2022] })
const ride = dotsFixture({ sport: 'ride', years: [2022, 2023] })

describe('FitnessYearsSection', () => {
  it('lists the sport’s episodes under its chart, each with its size, and none for a sport that has none', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(<FitnessYearsSection fitness={{ run, ride }} units="metric" lookBack={YEARS_LOOKBACK} />)
    const chart = screen.getByRole('figure', { name: 'Fitness over the years' })
    const episodes = screen.getByRole('region', { name: 'Episodes' })
    // Under the chart, in the page's order.
    expect(chart.compareDocumentPosition(episodes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      within(episodes)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringMatching(
        /^May 2021 to January 2022\. Slipped 9% \(6 to 11\), then back\. 64 steady runs\.$/,
      ),
      expect.stringMatching(/^From June 2023\. Slipped 6% .*still lower in August 2024/),
    ])
    // The ride has no years to tell in this look-back.
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.queryByRole('region', { name: 'Episodes' })).toBeNull()
  })

  it('says how many smaller changes the list left out', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    const block = YEARS_LOOKBACK.sports.run
    const lookBack = {
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: { ...block, fitness: { ...(block.fitness as HindsightFitness), omittedEpisodes: 3 } },
      },
    }
    render(<FitnessYearsSection fitness={{ run, ride }} units="metric" lookBack={lookBack} />)
    expect(screen.getByRole('region', { name: 'Episodes' })).toHaveTextContent(
      'And 3 smaller changes.',
    )
  })

  it('toggles between the sports that have dots, and starts on the first', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(<FitnessYearsSection fitness={{ run, ride }} units="metric" lookBack={NO_LOOKBACK} />)
    expect(screen.getByRole('radio', { name: 'Run' })).toBeChecked()
    expect(screen.getByRole('figure')).toHaveTextContent('Pace at 142 bpm on steady runs')
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
    expect(screen.getByRole('figure')).toHaveTextContent('Power at 142 bpm on steady rides')
    expect(screen.getByRole('figure', { name: 'Fitness over the years' })).toBeInTheDocument()
  })

  it('has no toggle for one sport, and shows that sport', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(
      <FitnessYearsSection
        fitness={{ ...NO_HISTORY.fitness, ride }}
        units="metric"
        lookBack={NO_LOOKBACK}
      />,
    )
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure')).toHaveTextContent('Power at 142 bpm on steady rides')
  })

  it('leaves a sport out until it has enough steady activities to draw, and says what to add when none does', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    const few = dotsFixture({ sport: 'ride', years: [2023], perYear: 7 })
    const { rerender } = render(
      <FitnessYearsSection fitness={{ run, ride: few }} units="metric" lookBack={NO_LOOKBACK} />,
    )
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure')).toHaveTextContent('on steady runs')
    rerender(
      <FitnessYearsSection
        fitness={{ ...NO_HISTORY.fitness, ride: few }}
        units="metric"
        lookBack={NO_LOOKBACK}
      />,
    )
    expect(screen.getByText(/^Add steady runs with heart rate/)).toBeInTheDocument()
    expect(screen.queryByTestId('fitness-dots')).toBeNull()
  })

  it('says what to add when neither sport has a steady activity', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(
      <FitnessYearsSection fitness={NO_HISTORY.fitness} units="metric" lookBack={NO_LOOKBACK} />,
    )
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(/^Add steady runs with heart rate/)).toBeInTheDocument()
  })
})
