// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LateEvidence } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { Sport } from '@rca/core/types'
import { makeActivity, makeResult } from '../components/fixtures'
import { lateEvidenceFor } from '../lateFixtures'
import { closedRow, openSection } from '../test/openSection'
import { SportPage } from './SportPage'

afterEach(cleanup)

function renderPage(sport: Sport, lateEvidence: LateEvidence) {
  const result = makeResult({
    activities: [makeActivity({ id: `${sport}-1`, sport, name: 'Sunday long' })],
  })
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      trends={NO_TRENDS}
      sameHeartRate={NO_SAME_HEART_RATE[sport]}
      lateEvidence={lateEvidence}
      change={null}
      units="metric"
      massKg={75}
      weighted
      profile={null}
      missingAge={null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={1}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

const notEnough = () => {
  const region = screen.queryByRole('region', { name: 'Not enough yet' })
  return region === null
    ? []
    : within(region)
        .getAllByRole('listitem')
        .map((i) => i.textContent)
}

describe('late in long sessions on a sport page', () => {
  it.each(['run', 'ride'] as const)(
    'is closed on a %s page, and its row says what it found: the stat and what drift did',
    (sport) => {
      renderPage(sport, lateEvidenceFor(sport))
      const row = closedRow('Late in long sessions')
      expect(row).toMatch(/^Late in long sessions/)
      expect(row).toMatch(
        /Best 20 min held \d+% after 90 min; output per heartbeat fell 3% from the first half to the second/,
      )
      expect(
        screen.getByRole('region', { name: 'Late in long sessions' }).querySelector('details'),
      ).not.toHaveAttribute('open')
      // Nothing is drawn while it is closed.
      expect(
        within(screen.getByRole('region', { name: 'Late in long sessions' })).queryAllByRole(
          'figure',
        ),
      ).toHaveLength(0)
      expect(notEnough().filter((line) => line.startsWith('Late in long sessions'))).toEqual([])
    },
  )

  it.each(['run', 'ride'] as const)(
    'draws both charts, each titled by its finding, once it is opened on a %s page',
    (sport) => {
      renderPage(sport, lateEvidenceFor(sport))
      const section = openSection('Late in long sessions')
      const figures = within(section).getAllByRole('figure')
      expect(figures).toHaveLength(2)
      expect(figures[0]).toHaveAccessibleDescription(/^Best 20 min held \d+% after 90 min$/)
      expect(figures[1]).toHaveAccessibleDescription(
        /over an hour, your output per heartbeat fell 3%/,
      )
      expect(
        within(section).getByText(
          /After 90 min your best 20 min is \d+% below your best 20 min overall\./,
        ),
      ).toBeInTheDocument()
    },
  )

  it('keeps the activity count out of the stat', () => {
    renderPage('ride', lateEvidenceFor('ride'))
    expect(closedRow('Late in long sessions')).not.toMatch(/\d+ rides/)
  })

  it('shows the durability alone, and asks for steady efforts with heart rate, when drift is short', () => {
    renderPage('run', {
      ...lateEvidenceFor('run'),
      drift: lateEvidenceFor('run').drift.slice(0, 2),
    })
    expect(closedRow('Late in long sessions')).toMatch(/Best 20 min held \d+% after 90 min$/)
    expect(closedRow('Late in long sessions')).not.toMatch(/heartbeat/)
    const section = openSection('Late in long sessions')
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(notEnough()).toContain(
      'Output per heartbeat over an hour: needs 3 steady runs with heart rate.',
    )
  })

  it('shows the drift alone when no late best has enough activities behind it', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durability: NO_LATE_EVIDENCE.ride.durability })
    expect(closedRow('Late in long sessions')).toMatch(
      /^Late in long sessions\s*Output per heartbeat fell 3%/,
    )
    const section = openSection('Late in long sessions')
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(within(section).queryByText(/overall/)).toBeNull()
    expect(notEnough()).toContain(
      'Best efforts late in long sessions: add 3 rides longer than an hour with a power meter.',
    )
  })

  it('has no row, and says what it needs in the list, with nothing to show', () => {
    renderPage('ride', NO_LATE_EVIDENCE.ride)
    expect(screen.queryByRole('region', { name: 'Late in long sessions' })).toBeNull()
    // One line for each half, each naming the half that is missing and not the whole section.
    expect(
      notEnough().filter((line) => /^(Best efforts late|Output per heartbeat)/.test(line)),
    ).toEqual([
      'Best efforts late in long sessions: add 3 rides longer than an hour with a power meter.',
      'Output per heartbeat over an hour: needs 3 steady rides with a power meter and heart rate.',
    ])
  })

  it('is closed, after the same heart rate in the page’s order', () => {
    renderPage('run', lateEvidenceFor('run'))
    const names = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((name) => name !== null)
    expect(names.indexOf('Late in long sessions')).toBeGreaterThan(-1)
    expect(names.indexOf('Late in long sessions')).toBeLessThan(names.indexOf('All best efforts'))
  })
})
