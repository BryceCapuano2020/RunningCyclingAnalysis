// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EvidenceLine } from './EvidenceLine'

afterEach(cleanup)

describe('EvidenceLine', () => {
  it('is one line, not a card: a chip, the reason in plain words, and the link to how sure the answer is', () => {
    const { container } = render(<EvidenceLine noHeartRate />)
    expect(container.querySelector('.panel, .band, h2, h3')).toBeNull()
    expect(screen.getByText('No heart-rate check')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'How sure is this?' })
    expect(link).toHaveAttribute('href', '#/method')
    expect(screen.getByText('Add heart rate to sharpen this')).toBeInTheDocument()
    expect(container.querySelector('.definition')).toBeNull()
  })

  it('is the link alone while the files have heart rate, since the tiles carry the check', () => {
    const { container } = render(<EvidenceLine noHeartRate={false} />)
    expect(screen.getByRole('link', { name: 'How sure is this?' })).toHaveAttribute(
      'href',
      '#/method',
    )
    expect(container.querySelector('.chip, .definition')).toBeNull()
  })
})
