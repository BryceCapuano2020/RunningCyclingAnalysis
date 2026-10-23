// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortCheck } from '@rca/core/types'
import { EvidenceCard } from './EvidenceCard'

afterEach(() => {
  cleanup()
})

function renderCard(effort: EffortCheck | null) {
  return render(<EvidenceCard effort={effort} />)
}

describe('EvidenceCard evidence gap', () => {
  it('names a low cycling effort as the gap and says what would close it', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Your ride number may be low' })
    expect(within(card).getByText('Evidence gap')).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Your best 20 min on the bike reached 80% of your cycling heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
      ),
    ).toBeInTheDocument()
  })

  it('names a low running effort when that one was the low one', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Your run number may be low' })
    expect(
      within(card).getByText(
        'Your best 20 min running reached 70% of your running heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
      ),
    ).toBeInTheDocument()
  })

  it('names both numbers when both best efforts were low', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Both numbers may be low' })
    expect(
      within(card).getByText(
        'Your best 20 min reached 70% of your running heart-rate reference and 80% of your cycling one, so neither was probably all-out. A recent race or a hard effort of this length in each sport would sharpen both.',
      ),
    ).toBeInTheDocument()
  })

  it('draws the warning icon in the chip with currentColor, and hides it from assistive technology', () => {
    const { container } = renderCard({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })

    const icon = container.querySelector('.chip svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('stroke', 'currentColor')
  })
})

describe('EvidenceCard hard efforts', () => {
  it('says the numbers are built on real efforts when both best efforts were hard', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Built on real efforts' })
    expect(within(card).getByText('Hard efforts on file')).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Heart rate shows your best efforts in both sports were hard ones, not easy days, so these numbers rest on real work.',
      ),
    ).toBeInTheDocument()
  })
})

describe('EvidenceCard detail link', () => {
  const STATES: [string, EffortCheck | null, string][] = [
    [
      'an evidence gap',
      { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 },
      'Your ride number may be low',
    ],
    [
      'hard efforts on file',
      { durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 },
      'Built on real efforts',
    ],
    ['no heart-rate check', null, 'Add heart rate to sharpen this'],
  ]

  it.each(STATES)('ends %s with a How sure is this? link to the method page', (_, effort, name) => {
    renderCard(effort)

    const card = screen.getByRole('region', { name })
    const link = within(card).getByRole('link', { name: 'How sure is this?' })
    expect(link).toHaveAttribute('href', '#/method')
    expect(card.lastElementChild).toBe(link)
  })
})

describe('EvidenceCard without a heart-rate check', () => {
  it('asks for heart rate when there is no check', () => {
    renderCard(null)

    const card = screen.getByRole('region', { name: 'Add heart rate to sharpen this' })
    expect(within(card).getByText('No heart-rate check')).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Files with heart rate show how hard your best efforts were, which narrows the range.',
      ),
    ).toBeInTheDocument()
  })

  it('asks for heart rate when neither sport has a fraction', () => {
    renderCard({ durationS: 1200, runHrFraction: null, rideHrFraction: null })
    expect(
      screen.getByRole('region', { name: 'Add heart rate to sharpen this' }),
    ).toBeInTheDocument()
  })
})
