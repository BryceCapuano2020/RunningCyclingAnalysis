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

describe('the best durations on a sport page', () => {
  const ride = makeResult({
    activities: profileActivities('ride', 'measured'),
    rideCurve: profileCurve(),
    rideMeasuredCurve: profileCurve(),
  })
  const run = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })

  /** The page's "On this page" buttons, by name. */
  const navItems = () =>
    within(screen.getByRole('navigation', { name: 'On this page' }))
      .queryAllByRole('button')
      .map((button) => button.textContent)

  /** A ride whose best minute stands out from the rest of its curve. */
  const standing = makeResult({
    activities: profileActivities('ride', 'measured'),
    rideCurve: profileCurve((durationS, value) => (durationS === 60 ? value * 1.15 : value)),
    rideMeasuredCurve: profileCurve((durationS, value) =>
      durationS === 60 ? value * 1.15 : value,
    ),
  })

  it('is left out when it names no duration, with no place in On this page and no "Nothing stands out"', () => {
    renderPage('ride', ride)
    expect(screen.queryByRole('region', { name: 'Best durations' })).toBeNull()
    expect(screen.queryByText(/stands out/)).toBeNull()
    expect(navItems()).not.toContain('Best durations')
    // The page still has its other sections.
    expect(screen.getByRole('region', { name: 'Best efforts' })).toBeInTheDocument()
  })

  it('takes the finding as its heading where a best stands out, open, with its strip and its place in On this page', () => {
    renderPage('ride', standing)
    const region = screen.getByRole('region', { name: /^Your 1 min best is \d+% above/ })
    expect(closedRow(/^Your 1 min best is/)).toMatch(
      /^Your 1 min best is \d+% above what your other bests suggest\.$/,
    )
    expect(region.querySelector('details')).toHaveAttribute('open')
    expect(within(region).getByRole('figure')).toBeInTheDocument()
    expect(navItems()).toContain('Best durations')
    // The curve's card does not carry it as a caption.
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).queryByText(/stands out/),
    ).toBeNull()
  })

  it('is on a run page too, and left out there when nothing stands out', () => {
    renderPage(
      'run',
      makeResult({
        activities: profileActivities('run'),
        runCurve: profileCurve((durationS, value) => (durationS === 1200 ? value * 1.3 : value)),
      }),
    )
    expect(
      screen.getByRole('region', { name: /^Your 20 min best is \d+% above/ }),
    ).toBeInTheDocument()
    cleanup()
    renderPage('run', run)
    expect(screen.queryByText(/stands out/)).toBeNull()
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

  it('reads the library’s bests for a period short of activities, and says so in its heading', () => {
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
    // The heading's own sentence names the window.
    const region = screen.getByRole('region', { name: /^Your all-time 20 min best is \d+% above/ })
    expect(within(region).getByRole('figure')).toBeInTheDocument()
  })

  it('says nothing of the library when the period has enough of its own', () => {
    renderPage(
      'run',
      makeResult({
        activities: profileActivities('run'),
        runCurve: profileCurve((durationS, value) => (durationS === 1200 ? value * 1.3 : value)),
      }),
      {
        libraryBests: profileCurve((durationS, value) => (durationS === 60 ? value * 1.3 : value)),
        inLibrary: 80,
        library: profileActivities('run', 'none', 80),
      },
    )
    expect(screen.getByRole('region', { name: /^Your 20 min best is/ })).toBeInTheDocument()
    expect(screen.queryByText(/all-time/)).toBeNull()
  })

  it('is left out, never saying the bests are in line, for a small library read as all time with nothing standing out', () => {
    const few = makeResult({
      activities: profileActivities('run', 'none', 12),
      runCurve: profileCurve(),
    })
    renderPage('run', few, {
      libraryBests: profileCurve(),
      inLibrary: 20,
      library: profileActivities('run', 'none', 20),
    })
    expect(screen.queryByRole('region', { name: 'Best durations' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/in line|stands out/)
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
