// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { RouteShape as Shape } from '@rca/core/route/routeShape'
import { afterEach, describe, expect, it } from 'vitest'
import { RouteShape } from './RouteShape'

afterEach(() => {
  cleanup()
})

/** A 2:1 rectangle with its longer side across the unit box. */
const WIDE: Shape = {
  points: [
    [0, 0],
    [1, 0],
    [1, 0.5],
    [0, 0.5],
    [0, 0],
  ],
  aspect: 2,
}

/** A track five times as long as it is wide, so its box would be the narrowest the page allows. */
const TALL: Shape = {
  points: [
    [0, 0],
    [0.2, 0],
    [0.2, 1],
    [0, 1],
    [0, 0],
  ],
  aspect: 0.2,
}

describe('RouteShape', () => {
  it('draws the outline as a named image, for a ride', () => {
    render(<RouteShape shape={WIDE} sport="ride" />)

    const image = screen.getByRole('img', { name: 'Route shape of this ride' })
    expect(image.querySelector('polyline')).not.toBeNull()
  })

  it('names a run as a run', () => {
    render(<RouteShape shape={WIDE} sport="run" />)

    expect(screen.getByRole('img', { name: 'Route shape of this run' })).toBeInTheDocument()
  })

  it('draws every point of the shape, in order', () => {
    render(<RouteShape shape={WIDE} sport="run" />)

    const line = screen
      .getByRole('img', { name: 'Route shape of this run' })
      .querySelector('polyline')
    expect(line?.getAttribute('points')).toBe('0,0 1,0 1,0.5 0,0.5 0,0')
  })

  it('keeps the shape proportions, and a 3 px line that does not scale with the box', () => {
    render(<RouteShape shape={WIDE} sport="run" />)

    const image = screen.getByRole('img', { name: 'Route shape of this run' })
    expect(image.getAttribute('viewBox')).toBe('0 0 1 0.5')
    const line = image.querySelector('polyline')
    expect(line?.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expect(line?.getAttribute('class')).toContain('route-shape__line--run')
  })

  it('keeps a tall outline in a box no narrower than 4 to 5, so a narrow track is not 320 by 640', () => {
    const { container } = render(<RouteShape shape={TALL} sport="run" />)

    expect(container.querySelector('figure')?.getAttribute('style')).toContain('aspect-ratio: 0.8')
  })

  it('shows nothing when there is no shape', () => {
    const { container } = render(<RouteShape shape={null} sport="ride" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('marks the start with a ring and the finish with a dot, in either colouring', () => {
    const { container } = render(<RouteShape shape={WIDE} sport="run" />)

    const [ring, , , dot] = [
      '.route-shape__start-ring',
      '.route-shape__start-fill',
      '.route-shape__finish-halo',
      '.route-shape__finish',
    ].map((selector) => container.querySelector(selector))
    // Each is a zero-length stroke at the first or last point, sized in px, not in the shape's units.
    expect(ring?.getAttribute('d')).toBe('M 0 0 L 0 0')
    expect(dot?.getAttribute('d')).toBe('M 0 0 L 0 0')
    expect(ring?.getAttribute('vector-effect')).toBe('non-scaling-stroke')
  })

  describe('coloured by pace', () => {
    const pace = [0, 0.4, 1, 0.2]

    it('draws a segment for each stretch, thicker the faster it was, and keys the colours', () => {
      const { container } = render(<RouteShape shape={WIDE} sport="run" segmentPace={pace} />)

      expect(
        screen.getByRole('img', { name: 'Route shape of this run, coloured by pace' }),
      ).toBeInTheDocument()
      const segments = [...container.querySelectorAll<SVGPathElement>('.route-shape__segment')]
      expect(segments).toHaveLength(4)
      expect(container.querySelector('polyline')).toBeNull()
      const widths = segments.map((segment) => Number.parseFloat(segment.style.strokeWidth))
      expect(widths[2]).toBeGreaterThan(widths[1]!)
      expect(widths[1]).toBeGreaterThan(widths[0]!)
      expect(container.querySelector('.route-shape__key')).toHaveTextContent('SlowerFaster')
    })

    it('stays in the sport’s colour when the paces do not fit the outline', () => {
      const { container } = render(<RouteShape shape={WIDE} sport="run" segmentPace={[0.5, 0.5]} />)

      expect(container.querySelector('polyline')).not.toBeNull()
      expect(container.querySelector('.route-shape__key')).toBeNull()
    })
  })
})
