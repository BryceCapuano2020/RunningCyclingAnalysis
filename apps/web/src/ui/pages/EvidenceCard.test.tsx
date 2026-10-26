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
    expect(within(card).getByText('Could be higher')).toBeInTheDocument()
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
        'Heart rate shows your best efforts in both sports were hard ones, not easy days. That makes them hard, but does not prove either was all-out.',
      ),
    ).toBeInTheDocument()
  })

  it('is a quiet line, not a bordered card, when the numbers are good news', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    expect(screen.getByRole('region', { name: 'Built on real efforts' })).not.toHaveClass('card')
  })

  it('states the good news as a line, not as a heading', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    expect(screen.queryByRole('heading', { name: 'Built on real efforts' })).not.toBeInTheDocument()
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

    const region = screen.getByRole('region', { name })
    const action = within(region).getByRole('link', { name: 'How sure is this?' })
    expect(action).toHaveAttribute('href', '#/method')
    expect(region.lastElementChild).toBe(action)
  })
})

describe('EvidenceCard says how to record what is missing, on the card', () => {
  it('tells a gap how to record a hard 20-minute effort, in plain words', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Your ride number may be low' })
    expect(
      within(card).getByText(
        'To record one: after a warm-up, run or ride your hardest steady 20 min with heart rate on, then add the file.',
      ),
    ).toBeInTheDocument()
  })

  it('gives a gap on both sports the same how-to', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Both numbers may be low' })
    expect(within(card).getByText(/^To record one: after a warm-up/)).toBeInTheDocument()
  })

  it('tells a card with no heart rate how to add it', () => {
    renderCard(null)

    const card = screen.getByRole('region', { name: 'Add heart rate to sharpen this' })
    expect(
      within(card).getByText(
        'Wear a heart-rate strap or a watch that records heart rate, and export files that include it.',
      ),
    ).toBeInTheDocument()
  })

  it('gives good news no how-to, because there is nothing to record', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Built on real efforts' })
    expect(card).not.toHaveTextContent('To record one')
    expect(card).not.toHaveTextContent('Wear a heart-rate strap')
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

describe('EvidenceCard links', () => {
  it('keeps How sure is this? and leaves the grading link to the level cards', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Built on real efforts' })
    expect(within(card).getByRole('link', { name: 'How sure is this?' })).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: 'How is this graded?' })).toBeNull()
  })
})
