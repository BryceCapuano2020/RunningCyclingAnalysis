// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrandMark } from './icons'

afterEach(cleanup)

describe('BrandMark', () => {
  it('draws the tile and both sport strokes, hidden from assistive tech, and takes an extra class', () => {
    const { container } = render(<BrandMark className="extra" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveClass('brand-mark', 'extra')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    for (const part of ['tile', 'run', 'ride']) {
      expect(svg.querySelector(`.brand-mark__${part}`), part).not.toBeNull()
    }
  })
})
