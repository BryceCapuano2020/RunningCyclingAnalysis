// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { closedRow } from '../test/openSection'
import { SportPage } from './SportPage'

afterEach(cleanup)

interface Extras {
  weighted?: boolean
  libraryBests?: Curve | null
  inLibrary?: number
  library?: ActivitySummary[]
}

function renderPage(sport: Sport, result: AnalysisResult, extras: Extras = {}) {
  const { weighted = true, libraryBests = null, library = result.activities } = extras
  const inLibrary =
    extras.inLibrary ?? result.activities.filter((activity) => activity.sport === sport).length
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={null}
      previousLabel={null}
      trends={NO_TRENDS}
      sameHeartRate={NO_SAME_HEART_RATE[sport]}
      lateEvidence={NO_LATE_EVIDENCE[sport]}
      change={null}
      units="metric"
      massKg={75}
      weighted={weighted}
      libraryBests={libraryBests}
      profile={null}
      missingAge={null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={inLibrary}
      library={library}
      onAddFiles={vi.fn()}
    />,
  )
}

/** The page's second-level headings, in the order they are read. */
function headings(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '')
}

describe('the best durations on a sport page', () => {
  const ride = makeResult({
    activities: profileActivities('ride', 'measured'),
    rideCurve: profileCurve(),
    rideMeasuredCurve: profileCurve(),
  })
  const run = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })

  it('is an open section whose row says the finding, on a ride', () => {
    renderPage('ride', ride)
    expect(closedRow('Best durations')).toBe('Best durationsNothing stands out.')
    const section = screen.getByRole('region', { name: 'Best durations' })
    expect(section.querySelector('details')).toHaveAttribute('open')
    expect(headings()).not.toContain('Best durations')
    // The curve's card does not carry it as a caption.
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).queryByText(/stands out/),
    ).toBeNull()
  })

  it('draws its strip from the start, and only where a best stands out', () => {
    const standing = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve((durationS, value) => (durationS === 60 ? value * 1.15 : value)),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : value,
      ),
    })
    renderPage('ride', standing)
    const region = screen.getByRole('region', { name: 'Best durations' })
    expect(within(region).getByRole('figure')).toBeInTheDocument()
    cleanup()
    renderPage('ride', ride)
    expect(
      within(screen.getByRole('region', { name: 'Best durations' })).queryByRole('figure'),
    ).toBeNull()
  })

  it('is on a run page too', () => {
    renderPage('run', run)
    expect(closedRow('Best durations')).toBe('Best durationsNothing stands out.')
  })

  it('names what a ride needs when its measured bests are too few, as one line in its own place', () => {
    renderPage(
      'ride',
      makeResult({ activities: profileActivities('ride', 'measured'), rideCurve: profileCurve() }),
    )
    const region = screen.getByRole('region', { name: 'Best durations' })
    expect(region.closest('details')).toBeNull()
    expect(within(region).getByText(/^Needs .*with a power meter\.$/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Not enough yet' })).toBeNull()
  })

  it('reads the library’s bests for a period short of activities, and says so in a few words', () => {
    const few = makeResult({
      activities: profileActivities('run', 'none', 12),
      runCurve: profileCurve(),
    })
    const bests = profileCurve((durationS, value) => (durationS === 1200 ? value * 1.3 : value))
    renderPage('run', few, {
      libraryBests: bests,
      inLibrary: 60,
      library: profileActivities('run', 'none', 60),
    })
    const region = screen.getByRole('region', { name: 'Best durations' })
    // The row's own sentence names the window.
    expect(closedRow('Best durations')).toMatch(/Your all-time 20 min best is \d+% above/)
    expect(within(region).getByRole('figure')).toBeInTheDocument()
  })

  it('says nothing of the library when the period has enough of its own', () => {
    renderPage('run', run, {
      libraryBests: profileCurve(),
      inLibrary: 80,
      library: profileActivities('run', 'none', 80),
    })
    expect(closedRow('Best durations')).not.toMatch(/all-time/)
  })

  it('says nothing stands out, and never that the bests are in line, for a small library read as all time', () => {
    const few = makeResult({
      activities: profileActivities('run', 'none', 12),
      runCurve: profileCurve(),
    })
    renderPage('run', few, {
      libraryBests: profileCurve(),
      inLibrary: 20,
      library: profileActivities('run', 'none', 20),
    })
    expect(closedRow('Best durations')).toBe('Best durationsNothing stands out.')
    expect(closedRow('Best durations')).not.toMatch(/in line/)
  })

  it('is left out while a ride waits for the body weight, and for a sport with no activities', () => {
    renderPage('ride', ride, { weighted: false })
    expect(screen.queryByRole('region', { name: 'Best durations' })).toBeNull()
    cleanup()
    renderPage('run', makeResult({ activities: [] }))
    expect(screen.queryByRole('region', { name: 'Best durations' })).toBeNull()
    expect(screen.queryByText('Not enough yet')).toBeNull()
  })
})
