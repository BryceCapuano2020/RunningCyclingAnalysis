// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { interval } from './fixtures'
import { BalanceMeter } from './BalanceMeter'

afterEach(() => {
  cleanup()
})

/** The meter's centre dot, whose x position shows which way the balance leans. */
function dotX(container: HTMLElement): number {
  const dot = container.querySelector('.balance-meter__dot')
  return Number(dot?.getAttribute('cx'))
}

describe('BalanceMeter', () => {
  it('is one image named by the balance sentence, for running ahead', () => {
    render(<BalanceMeter ratio={interval(1.05, 1.12, 1.2)} />)
    expect(
      screen.getByRole('img', { name: 'Running ahead by 12% (range 5% to 20%)' }),
    ).toBeInTheDocument()
  })

  it('names cycling as ahead when the whole range is below even', () => {
    render(<BalanceMeter ratio={interval(0.75, 0.8, 0.9)} />)
    expect(
      screen.getByRole('img', { name: 'Cycling ahead by 25% (range 11% to 33%)' }),
    ).toBeInTheDocument()
  })

  it('names the balance as even when the range spans 1', () => {
    render(<BalanceMeter ratio={interval(0.95, 1, 1.05)} />)
    expect(
      screen.getByRole('img', {
        name: "Even within the model's range (running against cycling -5% to +5%)",
      }),
    ).toBeInTheDocument()
  })

  it('labels both ends of the track and the centre, so the direction is read as text too', () => {
    render(<BalanceMeter ratio={interval(1.05, 1.12, 1.2)} />)
    expect(screen.getByText('← Leans cycling')).toBeInTheDocument()
    expect(screen.getByText('Even')).toBeInTheDocument()
    expect(screen.getByText('Leans running →')).toBeInTheDocument()
  })

  it('puts the dot right of centre when running is ahead and left when cycling is', () => {
    const running = render(<BalanceMeter ratio={interval(1.05, 1.12, 1.2)} />)
    const runX = dotX(running.container)
    running.unmount()

    const cycling = render(<BalanceMeter ratio={interval(0.8, 0.9, 0.95)} />)
    const rideX = dotX(cycling.container)

    expect(runX).toBeGreaterThan(160)
    expect(rideX).toBeLessThan(160)
  })

  it('keeps the dot on the track when the balance is far beyond the scale', () => {
    const { container } = render(<BalanceMeter ratio={interval(3, 4, 5)} />)
    expect(dotX(container)).toBeCloseTo(312)
  })

  it('keeps the range band visible even when the range is a single value', () => {
    const { container } = render(<BalanceMeter ratio={interval(1.1, 1.1, 1.1)} />)
    const band = container.querySelector('.balance-meter__band')
    expect(Number(band?.getAttribute('width'))).toBeGreaterThanOrEqual(2)
  })
})
