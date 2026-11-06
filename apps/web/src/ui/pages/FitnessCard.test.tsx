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
  waitingStatus,
} from '../fitnessFixtures'
import { fitnessViews } from '../fitnessModel'
import { FITNESS_WORDS } from '../fitnessWords'
import { HoldInputsContext } from '../holdContext'
import type { HoldInputs } from '../resultHold'
import { rowsIn, rowValue } from '../test/propertyRows'
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

/**
 * A row's words as read: its one line under the title, then what its Details hold as rows: the level at its heart rate, the
 * other changes, and the steady activities behind them.
 */
function linesOf(row: Element) {
  const rows = rowsIn(row)
  const value = (label: RegExp) => rows.find(([name]) => label.test(name))?.[1] ?? null
  return {
    line: spoken(row.querySelector('[data-testid="fitness-line"]')!),
    level: value(/ at \d+ bpm$/),
    changes: rows.filter(([name]) => name === 'Also').map(([, text]) => text),
    steady: value(/^Steady (runs|rides)$/),
  }
}

/** The fitness rows on the page, one for each sport, in order. */
const rowsOf = () => [...document.querySelectorAll('li.fitness-card')] as HTMLElement[]

/** A row by its title: "Run · Slipping" on the home page, the state alone on a sport's own page. */
const rowNamed = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

/** Opens a row's one Details, as a press does, so what it holds mounts. */
function openDetails(row: Element): HTMLDetailsElement {
  const details = row.querySelector('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
  return details
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
  it('is a named region, "Your fitness", with a row for the run titled by the sport and its state', () => {
    renderSection()
    const region = screen.getByRole('region', { name: 'Your fitness' })
    const title = within(region).getByRole('heading', { level: 3, name: 'Run · Slipping' })
    const row = title.closest('li')!
    expect(row).toHaveAttribute('data-sport', 'run')
    expect(row.closest('ol')).toHaveClass('rows')
    // A list of one row is not numbered, and has no index column.
    expect(row.querySelector('.row__index')).toBeNull()
    expect(row).toHaveClass('row--unnumbered')
    // No mono sport label over the state, and no second small line under the title.
    expect(region.querySelector('.fitness-card__sport')).toBeNull()
    expect(row.querySelectorAll(':scope > .row__body > p')).toHaveLength(1)
  })

  it('is a section under the page’s title, with one heading that names it and a row title under it', () => {
    renderSection()
    const headings = screen.getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H2', 'H3'])
    expect(headings[0]).toHaveTextContent('Your fitness')
    expect(headings[1]).toHaveTextContent('Run · Slipping')
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
    const rows = rowsOf()
    expect(rows.map((row) => row.getAttribute('data-sport'))).toEqual(['run', 'ride'])
    expect(rowNamed('Ride · Slipping')).toBe(rows[1])
    // Two rows are numbered.
    expect(rows.map((row) => row.querySelector('.row__index')?.textContent)).toEqual(['01', '02'])
    expect(rows[0]).not.toHaveClass('row--unnumbered')
    const ride = linesOf(rows[1]!)
    // The one line is the change, without its range; the level is in the Details.
    expect(ride.line).toMatch(/^\d+% off your level before \d+ [A-Z][a-z]{2}\.$/)
    expect(rowValue(rows[1]!, 'Power at 140 bpm')).toMatch(/^\d+ W$/)
    expect(ride.changes).toHaveLength(0)
    expect(ride.steady).toBe('12')
    expect(spoken(rows[1]!)).not.toMatch(BANNED)
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
    expect(rowsOf()).toHaveLength(1)
    expect(rowNamed('Slipping')).toHaveAttribute('data-sport', 'ride')
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('shows one sport’s card without naming the sport, which its own page already names', () => {
    renderSection({ sport: 'run' })
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^Slipping$/)
    cleanup()
    renderSection()
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^Run · Slipping$/)
  })

  it('says the state in the title, the change as its one line without a range, and the level and the runs in its Details', () => {
    renderSection()
    const card = rowNamed('Run · Slipping')
    const lines = linesOf(card)
    expect(lines.line).toMatch(/^\d+% off your level before \d+ [A-Z][a-z]{2}\.$/)
    expect(lines.level).toMatch(/^\d:\d{2} \/km$/)
    expect(rowValue(card, 'Pace at 150 bpm')).toBe(lines.level)
    expect(card.querySelector('details')?.contains(card.querySelector('.props'))).toBe(true)
    expect(lines.changes).toHaveLength(0)
    expect(lines.steady).toBe('12')
    expect(spoken(card)).not.toMatch(BANNED)
  })

  it('says a recovery as its one line without a range, the other change with its range in the Details, and no line for the season', () => {
    renderSection({ run: RECOVERING })
    expect(rowNamed('Run · Recovering')).toBeInTheDocument()
    const { line, changes } = linesOf(rowsOf()[0]!)
    expect(line).toMatch(/^Up \d+% from your \w+ low\.$/)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatch(/^\d+% \(\d+ to \d+\) off your level before \d+ [A-Z][a-z]{2}$/)
    expect(screen.queryByTestId('fitness-season')).toBeNull()
  })

  it('keeps prose out of its Details: rows and one Method link, no defined terms', () => {
    renderSection({ run: RECOVERING })
    const card = rowsOf()[0]!
    openDetails(card)
    expect(card.querySelector('[data-testid="fitness-line"] .definition')).toBeNull()
    expect(card.querySelector('details .props')).not.toBeNull()
    expect(
      within(card).getByRole('link', { name: /^Method, how run fitness is worked out$/ }),
    ).toBeInTheDocument()
  })

  it('wears a New marker with the week the state began, only while it is new', () => {
    renderSection()
    expect(rowValue(document.body, 'New since')).toBe('the week of 12 Oct')
    cleanup()
    renderSection({ run: HOLDING })
    expect(rowValue(document.body, 'New since')).toBeNull()
  })

  it('says how old the status is once its newest activity is long ago by the clock, and drops the New marker', () => {
    renderSection({ nowMs: FITNESS_AS_OF_MS + 280 * 86_400_000 })
    expect(rowValue(document.body, 'Latest activity')).toBe('9 months ago')
    expect(rowValue(document.body, 'New since')).toBeNull()
    expect(spoken(rowsOf()[0]!)).not.toMatch(BANNED)
    cleanup()
    renderSection()
    expect(rowValue(document.body, 'Latest activity')).toBeNull()
    expect(rowValue(document.body, 'New since')).not.toBeNull()
  })

  it('has a title and a track in its Details for each state that has a change, and the track stays out of the reading order', () => {
    for (const run of [SLIPPING, RECOVERING, HOLDING, IMPROVING, IMPROVED]) {
      const { container } = renderSection({ run })
      expect(container.querySelector('details .fitness-track')).not.toBeNull()
      expect(container.querySelector('.fitness-track__bar')).toHaveAttribute('aria-hidden', 'true')
      // The state is its word alone: no glyph or icon box beside it.
      expect(container.querySelector('.fitness-glyph, .fitness-card__state svg')).toBeNull()
      cleanup()
    }
  })
})

