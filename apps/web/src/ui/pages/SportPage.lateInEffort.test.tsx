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
      windowDays={28}
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
    'leads with both ledes and draws both charts on a %s page',
    (sport) => {
      renderPage(sport, lateEvidenceFor(sport))
      const section = screen.getByRole('region', { name: 'Late in long sessions' })
      expect(
        within(section).getByText(
          /^After 90 min your best 20 min is \d+% below your best 20 min overall\.$/,
        ),
      ).toBeInTheDocument()
      expect(
        within(section).getByText(/over an hour, your output per heartbeat fell 3%/),
      ).toBeInTheDocument()
      expect(within(section).getAllByRole('figure')).toHaveLength(2)
      expect(notEnough().filter((line) => line.startsWith('Late in long sessions'))).toEqual([])
    },
  )

  it('keeps the activity count out of the lede', () => {
    renderPage('ride', lateEvidenceFor('ride'))
    const lede = screen.getByText(/^After 90 min your best 20 min/)
    expect(lede.textContent).not.toMatch(/\d+ rides/)
  })

  it('shows the durability alone, and asks for steady efforts with heart rate, when drift is short', () => {
    renderPage('run', {
      ...lateEvidenceFor('run'),
      drift: lateEvidenceFor('run').drift.slice(0, 2),
    })
    const section = screen.getByRole('region', { name: 'Late in long sessions' })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(notEnough()).toContain(
      'Late in long sessions: needs 3 steady runs over an hour with heart rate to show how output per heartbeat changes.',
    )
  })

  it('shows the drift alone when no late best has enough activities behind it', () => {
    renderPage('ride', { ...lateEvidenceFor('ride'), durability: NO_LATE_EVIDENCE.ride.durability })
    const section = screen.getByRole('region', { name: 'Late in long sessions' })
    expect(within(section).getAllByRole('figure')).toHaveLength(1)
    expect(within(section).queryByText(/overall/)).toBeNull()
    expect(notEnough()).toContain(
      'Late in long sessions: add 3 rides longer than an hour with a power meter.',
    )
  })

  it('has no heading, and says what it needs in the list, with nothing to show', () => {
    renderPage('ride', NO_LATE_EVIDENCE.ride)
    expect(screen.queryByRole('heading', { name: 'Late in long sessions' })).toBeNull()
    expect(notEnough()).toContain(
      'Late in long sessions: add 3 rides longer than an hour with a power meter. Needs 3 steady rides over an hour with a power meter and heart rate to show how output per heartbeat changes.',
    )
  })

  it('is the last section, after the same heart rate', () => {
    renderPage('run', lateEvidenceFor('run'))
    const names = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((name) => name !== 'Not enough yet')
    expect(names.at(-1)).toBe('Late in long sessions')
  })
})
