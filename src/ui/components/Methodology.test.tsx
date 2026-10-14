// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Methodology } from './Methodology'

afterEach(() => {
  cleanup()
})

describe('Methodology', () => {
  it('is a collapsed details card with the methodology title', () => {
    const { container } = render(<Methodology />)
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(
      screen.getByRole('heading', { level: 2, name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
  })

  it('has a plain-language section for each assumption', () => {
    render(<Methodology />)
    for (const title of [
      'One unit for both sports',
      'Why there is a range',
      'Heart-rate check',
      'Virtual power meter',
      'Data checks',
      'Limits',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }
  })

  it('states the average gross efficiency and the 90% range', () => {
    render(<Methodology />)
    expect(screen.getByText(/about 21\.5%/)).toBeInTheDocument()
    expect(screen.getByText(/90% range/)).toBeInTheDocument()
  })
})
