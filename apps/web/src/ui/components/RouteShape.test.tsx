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
})
