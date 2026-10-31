// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_LIBRARY,
  FITNESS_RIDE_LIBRARY,
  RIDE_SLIPPING,
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
    expect(within(region).getByRole('article', { name: 'Slipping' })).toHaveAttribute(
      'data-sport',
      'run',
    )
  })

  it('adds no heading, so a page’s own title stays first in the outline: the region and the card are named without one', () => {
    renderSection()
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Your fitness' })).toBeInTheDocument()
  })

  it('draws nothing for a library with no status to show, and no ride card for a library with no ride status', () => {
    const empty = render(<FitnessSection fitness={NO_FITNESS} units="metric" library={[]} />)
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()
    renderSection()
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('draws the ride’s card like the run’s, in watts, on the home page and alone on the ride page', () => {
    const library = [...FITNESS_LIBRARY, ...FITNESS_RIDE_LIBRARY]
    const both = render(
      <FitnessSection
        fitness={{ run: SLIPPING, ride: RIDE_SLIPPING }}
        units="metric"
        library={library}
      />,
    )
    const cards = screen.getAllByRole('article', { name: 'Slipping' })
    expect(cards.map((card) => card.getAttribute('data-sport'))).toEqual(['run', 'ride'])
    expect(spoken(cards[1]!)).toMatch(
      /At 140 bpm you now ride at \d+ W, .*% \(\d+ to \d+%\) less than the/,
    )
    expect(spoken(cards[1]!)).toMatch(/12 steady rides/)
    expect(spoken(cards[1]!)).not.toMatch(BANNED)
    both.unmount()
    render(
      <FitnessSection
        fitness={{ run: SLIPPING, ride: RIDE_SLIPPING }}
        units="metric"
        library={library}
        sport="ride"
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('draws a ride that is still waiting as one line on the home page, with its count and a link to the Ride page', () => {
    const waiting = waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }, 7)
    render(
      <FitnessSection
        fitness={{ run: SLIPPING, ride: { ...waiting, sport: 'ride' } }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('Ride fitness: not enough steady rides yet, 7 of 12')
    expect(within(line).getByRole('link')).toHaveAttribute('href', '#/ride')
    cleanup()
    // The Ride page draws the full waiting card, with the count.
    render(
      <FitnessSection
        fitness={{ run: SLIPPING, ride: { ...waiting, sport: 'ride' } }}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
      />,
    )
    expect(screen.getByRole('article', { name: 'Not enough evidence yet' })).toBeInTheDocument()
    expect(screen.queryByTestId('ride-fitness-line')).toBeNull()
  })

  it('draws the section for a waiting ride alone (a library of rides) as the line, and says "recent" when it is the weeks that are short', () => {
    const recent = waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }, 30)
    render(
      <FitnessSection
        fitness={{ run: NO_FITNESS.run, ride: { ...recent, sport: 'ride' } }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByTestId('ride-fitness-line')).toHaveTextContent(
      'Ride fitness: not enough recent steady rides yet, 2 of 4',
    )
  })

  it('says a ride with enough rides but too wide a range is too uncertain to call, with no count', () => {
    const imprecise = {
      ...waitingStatus({ kind: 'imprecise', within: 0.07 }, 33),
      sport: 'ride' as const,
    }
    render(
      <FitnessSection
        fitness={{ run: SLIPPING, ride: imprecise }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    const line = screen.getByTestId('ride-fitness-line')
    expect(line).toHaveTextContent('Ride fitness: too uncertain to call yet')
    expect(line).not.toHaveTextContent(/not enough|of \d/)
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
    expect(screen.getByTestId('fitness-new').textContent).toBe('Newsince the week of 12 Oct')
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
    expect(screen.getByRole('article', { name: 'Not enough evidence yet' })).toBeInTheDocument()
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
    expect(panel.textContent).toMatch(/A change of 8% it sees within weeks, reliably\./)
    expect(panel.textContent).toMatch(
      /A change of 5% it usually sees within a few months, and not always\./,
    )
    expect(panel.textContent).toMatch(/spread from one run to the next, about 4%/)
    expect(spoken(panel).match(/usually sees within a few months/g)).toHaveLength(1)
    expect(spoken(panel)).toMatch(/Of your 12 runs on file, 64 are steady runs\./)
    expect(spoken(panel)).not.toMatch(BANNED)
  })

  it('says the athlete’s own seasonal swing was taken out, when one was, and says "rode" for a ride', () => {
    const seasoned = (status: typeof SLIPPING) => ({
      ...status,
      evidence: { ...status.evidence!, method: { ...status.evidence!.method, seasonal: 0.021 } },
    })
    renderSection({ run: seasoned(SLIPPING) })
    fireEvent.click(screen.getByText('See the evidence'))
    const details = screen.getByText('See the evidence').closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    const panel = document.querySelector('.fitness-evidence')!
    expect(spoken(panel)).toMatch(
      /Your usual seasonal swing, up to 2\.1% either side of your usual, has been taken out of every steady run first\./,
    )
    expect(screen.getByTestId('fitness-season')).toHaveTextContent(
      'Allowing for your usual seasonal swing, up to 2.1% either side.',
    )
    expect(spoken(panel)).toMatch(/the pace you ran at 150 bpm/)
    cleanup()
    render(
      <FitnessSection
        fitness={{ run: NO_FITNESS.run, ride: RIDE_SLIPPING }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    fireEvent.click(screen.getByText('See the evidence'))
    const rideDetails = screen.getByText('See the evidence').closest('details')!
    rideDetails.open = true
    fireEvent(rideDetails, new Event('toggle'))
    const ridePanel = document.querySelector('.fitness-evidence')!
    expect(spoken(ridePanel)).toMatch(/the power you rode at 140 bpm/)
    expect(spoken(ridePanel)).toMatch(/adjusted for the heart rate of each\./)
    expect(spoken(ridePanel)).not.toMatch(/climb/)
    expect(spoken(ridePanel)).toMatch(/from one ride to the next, 2% to 5%/)
    expect(ridePanel.textContent).toMatch(
      /Rides are not tested for steadiness, so any pace counts\./,
    )
    expect(ridePanel.textContent).toMatch(/A ride outdoors with a power meter/)
    expect(spoken(ridePanel)).toMatch(/The others were indoors/)
    expect(screen.queryByTestId('fitness-season')).toBeNull()
    expect(spoken(ridePanel)).not.toMatch(/seasonal/)
  })

  it('counts in the athlete’s unit: miles beside the kilometres it reads, none for a metric athlete', () => {
    renderSection({ units: 'imperial' })
    fireEvent.click(screen.getByText('See the evidence'))
    const details = screen.getByText('See the evidence').closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    const panel = document.querySelector('.fitness-evidence')!
    expect(spoken(panel)).toMatch(/kilometres 2 to 10 \(from 0\.6 to 6\.2 miles into the run\)/)
    expect(spoken(panel)).toMatch(/changed pace from one kilometre \(0\.6 mi\) to the next/)
    cleanup()
    renderSection({ units: 'metric' })
    const metric = screen.getByText('See the evidence').closest('details')!
    metric.open = true
    fireEvent(metric, new Event('toggle'))
    expect(spoken(document.querySelector('.fitness-evidence')!)).not.toMatch(/miles?\b| mi\b/)
    expect(spoken(document.querySelector('.fitness-evidence')!)).toMatch(/kilometres 2 to 10/)
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
