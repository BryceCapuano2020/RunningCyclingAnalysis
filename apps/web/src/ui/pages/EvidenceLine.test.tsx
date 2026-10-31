// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EvidenceLine } from './EvidenceLine'

afterEach(cleanup)

describe('EvidenceLine', () => {
  it('is one line, not a card: a chip, the reason as a definition, and the link to how sure the answer is', () => {
    const { container } = render(<EvidenceLine noHeartRate />)
    expect(container.querySelector('.panel, .band, h2, h3')).toBeNull()
    expect(screen.getByText('No heart-rate check')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'How sure is this?' })
    expect(link).toHaveAttribute('href', '#/method')
    const button = screen.getByRole('button', { name: 'Add heart rate to sharpen this' })
    fireEvent.click(button)
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toHaveTextContent(
      'Heart rate shows how hard each best effort was. Wear a strap or a watch that records it, and export files that include it.',
    )
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
