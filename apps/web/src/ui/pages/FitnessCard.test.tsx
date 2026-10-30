// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_LIBRARY,
  HOLDING,
  IMPROVING,
  RECOVERING,
  SLIPPING,
  waitingStatus,
} from '../fitnessFixtures'
import { FitnessSection } from './FitnessSection'
import type { FitnessSectionProps } from './FitnessSection'

afterEach(cleanup)

const BANNED = /limiter|weak|strength|holding you back|ahead of|because|caused/i

/** A card's words as read, without the notes its defined terms keep in the markup. */
function spoken(node: Element): string {
  const copy = node.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function renderSection(over: Partial<FitnessSectionProps> & { run?: typeof SLIPPING } = {}) {
  const { run = SLIPPING, ...rest } = over
  return render(
    <FitnessSection
      fitness={{ run, ride: NO_FITNESS.ride }}
      units="metric"
      library={FITNESS_LIBRARY}
      {...rest}
    />,
  )
}

describe('FitnessSection', () => {
  it('is a named region, "Your fitness", with a card for the run and its state as the card’s name', () => {
    renderSection()
    const region = screen.getByRole('region', { name: 'Your fitness' })
    expect(within(region).getByRole('heading', { level: 3, name: 'Slipping' })).toBeInTheDocument()
    expect(within(region).getByRole('article', { name: 'Slipping' })).toHaveAttribute(
      'data-sport',
      'run',
    )
  })

  it('draws nothing for a library with no status to show, and nothing for the ride, which is not compared', () => {
    const empty = render(<FitnessSection fitness={NO_FITNESS} units="metric" library={[]} />)
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()
    renderSection()
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('shows one sport’s card without naming the sport, which its own page already names', () => {
    renderSection({ sport: 'run' })
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    cleanup()
    renderSection()
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('says the state, the sentence with its range and the steady runs behind it', () => {
    renderSection()
    const card = screen.getByRole('article')
    const words = spoken(card)
    expect(words).toMatch(/Slipping/)
    expect(words).toMatch(/At 150 bpm you now run .*\/km, .*% \(\d+ to \d+%\) slower than the/)
    expect(words).toMatch(/12 steady runs/)
    expect(words).not.toMatch(BANNED)
  })

  it('defines the terms that carry the answer in place: the heart rate, the range and a steady run', () => {
    renderSection()
    const card = screen.getByRole('article')
    const terms = within(card)
      .getAllByRole('button', { expanded: false })
      .map((button) => button.textContent)
    expect(terms).toContain('At 150 bpm')
    expect(terms.some((text) => /^\(\d+ to \d+%\)$/.test(text ?? ''))).toBe(true)
    expect(terms).toContain('steady runs')
    const heartRate = within(card).getByRole('button', { name: 'At 150 bpm' })
    fireEvent.click(heartRate)
    expect(card.querySelector('.definition__note')?.textContent).toMatch(/one heart rate, 150 bpm/)
  })

  it('wears a New marker with the week the state began, only while it is new', () => {
    renderSection()
    expect(screen.getByTestId('fitness-new').textContent).toBe('Newweek of 12 Oct')
    cleanup()
    renderSection({ run: HOLDING })
    expect(screen.queryByTestId('fitness-new')).not.toBeInTheDocument()
  })

  it('has a label and a track for each state that has a change, and the track stays out of the reading order', () => {
    for (const run of [SLIPPING, RECOVERING, HOLDING, IMPROVING]) {
      const { container } = renderSection({ run })
      expect(container.querySelector('.fitness-track')).not.toBeNull()
      expect(container.querySelector('.fitness-track__bar')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelector('.fitness-glyph')).toHaveAttribute('aria-hidden', 'true')
      cleanup()
    }
  })

  it('counts what a waiting status needs, with a shape and no track, and no evidence panel', () => {
    const { container } = renderSection({
      run: waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
    })
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Not enough evidence yet')
    expect(container.querySelectorAll('.fitness-progress__cell')).toHaveLength(12)
    expect(container.querySelectorAll('.fitness-progress__cell.is-on')).toHaveLength(7)
    expect(container.querySelector('.fitness-progress__count')?.textContent).toBe(
      '7 of 12 steady runs before the last 8 weeks',
    )
    expect(container.querySelector('.fitness-track')).toBeNull()
    expect(screen.queryByText('See the evidence')).not.toBeInTheDocument()
  })
})

describe('the evidence panel', () => {
  const open = () => {
    const view = renderSection()
    const summary = screen.getByText('See the evidence')
    fireEvent.click(summary)
    const details = summary.closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    return view
  }

  it('is a disclosure that mounts only once opened, so a closed card measures and draws nothing', () => {
    const { container } = renderSection()
    expect(container.querySelector('details.fitness-card__evidence')).not.toBeNull()
    expect(container.querySelector('.chart-frame')).toBeNull()
    expect(container.querySelector('.fitness-evidence')).toBeNull()
  })

  it('holds the chart with its table twin, how it is measured, the honest limit once, and why runs do not count', () => {
    const { container } = open()
    expect(screen.getByRole('figure', { name: 'Pace at 150 bpm over time' })).toBeInTheDocument()
    expect(screen.getByText('View as table')).toBeInTheDocument()
    const panel = container.querySelector('.fitness-evidence')!
    expect(
      within(panel as HTMLElement).getByRole('heading', { name: 'How it is measured' }),
    ).toBeInTheDocument()
    expect(panel.textContent).toMatch(
      /It sees a change of about 5% or more, within weeks to a few months\./,
    )
    expect(spoken(panel).match(/about 5% or more/g)).toHaveLength(1)
    expect(spoken(panel)).toMatch(/Of your 12 runs on file, 64 are steady runs\./)
    expect(spoken(panel)).not.toMatch(BANNED)
  })

  it('lists the runs it rests on as links to their activities, newest first, and counts those it compares with', () => {
    const { container } = open()
    const links = [...container.querySelectorAll('.fitness-runs a')] as HTMLAnchorElement[]
    expect(links).toHaveLength(8)
    expect(links[0]!.getAttribute('href')).toBe('#/activities/run-12')
    expect(links[0]!.textContent).toMatch(/Morning run 12$/)
    expect(links[1]!.getAttribute('href')).toBe('#/activities/run-11')
    expect(
      screen.getByText(/28 steady runs, .* are what it is compared with\./),
    ).toBeInTheDocument()
  })

  it('pages a long list: the newest eight, then all of them on a press, and back', () => {
    const { container } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 12 steady runs' }))
    expect(container.querySelectorAll('.fitness-runs a')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Show the newest 8' }))
    expect(container.querySelectorAll('.fitness-runs a')).toHaveLength(8)
  })

  it('leaves out a run that is no longer in the library, rather than a dead link', () => {
    renderSection({ library: FITNESS_LIBRARY.slice(6) })
    const summary = screen.getByText('See the evidence')
    const details = summary.closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(document.querySelectorAll('.fitness-runs a')).toHaveLength(6)
  })
})
