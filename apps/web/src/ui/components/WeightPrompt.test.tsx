// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WEIGHT_PROMPT_TEXT } from '../weightCopy'
import { WeightPrompt } from './WeightPrompt'

afterEach(() => {
  cleanup()
})

describe('WeightPrompt', () => {
  it('asks for the weight in one sentence, with Profile as the link', () => {
    const { container } = render(
      <p>
        <WeightPrompt />
      </p>,
    )

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    expect(container.querySelector('p')).toHaveTextContent(WEIGHT_PROMPT_TEXT)
    expect(WEIGHT_PROMPT_TEXT).toBe('Add your weight on Profile to compare a ride with a run.')
  })
})
