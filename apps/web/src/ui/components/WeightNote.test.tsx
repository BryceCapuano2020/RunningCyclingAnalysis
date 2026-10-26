// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WEIGHT_FIGURES_PURPOSE, WEIGHT_PROMPT_PARTS } from '../weightCopy'
import { WeightNote } from './WeightNote'

afterEach(() => {
  cleanup()
})

describe('WeightNote', () => {
  it('asks for the weight in the prompt’s own words, with its purpose for ride figures', () => {
    const { container } = render(<WeightNote />)

    expect(screen.getByRole('link', { name: WEIGHT_PROMPT_PARTS.page })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(container.querySelector('p')).toHaveTextContent(
      `${WEIGHT_PROMPT_PARTS.lead} Profile ${WEIGHT_FIGURES_PURPOSE}`,
    )
    expect(WEIGHT_FIGURES_PURPOSE).toBe('to see ride figures.')
  })

  it('gives the Profile link its own class, so a phone can give it a finger-sized target', () => {
    render(<WeightNote />)
    expect(screen.getByRole('link', { name: WEIGHT_PROMPT_PARTS.page })).toHaveClass(
      'weight-note__link',
    )
  })
})
