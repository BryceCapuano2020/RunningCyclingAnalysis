// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortCheck } from '@rca/core/types'
import { EvidenceCard } from './EvidenceCard'

afterEach(() => {
  cleanup()
})

/** Renders the card; without a heart-rate flag the files count as having heart rate. */
function renderCard(effort: EffortCheck | null, noHeartRate = false) {
  return render(<EvidenceCard effort={effort} noHeartRate={noHeartRate} />)
}

const HEART_RATE_TEXT =
  'Heart rate shows how hard each best effort was. Wear a strap or a watch that records it, and export files that include it.'

describe('EvidenceCard evidence gap', () => {
  it('names a low cycling effort as the gap and says what would close it', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Your ride number could be higher' })
    expect(within(card).getByText('Could be higher')).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Your best 20 min on the bike reached 80% of your cycling reference heart rate, so it was probably not your hardest.',
      ),
    ).toBeInTheDocument()
  })

  it('names a low running effort when that one was the low one', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Your run number could be higher' })
    expect(
      within(card).getByText(
        'Your best 20 min running reached 70% of your running reference heart rate, so it was probably not your hardest.',
      ),
    ).toBeInTheDocument()
  })

  it('names both numbers when both best efforts were low', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Both numbers could be higher' })
    expect(
      within(card).getByText(
        'Your best 20 min reached 70% of your running reference heart rate and 80% of your cycling one, so neither was probably your hardest.',
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

    const card = screen.getByRole('region', { name: 'Hard efforts on file' })
    expect(within(card).getByText('Hard efforts on file')).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Heart rate shows your best 20 min in both sports were hard, not easy. Still, that does not prove either was your hardest.',
      ),
    ).toBeInTheDocument()
  })

  it('is a quiet line, not a bordered card, when the numbers are good news', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    expect(screen.getByRole('region', { name: 'Hard efforts on file' })).not.toHaveClass('card')
  })

  it('states the good news as a line, not as a heading', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('names the quiet region by its visible chip, not by a title nobody sees', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const region = screen.getByRole('region', { name: 'Hard efforts on file' })
    expect(within(region).getByText('Hard efforts on file')).toBeInTheDocument()
  })
})

describe('EvidenceCard detail link', () => {
  const STATES: [string, EffortCheck | null, string][] = [
    [
      'an evidence gap',
      { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 },
      'Your ride number could be higher',
    ],
    [
      'hard efforts on file',
      { durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 },
      'Hard efforts on file',
    ],
    ['no heart-rate check', null, 'Add heart rate to sharpen this'],
  ]

  it.each(STATES)('ends %s with a How sure is this? link to the method page', (_, effort, name) => {
    renderCard(effort, effort === null)

    const region = screen.getByRole('region', { name })
    const action = within(region).getByRole('link', { name: 'How sure is this?' })
    expect(action).toHaveAttribute('href', '#/method')
    expect(region.lastElementChild).toBe(action)
  })
})

describe('EvidenceCard says how to record what is missing, on the card', () => {
  it('tells a gap how to record a hard 20-minute effort, in plain words', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Your ride number could be higher' })
    expect(
      within(card).getByText(
        'To record one: after a warm-up, run or ride your hardest steady 20 min with heart rate on, then add the file.',
      ),
    ).toBeInTheDocument()
  })

  it('gives a gap on both sports the same how-to', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })

    const card = screen.getByRole('region', { name: 'Both numbers could be higher' })
    expect(within(card).getByText(/^To record one: after a warm-up/)).toBeInTheDocument()
  })

  it('tells a card with no heart rate how to add it, in the one paragraph', () => {
    renderCard(null, true)

    const card = screen.getByRole('region', { name: 'Add heart rate to sharpen this' })
    expect(within(card).getByText(HEART_RATE_TEXT)).toBeInTheDocument()
    expect(card.querySelectorAll('p')).toHaveLength(1)
  })

  it('gives good news no how-to, because there is nothing to record', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Hard efforts on file' })
    expect(card).not.toHaveTextContent('To record one')
    expect(card).not.toHaveTextContent('Wear a strap')
  })
})

describe('EvidenceCard without a heart-rate check', () => {
  it('asks for heart rate when there is no check', () => {
    renderCard(null, true)

    const card = screen.getByRole('region', { name: 'Add heart rate to sharpen this' })
    expect(within(card).getByText('No heart-rate check')).toBeInTheDocument()
    expect(within(card).getByText(HEART_RATE_TEXT)).toBeInTheDocument()
  })

  it('leaves the neutral chip without a warning icon, since the card is not a warning', () => {
    const { container } = renderCard(null, true)

    expect(container.querySelector('.chip')).toHaveTextContent('No heart-rate check')
    expect(container.querySelector('.chip svg')).toBeNull()
  })

  it('renders nothing with no comparison while the files have heart rate', () => {
    const { container } = renderCard(null, false)

    expect(container).toBeEmptyDOMElement()
  })

  it('asks for heart rate when neither sport has a fraction and the files have none', () => {
    renderCard({ durationS: 1200, runHrFraction: null, rideHrFraction: null }, true)
    expect(
      screen.getByRole('region', { name: 'Add heart rate to sharpen this' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['run', { durationS: 1200, runHrFraction: 0.95, rideHrFraction: null }],
    ['ride', { durationS: 1200, runHrFraction: null, rideHrFraction: 0.95 }],
  ])(
    'renders nothing when only the %s has a fraction and the files have heart rate',
    (_, effort) => {
      const { container } = renderCard(effort, false)
      expect(container).toBeEmptyDOMElement()
    },
  )
})

describe('EvidenceCard links', () => {
  it('keeps How sure is this? and leaves the grading link to the level cards', () => {
    renderCard({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })

    const card = screen.getByRole('region', { name: 'Hard efforts on file' })
    expect(within(card).getByRole('link', { name: 'How sure is this?' })).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: 'How is this graded?' })).toBeNull()
  })
})
