// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Lean } from '../../domain/lean'
import { SPORT_ORDER, SPORT_TITLE } from '../sports'
import { energyReading, gapReading, meterFraction, SCALE_SPAN } from './balanceScale'
import type { BalanceReading } from './balanceScale'
import { interval } from './fixtures'
import { BalanceMeter } from './BalanceMeter'

afterEach(() => {
  cleanup()
})

/**
 * The centre dot's position along the track, in percent from its left end. The meter sets it as a
 * custom property, which the stylesheet clamps so the dot stays inside the plot.
 */
function dotLeft(container: HTMLElement): number {
  const dot = container.querySelector<HTMLElement>('.balance-meter__dot')
  return Number.parseFloat(dot?.style.getPropertyValue('--at') ?? '')
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
    expect(image).toHaveAccessibleName(/range 2 to 10 points/)
  })

  it('adds what the range says to the spoken name only: it holds, or the two could be level', () => {
    const { container, rerender } = render(<BalanceMeter reading={leaning('run')} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/, so the lead holds across the range$/)
    expect(container.textContent).not.toMatch(/so the lead holds/)
    rerender(<BalanceMeter reading={gapReading({ centre: 9, low: -4, high: 18, lean: 'run' })} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/, so the two could be level$/)
  })

  it('marks a lead past the scale beside the name of the sport it runs toward, and no other', () => {
    const { container, rerender } = render(
      <BalanceMeter reading={gapReading({ centre: 40, low: 34, high: 46, lean: 'run' })} />,
    )
    const caps = () =>
      [...container.querySelectorAll('.balance-meter__end')].map(
        (end) => end.querySelector('.balance-meter__cap')?.textContent ?? null,
      )
    expect(caps()).toEqual(['30+', null])
    rerender(
      <BalanceMeter reading={gapReading({ centre: -40, low: -46, high: -34, lean: 'ride' })} />,
    )
    expect(caps()).toEqual([null, '30+'])
    rerender(<BalanceMeter reading={energyReading(interval(1.6, 1.9, 2.2))} />)
    expect(caps().join('')).toBe('30%+')
    rerender(<BalanceMeter reading={gapReading({ centre: 30, low: 30, high: 30, lean: 'run' })} />)
    expect(caps()).toEqual([null, null])
  })

  it('tells the stylesheet how many characters the number, its unit and the range take', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const reading = container.querySelector<HTMLElement>('.balance-meter__reading')
    expect(reading?.style.getPropertyValue('--number-chars')).toBe('2')
    expect(reading?.style.getPropertyValue('--unit-chars')).toBe('3')
    expect(reading?.style.getPropertyValue('--range-chars')).toBe(String('range 2 to 10'.length))
  })

  it('names the cycling lead in the same words, with the sport that leads first', () => {
    render(<BalanceMeter reading={leaning('ride')} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Cycling grades 6 points higher/)
  })

  it('labels each end with the sport that sits there, in the sport order', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const [left, right] = SPORT_ORDER
    expect(endLabel(container, 'left').textContent).toContain(SPORT_TITLE[left])
    expect(endLabel(container, 'right').textContent).toContain(SPORT_TITLE[right])
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

  it('writes the value and the range right under the dot, with no key', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const reading = container.querySelector<HTMLElement>('.balance-meter__reading')
    expect(reading?.querySelector('.balance-meter__value')?.textContent).toBe('+6pts')
    expect(reading?.querySelector('.balance-meter__edges')?.textContent).toBe('2 to 10')
    expect(container.querySelector('.balance-meter__key')).toBeNull()
    expect(container.querySelector('.balance-meter__tick')).toBeNull()
    expect(reading?.style.getPropertyValue('--at')).toBe(`${dotLeft(container)}%`)
  })

  it('defines the range in place, on the word "range"', () => {
    render(<BalanceMeter reading={leaning('run')} />)
    expect(screen.getByRole('button', { name: 'range' })).toBeInTheDocument()
  })

  it('writes a range that reaches zero with signs', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 4, low: -2, high: 10, lean: 'even' })} />,
    )
    expect(container.querySelector('.balance-meter__edges')?.textContent).toBe('−2 to +10')
  })

  it('writes no range for a lead whose range rounds to one value', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 30, low: 30, high: 30, lean: 'run' })} />,
    )
    expect(container.querySelector('.balance-meter__range')).toBeNull()
    expect(container.querySelector('.balance-meter__value')?.textContent).toBe('+30pts')
  })

  it('draws the band between the low and high ends of its range, centred on the band', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    const band = container.querySelector<HTMLElement>('.balance-meter__band')
    const middle = (positionOf(2) + positionOf(10)) / 2
    expect(Number.parseFloat(band?.style.left ?? '')).toBeCloseTo(middle, 6)
    expect(Number.parseFloat(band?.style.width ?? '')).toBeCloseTo(
      Math.abs(positionOf(10) - positionOf(2)),
      6,
    )
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

  it('places the dot and the value by a custom property, not a bare left, so the CSS can clamp them', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    for (const selector of ['.balance-meter__reading', '.balance-meter__dot']) {
      const placed = container.querySelector<HTMLElement>(selector)
      expect(placed?.style.left, selector).toBe('')
      expect(placed?.style.getPropertyValue('--at'), selector).toMatch(/%$/)
    }
  })

  it('keeps a lead past the scale at the end of the track, with its true value written under it', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: 40, low: 34, high: 46, lean: 'run' })} />,
    )
    expect(dotLeft(container)).toBeCloseTo(positionOf(SCALE_SPAN), 6)
    expect(container.querySelector('.balance-meter__value')?.textContent).toBe('+40pts')
  })

  it('sets the track as a paragraph-free figure: no caption, no key', () => {
    const { container } = render(<BalanceMeter reading={leaning('run')} />)
    expect(container.querySelector('figcaption')).toBeNull()
    expect(container.querySelector('.balance-meter__key')).toBeNull()
  })
})

describe('BalanceMeter with the energy ratio', () => {
  it('is named by the energy sentence', () => {
    render(<BalanceMeter reading={energyReading(interval(1.05, 1.12, 1.2))} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Running 12% higher, as energy per kilogram (range 5% to 20%)',
    )
  })

  it('writes its value and range in percent', () => {
    const { container } = render(
      <BalanceMeter reading={energyReading(interval(1.05, 1.12, 1.2))} />,
    )
    expect(container.querySelector('.balance-meter__value')?.textContent).toBe('+12%')
    expect(container.querySelector('.balance-meter__edges')?.textContent).toBe('5% to 20%')
  })

  it('says the range was informed by heart rate only when heart-rate data was used', () => {
    const reading = energyReading(interval(1.05, 1.12, 1.2))
    const { container, rerender } = render(<BalanceMeter reading={reading} />)
    expect(container.querySelector('.balance-meter__basis')).toBeNull()
    rerender(<BalanceMeter reading={reading} adjusted />)
    expect(container.querySelector('.balance-meter__basis')?.textContent).toBe(
      'informed by heart rate',
    )
  })

  it('keeps a cycling lead past the scale at the cycling end of the track', () => {
    const { container } = render(
      <BalanceMeter reading={gapReading({ centre: -40, low: -46, high: -34, lean: 'ride' })} />,
    )
    expect(dotLeft(container)).toBeCloseTo(positionOf(-SCALE_SPAN), 6)
  })
})