describe('the home page’s rows, read as text', () => {
  it('keeps a space on each side of every figure in the ride’s one line, which is plain text and no link', () => {
    const ride = waitingStatus(
      { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
      7,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride }}
        units="metric"
        library={[...FITNESS_LIBRARY, ...FITNESS_RIDE_LIBRARY]}
      />,
    )
    const row = rowNamed('Ride')
    const line = row.querySelector('[data-testid="fitness-line"]')!
    // The figures are their own spans (.num): the words around them keep their spaces, with no range.
    expect(line.textContent).toMatch(/^\d+ W at \d+ bpm\.$/)
    expect([...line.querySelectorAll('.num')].map((num) => num.textContent)).toEqual([
      expect.stringMatching(/^\d+$/),
      expect.stringMatching(/^\d+$/),
    ])
    expect(line.closest('a')).toBeNull()
    expect(line.querySelector('a')).toBeNull()
  })

  it('titles the run by the sport and its state, and gives its first change without the range as its one line', () => {
    renderSection({ run: RECOVERING })
    const row = rowNamed('Run · Recovering')
    const [view] = fitnessViews(
      { run: RECOVERING, ride: NO_FITNESS.ride },
      'metric',
      FITNESS_AS_OF_MS,
    )
    const first = view!.changes[0]!
    expect(first).toMatch(/ \(\d+ to \d+\) /)
    const line = row.querySelector('[data-testid="fitness-line"]')!
    expect(line.textContent).toBe(first.replace(/ \(\d+ to \d+\)/, ''))
    expect(line.textContent).not.toMatch(/\(/)
  })
})

describe('the evidence panel', () => {
  const open = () => {
    const view = renderSection()
    openDetails(rowsOf()[0]!)
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
    const figure = screen.getByRole('figure', { name: 'Pace at 150 bpm over time' })
    expect(figure.querySelector('.chart-frame__details table')).not.toBeNull()
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
    openDetails(rowsOf()[0]!)
    const panel = document.querySelector('.fitness-evidence')!
    expect(spoken(panel)).toMatch(
      /Your usual seasonal swing, up to 2\.1% either side of your usual, has been taken out of every steady run first\./,
    )
    // The row's title and its one line say nothing of the season.
    expect(spoken(rowsOf()[0]!.querySelector('.row__title')!)).not.toMatch(/season/i)
    expect(spoken(rowsOf()[0]!.querySelector('[data-testid="fitness-line"]')!)).not.toMatch(
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
    openDetails(rowsOf()[0]!)
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
    expect(screen.getAllByText('Warm days')).toHaveLength(1)
    expect(rowValue(document.body, 'Warm days')).toBe('Adjusted for')
    cleanup()
    renderSection({ run: SLIPPING })
    expect(rowValue(document.body, 'Warm days')).toBeNull()
  })

  it('counts in the athlete’s unit: miles beside the kilometres it reads, none for a metric athlete', () => {
    renderSection({ units: 'imperial' })
    openDetails(rowsOf()[0]!)
    const panel = document.querySelector('.fitness-evidence')!
    expect(spoken(panel)).toMatch(/kilometres 2 to 10 \(from 0\.6 to 6\.2 miles into the run\)/)
    expect(spoken(panel)).toMatch(/changed pace from one kilometre \(0\.6 mi\) to the next/)
    cleanup()
    renderSection({ units: 'metric' })
    openDetails(rowsOf()[0]!)
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
    openDetails(rowsOf()[0]!)
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
    expect(region.querySelector('li.fitness-card')).toBeNull()
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
    // The card on its own is a row titled by the sport and Held; the sport's page holds its section with one line.
    expect(rowNamed('Run · Held')).toHaveAttribute('data-state', 'held')
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
    expect(rowNamed('Run · Slipping')).toBeInTheDocument()
  })
})
