// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_LIBRARY,
  FITNESS_RIDE_LIBRARY,
  RIDE_SLIPPING,
  HOLDING,
  IMPROVED,
  IMPROVING,
  RECOVERING,
  SLIPPING,
  FITNESS_AS_OF_MS,
} from '../fitnessFixtures'
import { fitnessViews } from '../fitnessModel'
import { FITNESS_WORDS } from '../fitnessWords'
import { HoldInputsContext } from '../holdContext'
import type { HoldInputs } from '../resultHold'
import { FitnessCard } from './FitnessCard'
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

/** A card's paragraphs as read: the level, a line for each change, and the evidence under them. */
function linesOf(card: Element) {
  const text = (selector: string) => spoken(card.querySelector(selector)!)
  return {
    headline: text('.fitness-card__headline'),
    changes: [...card.querySelectorAll('[data-testid="fitness-change"]')].map(spoken),
    support: text('.fitness-card__support'),
  }
}

function renderSection(over: Partial<FitnessSectionProps> & { run?: typeof SLIPPING } = {}) {
  const { run = SLIPPING, ...rest } = over
  return render(
    <FitnessSection
      nowMs={FITNESS_AS_OF_MS}
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
    const empty = render(
      <FitnessSection nowMs={FITNESS_AS_OF_MS} fitness={NO_FITNESS} units="metric" library={[]} />,
    )
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()
    renderSection()
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('draws the ride’s card like the run’s, in watts, on the home page and alone on the ride page', () => {
    const library = [...FITNESS_LIBRARY, ...FITNESS_RIDE_LIBRARY]
    const both = render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: RIDE_SLIPPING }}
        units="metric"
        library={library}
      />,
    )
    const cards = screen.getAllByRole('article', { name: 'Slipping' })
    expect(cards.map((card) => card.getAttribute('data-sport'))).toEqual(['run', 'ride'])
    const ride = linesOf(cards[1]!)
    expect(ride.headline).toMatch(/^\d+ W at 140 bpm\.$/)
    expect(ride.changes).toHaveLength(1)
    expect(ride.changes[0]).toMatch(
      /^\d+% \(\d+ to \d+\) off your level before \d+ [A-Z][a-z]{2}\.$/,
    )
    expect(ride.support).toMatch(/^From 12 steady rides, /)
    expect(spoken(cards[1]!)).not.toMatch(BANNED)
    both.unmount()
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: RIDE_SLIPPING }}
        units="metric"
        library={library}
        sport="ride"
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('shows one sport’s card without naming the sport, which its own page already names', () => {
    renderSection({ sport: 'run' })
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
    cleanup()
    renderSection()
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('says the state, the level first, a line for the change with its range and the steady runs behind it', () => {
    renderSection()
    const card = screen.getByRole('article')
    expect(spoken(card)).toMatch(/Slipping/)
    const lines = linesOf(card)
    expect(lines.headline).toMatch(/^\d:\d{2} \/km at 150 bpm\.$/)
    expect(lines.changes).toHaveLength(1)
    expect(lines.changes[0]).toMatch(
      /^\d+% \(\d+ to \d+\) off your level before \d+ [A-Z][a-z]{2}\.$/,
    )
    expect(lines.support).toMatch(/^From 12 steady runs, \d+ [A-Z][a-z]{2} to \d+ [A-Z][a-z]{2}\.$/)
    expect(spoken(card)).not.toMatch(BANNED)
  })

  it('says a recovery in two lines, each with one range, and no line for the season', () => {
    renderSection({ run: RECOVERING })
    const { changes } = linesOf(screen.getByRole('article'))
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatch(/^Up \d+% \(\d+ to \d+\) from your \w+ low\.$/)
    expect(changes[1]).toMatch(/^\d+% \(\d+ to \d+\) off your level before \d+ [A-Z][a-z]{2}\.$/)
    expect(screen.queryByTestId('fitness-season')).toBeNull()
  })

  it('defines the terms that carry the answer in place: the heart rate, the range and a steady run', () => {
    renderSection()
    const card = screen.getByRole('article')
    const terms = within(card)
      .getAllByRole('button', { expanded: false })
      .map((button) => button.textContent)
    expect(terms).toContain('at 150 bpm')
    expect(terms.some((text) => /^\(\d+ to \d+\)$/.test(text ?? ''))).toBe(true)
    expect(terms).toContain('steady runs')
    const heartRate = within(card).getByRole('button', { name: 'at 150 bpm' })
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

  it('says how old the status is once its newest activity is long ago by the clock, and drops the New marker', () => {
    renderSection({ nowMs: FITNESS_AS_OF_MS + 280 * 86_400_000 })
    expect(screen.getByTestId('fitness-age')).toHaveTextContent('Latest activity 9 months ago.')
    expect(screen.queryByTestId('fitness-new')).not.toBeInTheDocument()
    expect(spoken(screen.getByRole('article'))).not.toMatch(BANNED)
    cleanup()
    renderSection()
    expect(screen.queryByTestId('fitness-age')).not.toBeInTheDocument()
    expect(screen.getByTestId('fitness-new')).toBeInTheDocument()
  })

  it('has a label and a track for each state that has a change, and the track stays out of the reading order', () => {
    for (const run of [SLIPPING, RECOVERING, HOLDING, IMPROVING, IMPROVED]) {
      const { container } = renderSection({ run })
      expect(container.querySelector('.fitness-track')).not.toBeNull()
      expect(container.querySelector('.fitness-track__bar')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelector('.fitness-glyph')).toHaveAttribute('aria-hidden', 'true')
      cleanup()
    }
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
    expect(panel.textContent).toMatch(
      /In your first two years, an athlete with a strong season can see about one false "Slipping" every two years, then about one every four\./,
    )
    expect(spoken(panel)).toMatch(/Of your 12 runs on file, 64 are steady runs\./)
    expect(spoken(panel)).not.toMatch(BANNED)
  })

  it('keeps the athlete’s own seasonal swing in the evidence, off the card, and says "rode" for a ride', () => {
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
    // The card above the evidence says nothing of the season.
    expect(spoken(screen.getByRole('article').querySelector('.fitness-card__body')!)).not.toMatch(
      /season/i,
    )
    expect(screen.queryByTestId('fitness-season')).toBeNull()
    expect(spoken(panel)).toMatch(/the pace you ran at 150 bpm/)
    cleanup()
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
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

  it('says once that warm days were adjusted for, when they were, and not otherwise', () => {
    const warmed = {
      ...SLIPPING,
      evidence: { ...SLIPPING.evidence!, method: { ...SLIPPING.evidence!.method, heat: 0.03 } },
    }
    renderSection({ run: warmed })
    expect(screen.getAllByTestId('fitness-heat')).toHaveLength(1)
    expect(screen.getByTestId('fitness-heat')).toHaveTextContent('Adjusted for warm days.')
    cleanup()
    renderSection({ run: SLIPPING })
    expect(screen.queryByTestId('fitness-heat')).toBeNull()
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

describe('the false-alarm rate in the first two years', () => {
  it.each(['run', 'ride'] as const)('is told once in the %s promise, in plain words', (sport) => {
    const { promise } = FITNESS_WORDS[sport]
    expect(
      promise.match(/one false "Slipping" every two years, then about one every four\./g),
    ).toHaveLength(1)
    expect(promise).not.toMatch(BANNED)
    expect(promise).not.toContain('\u2014')
  })
})

describe('fitness while the library is only part of what was added', () => {
  const PARTIAL: HoldInputs = {
    partialImport: {
      text: 'The last import stopped before it finished, so your balance and your fitness wait.',
      action: 'Add the same files again to finish, or choose Use what I have.',
    },
  }
  const HELD_LINE =
    'The last import stopped before it finished, so your balance and your fitness wait. Add the same files again to finish, or choose Use what I have.'

  it('holds the section: it says why and what lifts it, and shows no card', () => {
    render(
      <HoldInputsContext.Provider value={PARTIAL}>
        <FitnessSection
          nowMs={FITNESS_AS_OF_MS}
          fitness={{ run: SLIPPING, ride: NO_FITNESS.ride }}
          units="metric"
          library={FITNESS_LIBRARY}
        />
      </HoldInputsContext.Provider>,
    )

    const region = screen.getByRole('region', { name: 'Your fitness' })
    expect(within(region).getByTestId('fitness-held')).toHaveTextContent(HELD_LINE)
    expect(within(region).queryByRole('article')).toBeNull()
    expect(screen.queryByText('Slipping')).toBeNull()
  })

  it('holds a card shown on its own, and a sport’s page, the same way', () => {
    const [view] = fitnessViews(
      { run: SLIPPING, ride: NO_FITNESS.ride },
      'metric',
      FITNESS_AS_OF_MS,
    )
    render(
      <HoldInputsContext.Provider value={PARTIAL}>
        <FitnessCard view={view!} units="metric" library={FITNESS_LIBRARY} />
        <FitnessSection
          nowMs={FITNESS_AS_OF_MS}
          fitness={{ run: SLIPPING, ride: NO_FITNESS.ride }}
          units="metric"
          library={FITNESS_LIBRARY}
          sport="run"
        />
      </HoldInputsContext.Provider>,
    )

    expect(screen.getAllByTestId('fitness-held')).toHaveLength(2)
    expect(screen.getByRole('article', { name: 'Held' })).toHaveAttribute('data-state', 'held')
    expect(screen.queryByText('Slipping')).toBeNull()
  })

  it('draws nothing for a library with no status, held or not', () => {
    const { container } = render(
      <HoldInputsContext.Provider value={PARTIAL}>
        <FitnessSection nowMs={FITNESS_AS_OF_MS} fitness={NO_FITNESS} units="metric" library={[]} />
      </HoldInputsContext.Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the cards again once the hold is lifted', () => {
    render(
      <HoldInputsContext.Provider value={{}}>
        <FitnessSection
          nowMs={FITNESS_AS_OF_MS}
          fitness={{ run: SLIPPING, ride: NO_FITNESS.ride }}
          units="metric"
          library={FITNESS_LIBRARY}
        />
      </HoldInputsContext.Provider>,
    )
    expect(screen.getByRole('article', { name: 'Slipping' })).toBeInTheDocument()
  })
})
