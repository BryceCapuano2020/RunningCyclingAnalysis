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
import { wholeText } from '../test/wholeText'

afterEach(cleanup)

/** The section by its heading, which is the durability finding, or the drift's where there is no durability. */
const DURABILITY = /^Durability: /
const DRIFT = /^Heart rate drift: /

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
    'is open on a %s page, headed by its finding, and its row says both: durability and heart rate drift',
    (sport) => {
      renderPage(sport, lateEvidenceFor(sport))
      const row = closedRow(DURABILITY)
      expect(row).toMatch(
        /^Durability: \d+% of your best 20 min after 90 min\.Heart rate drift: efficiency fell 3%\.$/,
      )
      const region = screen.getByRole('region', { name: DURABILITY })
      expect(region.querySelector('details')).toHaveAttribute('open')
      // Both charts are drawn from the start, and the page's row does not say the drift a second time while it is open.
      expect(within(region).getAllByRole('figure')).toHaveLength(2)
      expect(region).toHaveAttribute('data-restated')
      // The finding is said once on screen: the heading, not the heading and the chart's headline.
      expect(within(region).getAllByText(DURABILITY)).toHaveLength(1)
    },
  )

  it('draws both charts, the first under the section’s heading and the second titled by its finding', () => {
    renderPage('run', lateEvidenceFor('run'))
    const section = screen.getByRole('region', { name: DURABILITY })
    expect(section).toHaveAccessibleName(/^Durability: \d+% of your best 20 min after 90 min\.$/)
    const figures = within(section).getAllByRole('figure')
    expect(figures).toHaveLength(2)
    expect(figures[1]).toHaveAccessibleDescription('Heart rate drift: efficiency fell 3%.')
    // Each chart's eyebrow and headline say the one term.
    expect(figures[0]).toHaveAccessibleName('Durability of best efforts')
    expect(figures[1]).toHaveAccessibleName('Heart rate drift on steady runs')
    // The charts say their finding once and no sentence under them says it again or says how it is made.
    expect(within(section).queryByText(/overall\./)).toBeNull()
    expect(within(section).queryByText(/warm-up|Heat, hydration|peaked at/)).toBeNull()
    expect(section.querySelector('p.muted')).toBeNull()
  })

  it('says "at least" where no session behind the late bests was shown hard', () => {
    renderPage('run', { ...lateEvidenceFor('run'), ruler: null })
    expect(closedRow(DURABILITY)).toMatch(
      /^Durability: at least \d+% of your best 20 min after 90 min\./,
    )
  })

  it('names the window in the row when the whole library is read, for each half', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durabilityPooled: true, driftPooled: true })
    expect(closedRow(DURABILITY)).toMatch(
      /Durability: 94% of your best 20 min after 90 min, all time\.Heart rate drift: efficiency fell 3%, all time\.$/,
    )
  })

  it('keeps the activity count out of the stat', () => {
    renderPage('ride', lateEvidenceFor('ride'))
    expect(closedRow(DURABILITY)).not.toMatch(/\d+ rides/)
  })

  it('shows the durability alone, and says what the library has of drift under it, when drift is short', () => {
    renderPage('run', {
      ...lateEvidenceFor('run'),
      drift: lateEvidenceFor('run').drift.slice(0, 2),
    })
    expect(closedRow(DURABILITY)).toMatch(/^Durability: \d+% of your best 20 min after 90 min\.$/)
    expect(closedRow(DURABILITY)).not.toMatch(/drift/i)
    const section = screen.getByRole('region', { name: DURABILITY })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(
      within(section).getByText(
        wholeText('Heart rate drift: 2 of 3 steady runs over an hour with heart rate.'),
      ),
    ).toBeInTheDocument()
  })

  it('shows the drift alone when no late best has enough activities behind it', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durability: NO_LATE_EVIDENCE.ride.durability })
    expect(closedRow(DRIFT)).toBe('Heart rate drift: efficiency fell 3%.')
    const section = screen.getByRole('region', { name: DRIFT })
    // The drift's finding heads the section, so its chart does not set it again.
    expect(within(section).getAllByText(DRIFT)).toHaveLength(1)
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(within(section).queryByText(/overall/)).toBeNull()
    expect(
      within(section).getByText(
        wholeText('Durability: 0 of 3 rides longer than an hour with a power meter.'),
      ),
    ).toBeInTheDocument()
  })

  it('is one line in its place with nothing to show, and says what the library has', () => {
    renderPage('ride', NO_LATE_EVIDENCE.ride)
    const section = screen.getByRole('region', { name: 'Durability' })
    expect(section.closest('details')).toBeNull()
    expect(section.querySelector('figure')).toBeNull()
    expect(
      within(section).getByText(
        wholeText('0 of 3 steady rides over an hour with a power meter and heart rate.'),
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
    const durability = names.findIndex((name) => DURABILITY.test(name))
    expect(durability).toBeGreaterThan(-1)
    expect(durability).toBeLessThan(names.indexOf('All best efforts'))
  })
})
