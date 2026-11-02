// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_HISTORY } from '@rca/core/history'
import '../../../test/deviceZone'
import { dotsFixture } from '../../fitnessYearsFixtures'
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
  it('toggles between the sports that have dots, and starts on the first', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(<FitnessYearsSection fitness={{ run, ride }} units="metric" />)
    expect(screen.getByRole('radio', { name: 'Run' })).toBeChecked()
    expect(screen.getByRole('figure')).toHaveTextContent('Pace at 142 bpm on steady runs')
    fireEvent.click(screen.getByRole('radio', { name: 'Ride' }))
    expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked()
    expect(screen.getByRole('figure')).toHaveTextContent('Power at 142 bpm on steady rides')
    expect(screen.getByRole('figure', { name: 'Fitness over the years' })).toBeInTheDocument()
  })

  it('has no toggle for one sport, and shows that sport', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(<FitnessYearsSection fitness={{ ...NO_HISTORY.fitness, ride }} units="metric" />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure')).toHaveTextContent('Power at 142 bpm on steady rides')
  })

  it('leaves a sport out until it has enough steady activities to draw, and says what to add when none does', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    const few = dotsFixture({ sport: 'ride', years: [2023], perYear: 7 })
    const { rerender } = render(<FitnessYearsSection fitness={{ run, ride: few }} units="metric" />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('figure')).toHaveTextContent('on steady runs')
    rerender(<FitnessYearsSection fitness={{ ...NO_HISTORY.fitness, ride: few }} units="metric" />)
    expect(screen.getByText(/^Add steady runs with heart rate/)).toBeInTheDocument()
    expect(screen.queryByTestId('fitness-dots')).toBeNull()
  })

  it('says what to add when neither sport has a steady activity', () => {
    vi.stubGlobal('ResizeObserver', SizedObserver)
    render(<FitnessYearsSection fitness={NO_HISTORY.fitness} units="metric" />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(/^Add steady runs with heart rate/)).toBeInTheDocument()
  })
})
