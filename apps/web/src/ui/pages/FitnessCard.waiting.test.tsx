// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import {
  FITNESS_AS_OF_MS,
  FITNESS_LIBRARY,
  FITNESS_RIDE_LIBRARY,
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
      nowMs={FITNESS_AS_OF_MS}
      fitness={{ run, ride: NO_FITNESS.ride }}
      units="metric"
      library={FITNESS_LIBRARY}
      {...rest}
    />,
  )
}

/** The fitness rows on the page, one for each sport, in order. */
const rowsOf = () => [...document.querySelectorAll('li.fitness-card')] as HTMLElement[]

/** A row by its title: the sport alone for a ride waiting on the home page, else the sport and state, or the state. */
const rowNamed = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

/** A row's one line under its title. */
const lineOf = (row: Element) => row.querySelector('[data-testid="fitness-line"]') as HTMLElement

/** A line's text with the no-break space a pace keeps before its unit read as a space. */
const textOf = (node: Element) => (node.textContent ?? '').replace(/\u00a0/g, ' ')

/** What a row's Details hold, opened as a press opens them; empty when the row has none. */
function detailsOf(row: Element): string {
  const details = row.querySelector('details')
  if (details === null) return ''
  details.open = true
  fireEvent(details, new Event('toggle'))
  return spoken(details.querySelector('.disclosure__body')!)
}

/** A status that cannot call a trend tells its level, and what a trend needs, in place of a change. */
describe('FitnessSection for a sport that cannot call a trend', () => {
  it('tells a ride that cannot call a trend as a row titled Ride on the home page, its level its one line, and by its state on the Ride page', () => {
    const waiting = waitingStatus(
      { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
      7,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: waiting }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(rowsOf()).toHaveLength(2)
    const ride = rowNamed('Ride')
    // The level without its range, every figure with its spaces, and no link: the rail has Ride.
    expect(lineOf(ride).textContent).toBe('200 W at 140 bpm.')
    expect(within(ride).queryByRole('link')).toBeNull()
    expect(spoken(ride)).not.toMatch(/Ride fitness|not enough|of 12/)
    const held = detailsOf(ride)
    expect(held).toContain('200 W (194 to 206) at 140 bpm.')
    expect(held).toContain('From 7 steady rides.')
    cleanup()
    // The Ride page titles the row by its state, with the level and what a trend needs in its Details.
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: waiting }}
        units="metric"
        library={FITNESS_LIBRARY}
        sport="ride"
      />,
    )
    const card = rowNamed('No trend yet')
    expect(lineOf(card).textContent).toBe('200 W at 140 bpm.')
    const details = detailsOf(card)
    expect(details).toContain('200 W (194 to 206) at 140 bpm.')
    expect(details).toContain('From 7 steady rides.')
    expect(screen.getByTestId('fitness-needs')).toHaveTextContent(
      '5 more earlier rides to see a trend.',
    )
  })

  it('tells a ride that has too few recent rides, or whose range is too wide, as its level on the home page too', () => {
    const recent = waitingStatus({ kind: 'recent', have: 2, need: 4, weeks: 8 }, 30, 'ride')
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: NO_FITNESS.run, ride: recent }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    expect(rowsOf()).toHaveLength(1)
    expect(lineOf(rowNamed('Ride')).textContent).toBe('200 W at 140 bpm.')
    expect(detailsOf(rowNamed('Ride'))).toContain('From 30 steady rides.')
    cleanup()
    const imprecise = waitingStatus({ kind: 'imprecise', within: 0.07 }, 33, 'ride')
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: imprecise }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
      />,
    )
    const ride = rowNamed('Ride')
    expect(lineOf(ride).textContent).toBe('200 W at 140 bpm.')
    expect(detailsOf(ride)).toContain('From 33 steady rides.')
    expect(spoken(ride)).not.toMatch(/uncertain|not enough|of \d+ /)
  })

  it('dates the level of a break, and says what a trend needs, in the row’s Details', () => {
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{
          run: waitingStatus({ kind: 'break', weeksSince: 9 }, 40),
          ride: NO_FITNESS.ride,
        }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    const card = rowNamed('Run · No trend yet')
    expect(textOf(lineOf(card))).toMatch(/^\d:\d{2} \/km at 150 bpm in October\.$/)
    const details = detailsOf(card)
    expect(details).toContain('(4:54 to 5:13) at 150 bpm in October.')
    expect(details).toContain('From 40 steady runs.')
    expect(screen.getByTestId('fitness-needs')).toHaveTextContent(
      'A steady run in the last 4 weeks to see a trend.',
    )
    expect(spoken(card)).not.toMatch(BANNED)
  })

  it('is a row whose one line is its count, for a sport with fewer than 3 steady activities, on the home page and its own', () => {
    const few = waitingStatus(
      { kind: 'history', have: 2, need: 12, weeks: 2, needWeeks: 8 },
      2,
      'ride',
    )
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: few }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(rowsOf()).toHaveLength(2)
    const ride = rowNamed('Ride')
    expect(lineOf(ride)).toHaveTextContent(/^2 steady rides with a power meter so far\.$/)
    expect(within(ride).queryByRole('link')).toBeNull()
    cleanup()
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{ run: SLIPPING, ride: few }}
        units="metric"
        library={FITNESS_RIDE_LIBRARY}
        sport="ride"
      />,
    )
    expect(rowsOf()).toHaveLength(1)
    expect(lineOf(rowsOf()[0]!)).toHaveTextContent(/^2 steady rides with a power meter so far\.$/)
    cleanup()
    // A run is the same: its row's line is the count it has.
    render(
      <FitnessSection
        nowMs={FITNESS_AS_OF_MS}
        fitness={{
          run: waitingStatus({ kind: 'history', have: 1, need: 12, weeks: 1, needWeeks: 8 }, 1),
          ride: NO_FITNESS.ride,
        }}
        units="metric"
        library={FITNESS_LIBRARY}
      />,
    )
    expect(rowsOf()).toHaveLength(1)
    expect(lineOf(rowNamed('Run'))).toHaveTextContent(/^1 steady run with heart rate so far\.$/)
  })

  it('tells a run that cannot call a trend as a row: its level its one line, the runs behind it and what a trend needs in its Details, with no track and no evidence', () => {
    const { container } = renderSection({
      run: waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
    })
    const card = rowNamed('Run · No trend yet')
    expect(textOf(lineOf(card))).toBe('5:03 /km at 150 bpm.')
    const words = detailsOf(card)
    expect(words).toContain('5:03 /km (4:54 to 5:13) at 150 bpm.')
    expect(words).toContain('From 7 steady runs.')
    expect(words).toContain('5 more earlier runs to see a trend.')
    expect(spoken(card)).not.toMatch(BANNED)
    expect(spoken(card)).not.toMatch(/slower|faster|%/)
    expect(container.querySelector('.fitness-progress')).toBeNull()
    expect(container.querySelector('.fitness-track')).toBeNull()
    expect(container.querySelector('.fitness-evidence')).toBeNull()
  })

  it('defines the heart rate and the range of a level in place, in its Details', () => {
    renderSection({
      run: waitingStatus({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 }),
    })
    const card = rowsOf()[0]!
    detailsOf(card)
    const terms = within(card.querySelector('details')!)
      .getAllByRole('button', { expanded: false })
      .map((button) => button.textContent)
    expect(terms).toEqual(['(4:54 to 5:13)', 'at 150 bpm', 'steady runs'])
  })
})
