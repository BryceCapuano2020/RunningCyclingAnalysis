// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Lean } from '../balanceGap'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { energyReading, gapReading, meterFraction, SCALE_SPAN } from './balanceScale'
import type { BalanceReading } from './balanceScale'
import { interval } from './fixtures'
import { BalanceMeter } from './BalanceMeter'

afterEach(() => {
  cleanup()
})

/** The centre dot's position along the track, in percent from its left end. */
function dotLeft(container: HTMLElement): number {
  const dot = container.querySelector<HTMLElement>('.balance-meter__dot')
  return Number.parseFloat(dot?.style.left ?? '')
}

/** The label at one end of the track, which names the sport that sits there. */
function endLabel(container: HTMLElement, side: 'left' | 'right'): HTMLElement {
  const label = container.querySelector<HTMLElement>(`.balance-meter__end--${side}`)
  if (!label) throw new Error(`no ${side} end label`)
  return label
}

/** The position of a lead on the track, in percent from the left, as the meter places it. */
function positionOf(lead: number): number {
  return meterFraction(lead) * 100
}

/** A grade-gap reading that leans toward lean, with its range. */
function leaning(lean: Exclude<Lean, 'even'>): BalanceReading {
  return lean === 'run'
    ? gapReading({ centre: 6, low: 2, high: 10, lean })
    : gapReading({ centre: -6, low: -10, high: -2, lean })
}

describe('BalanceMeter with a grade gap', () => {
  it('is one image named by the gap and its range, in words', () => {
    render(<BalanceMeter reading={leaning('run')} />)
    const image = screen.getByRole('img')
    expect(image).toHaveAccessibleName(/Running grades 6 points higher than cycling/)
    expect(image).toHaveAccessibleName(/range 2 to 10 points/)
  })

  it('names the cycling lead in the same words, with the sport that leads first', () => {
    render(<BalanceMeter reading={leaning('ride')} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Cycling grades 6 points higher/)
  })

  it('labels each end with the sport that sits there, in the sport order', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const [left, right] = SPORT_ORDER
    expect(endLabel(container, 'left').textContent).toContain(SPORT_LABEL[left])
    expect(endLabel(container, 'right').textContent).toContain(SPORT_LABEL[right])
  })

  it.each(['run', 'ride'] as const)(
    'puts the dot on the end of the sport that leads, when %s leads',
    (lean) => {
      const { container } = render(<BalanceMeter reading={leaning(lean)} />)
      const leftSport = endLabel(container, 'left').dataset.sport
      const dotOnLeft = dotLeft(container) < 50
      expect(dotOnLeft).toBe(leftSport === lean)
    },
  )

  it('centres an even balance on the dot, with Even over the centre of the track', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 0, low: -2, high: 2, lean: 'even' })} />,
    )
    expect(dotLeft(container)).toBeCloseTo(50, 6)
    expect(screen.getByText('Even')).toBeInTheDocument()
  })

  it('prints ticks at 10, 20 and 30 on each side of the centre', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const ticks = [...container.querySelectorAll('.balance-meter__tick')].map((tick) =>
      tick.textContent?.trim(),
    )
    expect(ticks.sort()).toEqual(['10', '10', '20', '20', '30', '30'])
  })

  it('draws the band between the low and high ends of its range, centred on the band', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const band = container.querySelector<HTMLElement>('.balance-meter__band')
    const middle = (positionOf(2) + positionOf(10)) / 2
    expect(Number.parseFloat(band?.style.left ?? '')).toBeCloseTo(middle, 6)
  })

  it('keeps the dot inside its band when the range is wider than the centre', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 4, low: -2, high: 10, lean: 'even' })} />,
    )
    const band = container.querySelector<HTMLElement>('.balance-meter__band')
    const middle = Number.parseFloat(band?.style.left ?? '')
    const half = Number.parseFloat(band?.style.width ?? '') / 2
    expect(dotLeft(container)).toBeGreaterThanOrEqual(middle - half)
    expect(dotLeft(container)).toBeLessThanOrEqual(middle + half)
  })

  it('flags the best estimate over the dot, in points', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const flag = container.querySelector<HTMLElement>('.balance-meter__flag')
    expect(flag?.textContent).toBe('6 pts')
    expect(Number.parseFloat(flag?.style.left ?? '')).toBeCloseTo(dotLeft(container), 6)
  })

  it('caps a lead past the scale at its end with a 30+ marker, not beyond the track', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 40, low: 34, high: 46, lean: 'run' })} />,
    )
    expect(screen.getByText('30+')).toBeInTheDocument()
    expect(dotLeft(container)).toBeCloseTo(positionOf(SCALE_SPAN), 6)
  })

  it('reads the key under the meter, with the range and what the scale counts', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const key = container.querySelector('.balance-meter__key')
    expect(key?.textContent).toMatch(/Dot: best estimate/)
    expect(key?.textContent).toMatch(/2 to 10 points/)
    expect(key?.textContent).toMatch(/age-grade points/)
  })
})

