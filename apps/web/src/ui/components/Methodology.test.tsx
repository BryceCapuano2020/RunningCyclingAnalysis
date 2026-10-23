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

  it('puts the title in an h2 inside the summary, with no custom summary class', () => {
    const { container } = render(<Methodology />)
    const summary = container.querySelector('details > summary')
    expect(summary).not.toBeNull()
    expect(summary?.className).toBe('')
    expect(summary?.querySelector('h2')).toHaveTextContent('How this works and what it assumes')
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

  it('says the model is fitted to all power-meter rides and its accuracy is scored leave-one-out', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Virtual power meter' })
    const body = heading.nextElementSibling
    expect(body).toHaveTextContent(
      'Power is estimated on climbs from speed, gradient and weight using a model fitted to your power-meter rides; its accuracy is scored on each ride with that ride left out of the fit.',
    )
    expect(body?.textContent).not.toMatch(/tuned on your other/)
  })
})
