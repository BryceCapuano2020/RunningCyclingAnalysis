// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import { NO_EFFORT_REFERENCE } from '@rca/core/effort'
import type { ActivitySummary } from '@rca/core/pipeline'
import { DAY_MS } from '@rca/core/constants'
import { makeActivity, makeResult } from '../components/fixtures'
import { gate, UNKNOWN } from '../effortGateFixtures'
import { SportPage } from './SportPage'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(cleanup)

const END = Date.now()

/** A short run in the period: it holds no best from the mile up. */
const SHORT = makeActivity({ id: 'short', sport: 'run', startMs: END - DAY_MS, distanceM: 3000 })

/** A run from earlier in the year with a 10 km best, whose heart rate peaked at an easy or a hard level. */
const earlier = (hard: boolean, daysAgo = 200): ActivitySummary =>
  makeActivity({
    id: 'earlier',
    sport: 'run',
    startMs: END - daysAgo * DAY_MS,
    distanceM: 10_000,
    distanceBests: [{ distanceM: 10_000, seconds: 50 * 60 }],
    maxHeartRate: hard ? 182 : 140,
    hasHeartRate: true,
  })

function renderPage(library: ActivitySummary[], hardIds: string[]) {
  const result = makeResult({
    activities: [SHORT],
    runMaxHeartRate: 190,
    effortGate: { run: gate(), ride: UNKNOWN },
  })
  return render(
    <SportPage
      sport="run"
      result={result}
      previous={null}
      previousLabel={null}
      trends={NO_TRENDS}
      sameHeartRate={NO_SAME_HEART_RATE.run}
      lateEvidence={NO_LATE_EVIDENCE.run}
      change={null}
      units="metric"
      massKg={75}
      weighted
      profile={null}
      missingAge="sex"
      rangeDays={84}
      periodEndMs={END}
      heartRateJudgement={{
        ...NO_HEART_RATE_JUDGEMENT,
        effortReference: {
          ...NO_EFFORT_REFERENCE,
          referenceHr: { run: 190, ride: null },
          reading: { run: 'trusted', ride: null },
        },
        sessions: { run: { hard: hardIds, endurance: [] }, ride: { hard: [], endurance: [] } },
      }}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={library.length}
      library={library}
      onAddFiles={vi.fn()}
    />,
  )
}

describe('the race predictions on a sport page whose period holds no run of a mile', () => {
  it('answers from the last 12 months with the run named by its date, and no bar for a run not shown hard', () => {
    const run = earlier(false)
    const view = renderPage([SHORT, run], [])
    const section = screen.getByRole('region', { name: 'Race predictions' })
    expect(within(section).getByText(/^From your 10 km on \d+ \w+( \d{4})?\.$/)).toBeInTheDocument()
    const rows = Array.from(section.querySelectorAll('.race-row'))
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.querySelector('.race-row__bound')?.textContent).toBe('No slower than')
      expect(row.querySelector('.race-bar')).toBeNull()
    }
    expect(within(section).queryByRole('list', { name: 'Key' })).not.toBeInTheDocument()
    expect(screen.queryByText('Needs a run of a mile or more.')).not.toBeInTheDocument()
    expect(view.container.textContent).not.toMatch(/Needs a hard run|reference heart rate/)
  })

  it('draws the bar and its range once that run reached a hard heart rate', () => {
    const run = earlier(true)
    renderPage([SHORT, run], [run.id])
    const section = screen.getByRole('region', { name: 'Race predictions' })
    expect(section.querySelectorAll('.race-bar')).toHaveLength(4)
    expect(section.querySelector('.race-row__bound')).toBeNull()
    expect(within(section).getByRole('list', { name: 'Key' })).toBeInTheDocument()
  })

  it('tells a run older than 12 months as it was run, with no range, no forecast and no claim of now', () => {
    const run = earlier(true, 600)
    renderPage([SHORT, run], [run.id])
    const section = screen.getByRole('region', { name: 'Race predictions' })
    const year = new Date(run.startMs).getFullYear()
    expect(
      within(section).getByText(new RegExp(`^You ran 50:00 in [A-Z][a-z]{2} ${year}$`)),
    ).toBeInTheDocument()
    expect(within(section).getByText('No run of a mile or more in 12 months.')).toBeInTheDocument()
    expect(section.querySelectorAll('.race-row')).toHaveLength(1)
    expect(section.querySelector('.race-bar, .race-row__time, .race-row__bound')).toBeNull()
    expect(within(section).queryByRole('list', { name: 'Key' })).not.toBeInTheDocument()
    expect(within(section).queryByText('About these predictions')).not.toBeInTheDocument()
    expect(section.textContent).not.toMatch(/No slower than|predicted|can run/i)
  })

  it('says only what to add where the library holds no run of a mile or more', () => {
    renderPage([SHORT], [])
    const section = screen.getByRole('region', { name: 'Race predictions' })
    expect(within(section).getByText('Needs a run of a mile or more.')).toBeInTheDocument()
    expect(section.querySelector('.race-row')).toBeNull()
  })
})
