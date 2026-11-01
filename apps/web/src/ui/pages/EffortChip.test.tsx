// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortCheck, Sport } from '@rca/core/types'
import { effortChipText } from '../effortCaveat'
import { EffortChip } from './EffortChip'

afterEach(cleanup)

/** The chip for a sport's check, as a page draws it: nothing where heart rate does not say. */
function Chip({ sport, effort }: { sport: Sport; effort: EffortCheck | null }) {
  const chip = effortChipText(sport, effort)
  return chip === null ? null : <EffortChip chip={chip} />
}

const check = (run: number | null, ride: number | null): EffortCheck => ({
  durationS: 1200,
  runHrFraction: run,
  rideHrFraction: ride,
})

describe('EffortChip', () => {
  it('says a best that did not reach a hard heart rate in two words as a warning', () => {
    const { container } = render(<Chip sport="run" effort={check(0.7, 0.95)} />)
    expect(screen.getByRole('button', { name: 'Not all-out' })).toBeInTheDocument()
    expect(container.querySelector('.chip')).toHaveClass('chip--warning')
    expect(container.querySelector('.chip svg')).toHaveAttribute('aria-hidden', 'true')
    // One chip, with no card, heading or paragraph of detail beside it.
    expect(container.querySelector('h2, h3, p, .panel, .band')).toBeNull()
  })

  it('keeps the detail in a definition that opens from the chip, with what would change it', () => {
    render(<Chip sport="ride" effort={check(0.95, 0.8)} />)
    const button = screen.getByRole('button', { name: 'Not all-out' })
    fireEvent.click(button)
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toHaveTextContent(
      'Your best 20 min on the bike reached 80% of your cycling max heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
  })

  it('says a hard effort, as good news, and keeps its share in the detail', () => {
    const { container } = render(<Chip sport="run" effort={check(0.95, 0.7)} />)
    const button = screen.getByRole('button', { name: 'Hard effort' })
    expect(container.querySelector('.chip')).toHaveClass('chip--good')
    fireEvent.click(button)
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toHaveTextContent(
      'reached 95% of your running max heart rate',
    )
  })

  it('judges the sport it is on, from that sport’s own heart rate', () => {
    render(<Chip sport="ride" effort={check(0.7, 0.95)} />)
    expect(screen.getByRole('button', { name: 'Hard effort' })).toBeInTheDocument()
  })

  it('says nothing where heart rate does not say, or there is no check', () => {
    expect(render(<Chip sport="run" effort={check(null, 0.9)} />).container).toBeEmptyDOMElement()
    cleanup()
    expect(render(<Chip sport="run" effort={null} />).container).toBeEmptyDOMElement()
  })
})