describe('BalanceMeter with the energy ratio', () => {
  it('is named by the energy sentence', () => {
    render(<BalanceMeter reading={energyReading(interval(1.05, 1.12, 1.2))} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Running 12% higher, as energy per kilogram (range 5% to 20%)',
    )
  })

  it('says its scale is a percent of energy, not points of grade', () => {
    const { container } = render(
      <BalanceMeter reading={energyReading(interval(1.05, 1.12, 1.2))} />,
    )
    expect(container.querySelector('.balance-meter__key')?.textContent).toMatch(/percent of energy/)
  })

  it('prints its ticks in percent', () => {
    render(<BalanceMeter reading={energyReading(interval(1.05, 1.12, 1.2))} />)
    expect(screen.getAllByText('10%').length).toBeGreaterThan(0)
  })
})

describe('BalanceMeter scale details', () => {
  it('caps a cycling lead past the scale at the cycling end, marked 30+', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: -40, low: -46, high: -34, lean: 'ride' })} />,
    )
    expect(screen.getByText('30+')).toBeInTheDocument()
    expect(dotLeft(container)).toBeCloseTo(positionOf(-SCALE_SPAN), 6)
  })

  it('marks a percent cap as 30%+, since its scale is percent of energy', () => {
    render(<BalanceMeter reading={energyReading(interval(1.6, 1.9, 2.2))} />)
    expect(screen.getByText('30%+')).toBeInTheDocument()
  })

  it('does not cap a lead of exactly 30, which sits at the end of the scale', () => {
    render(<BalanceMeter reading={gapReading({ centre: 30, low: 30, high: 30, lean: 'run' })} />)
    expect(screen.queryByText('30+')).toBeNull()
  })

  it('draws the band over its range, as wide as the range on the track', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const band = container.querySelector<HTMLElement>('.balance-meter__band')
    expect(Number.parseFloat(band?.style.width ?? '')).toBeCloseTo(
      Math.abs(positionOf(10) - positionOf(2)),
      6,
    )
  })

  it('places each tick on the scale, on both sides of the centre', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const ticks = [...container.querySelectorAll<HTMLElement>('.balance-meter__tick')]
    for (const value of [10, 20]) {
      const lefts = ticks
        .filter((tick) => tick.textContent === String(value))
        .map((tick) => Number.parseFloat(tick.style.left))
        .sort((a, b) => a - b)
      expect(lefts).toHaveLength(2)
      const expected = [positionOf(value), positionOf(-value)].sort((a, b) => a - b)
      expect(lefts[0]).toBeCloseTo(expected[0] ?? Number.NaN, 6)
      expect(lefts[1]).toBeCloseTo(expected[1] ?? Number.NaN, 6)
    }
  })

  it('says the band is the ride’s range in the key, for a grade gap', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    expect(container.querySelector('.balance-meter__key')?.textContent).toMatch(
      /Band: the ride's 90% range/,
    )
  })
})
