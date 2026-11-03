// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EvidenceLine } from './EvidenceLine'

afterEach(cleanup)

describe('EvidenceLine', () => {
  it('is one line, not a card: the link to how sure the answer is, with no chip and no nudge', () => {
    const { container } = render(<EvidenceLine />)
    expect(container.querySelector('.panel, .band, h2, h3')).toBeNull()
    const link = screen.getByRole('link', { name: 'How sure is this?' })
    expect(link).toHaveAttribute('href', '#/method')
    // The link is all the line says: nothing about heart rate sits beside it.
    expect(container.textContent).toBe('How sure is this?')
    expect(container.querySelector('.chip, .definition')).toBeNull()
  })
})
