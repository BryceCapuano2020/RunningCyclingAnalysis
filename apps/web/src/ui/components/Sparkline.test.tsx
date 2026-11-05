// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'

afterEach(cleanup)

/** The polyline's points as [x, y] pairs. */
function pointsOf(container: HTMLElement): [number, number][] {
  const line = container.querySelector('polyline')?.getAttribute('points') ?? ''
  return line.split(' ').map((pair) => pair.split(',').map(Number) as [number, number])
}

describe('Sparkline', () => {
  it('draws nothing from fewer than two points', () => {
    const { container } = render(<Sparkline points={[{ atMs: 1, value: 3 }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws the points by date, left to right, with a higher value higher up', () => {
    const { container } = render(
      <Sparkline
        points={[
          { atMs: 0, value: 2 },
          { atMs: 10, value: 6 },
          { atMs: 20, value: 4 },
        ]}
      />,
    )
    const [first, second, third] = pointsOf(container)
    expect(first![0]).toBe(0)
    expect(third![0]).toBe(96)
    expect(second![1]).toBeLessThan(third![1])
    expect(third![1]).toBeLessThan(first![1])
  })

  it('is hidden from assistive technology, and is one line with no dots or fill', () => {
    const { container } = render(
      <Sparkline
        points={[
          { atMs: 0, value: 1 },
          { atMs: 5, value: 1 },
        ]}
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('sparkline')
    expect(container.querySelectorAll('polyline')).toHaveLength(1)
    expect(container.querySelector('circle, path, rect')).toBeNull()
  })

  it('draws a wobble of 0.3% nearly flat: its range is never scaled tighter than 3% of the mean', () => {
    const { container } = render(
      <Sparkline
        points={[
          { atMs: 0, value: 300 },
          { atMs: 10, value: 300.9 },
          { atMs: 20, value: 300.45 },
        ]}
      />,
    )
    const ys = pointsOf(container).map(([, y]) => y)
    // Filling the 24 px height would move it 20 px; a tenth of the floor's height moves it 2 px at most.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3)
  })
})
