// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { StandardsCredit } from './StandardsCredit'

afterEach(() => {
  cleanup()
})

describe('StandardsCredit', () => {
  it('names the standards and links their repository', () => {
    render(<StandardsCredit />)
    expect(screen.getByRole('link', { name: 'USATF road age standards (2025)' })).toHaveAttribute(
      'href',
      ROAD_STANDARDS_SOURCE.url,
    )
  })

  it('gives the authors and the licence after the name', () => {
    const { container } = render(<StandardsCredit />)
    expect(container).toHaveTextContent(
      'USATF road age standards (2025), by Alan Jones and Tom Bernhard, licensed CC0 1.0',
    )
  })
})
