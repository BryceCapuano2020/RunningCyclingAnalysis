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
import { closedRow } from '../test/openSection'
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

describe('durability on a sport page', () => {
  it.each(['run', 'ride'] as const)(
    'is open on a %s page, and its row says what it found: the stat and what efficiency did',
    (sport) => {
      renderPage(sport, lateEvidenceFor(sport))
      const row = closedRow('Durability')
      expect(row).toMatch(/^Durability/)
      expect(row).toMatch(
        /Best 20 min held \d+% after 90 min\. Efficiency fell 3% from the first half to the second\./,
      )
      const region = screen.getByRole('region', { name: 'Durability' })
      expect(region.querySelector('details')).toHaveAttribute('open')
      // Both charts are drawn from the start, and the page's row does not say them a second time while it is open.
      expect(within(region).getAllByRole('figure')).toHaveLength(2)
      expect(region).toHaveAttribute('data-restated')
    },
  )

  it('draws both charts, each titled by its finding', () => {
    renderPage('run', lateEvidenceFor('run'))
    const section = screen.getByRole('region', { name: 'Durability' })
    const figures = within(section).getAllByRole('figure')
    expect(figures).toHaveLength(2)
    expect(figures[0]).toHaveAccessibleDescription(/^Best 20 min held \d+% after 90 min$/)
    expect(figures[1]).toHaveAccessibleDescription(/over an hour, efficiency fell 3%/)
    expect(
      within(section).getByText(
        /After 90 min your best 20 min is \d+% below your best 20 min overall\./,
      ),
    ).toBeInTheDocument()
  })

  it('says "at least" where no session behind the late bests was shown hard', () => {
    renderPage('run', { ...lateEvidenceFor('run'), ruler: null })
    expect(closedRow('Durability')).toMatch(/Best 20 min held at least \d+% after 90 min\./)
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(within(section).getAllByRole('figure')[0]).toHaveAccessibleDescription(
      /^Best 20 min held at least \d+% after 90 min$/,
    )
  })

  it('names the window in the row when the whole library is read, and dates the drift', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durabilityPooled: true, driftPooled: true })
    expect(closedRow('Durability')).toMatch(/Best 20 min held 94% after 90 min, all time\./)
    expect(closedRow('Durability')).toMatch(
      /Efficiency fell 3% from the first half to the second, January 2025 to March 2025\./,
    )
  })

  it('keeps the activity count out of the stat', () => {
    renderPage('ride', lateEvidenceFor('ride'))
    expect(closedRow('Durability')).not.toMatch(/\d+ rides/)
  })

  it('says which window it read when the period held too few, in each half’s note', () => {
    renderPage('ride', {
      ...lateEvidenceFor('ride'),
      durabilityPooled: true,
      driftPooled: true,
    })
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(
      within(section).getByText(/This period has too few long rides, so this uses all of yours\./),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(
        /This period has too few steady rides, so this uses all of yours\./,
      ),
    ).toBeInTheDocument()
  })

  it('shows the durability alone, and says what drift needs under it, when drift is short', () => {
    renderPage('run', {
      ...lateEvidenceFor('run'),
      drift: lateEvidenceFor('run').drift.slice(0, 2),
    })
    expect(closedRow('Durability')).toMatch(/Best 20 min held \d+% after 90 min\.$/)
    expect(closedRow('Durability')).not.toMatch(/fficiency/)
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(
      within(section).getByText(
        'Heart rate drift needs 3 steady runs over an hour with heart rate.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the drift alone when no late best has enough activities behind it', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durability: NO_LATE_EVIDENCE.ride.durability })
    expect(closedRow('Durability')).toMatch(/^Durability\s*Efficiency fell 3%/)
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(within(section).queryByText(/overall/)).toBeNull()
    expect(
      within(section).getByText('Durability needs 3 rides longer than an hour with a power meter.'),
    ).toBeInTheDocument()
  })

  it('is one line in its place with nothing to show, and says what to add', () => {
    renderPage('ride', NO_LATE_EVIDENCE.ride)
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(section.closest('details')).toBeNull()
    expect(section.querySelector('figure')).toBeNull()
    expect(
      within(section).getByText(
        'Add 3 steady rides over an hour with a power meter and heart rate.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
  })

  it('is after the same heart rate in the page’s order, before the full list', () => {
    renderPage('run', lateEvidenceFor('run'))
    const names = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label'))
      .filter((name) => name !== null)
    expect(names.indexOf('Durability')).toBeGreaterThan(-1)
    expect(names.indexOf('Durability')).toBeLessThan(names.indexOf('All best efforts'))
  })
})
