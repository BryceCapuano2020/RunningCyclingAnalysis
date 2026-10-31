// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { closedRow, openSection } from '../test/openSection'
import { SportPage } from './SportPage'

afterEach(cleanup)

function renderPage(sport: Sport, result: AnalysisResult, weighted = true) {
  const inLibrary = result.activities.filter((activity) => activity.sport === sport).length
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
      profile={null}
      missingAge={null}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={inLibrary}
      library={result.activities}
      onAddFiles={vi.fn()}
    />,
  )
}

/** The page's second-level headings, in the order they are read. */
function headings(): string[] {
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '')
}

describe('the stand-out finding on a sport page', () => {
  const ride = makeResult({
    activities: profileActivities('ride', 'measured'),
    rideCurve: profileCurve(),
    rideMeasuredCurve: profileCurve(),
  })
  const run = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })

  it('is a closed section whose row says the finding, and whose strip opens behind it, on a ride', () => {
    renderPage('ride', ride)
    expect(closedRow('Where your bests stand out')).toMatch(
      /^Where your bests stand outYour bests are in line with each other/,
    )
    const section = screen.getByRole('region', { name: 'Where your bests stand out' })
    expect(section.querySelector('details')).not.toHaveAttribute('open')
    expect(headings()).not.toContain('Where your bests stand out')
    // The curve's card no longer carries it as a caption.
    expect(
      within(screen.getByRole('region', { name: 'Best efforts' })).queryByText(
        /in line with each other/,
      ),
    ).toBeNull()
  })

  it('draws its strip only once it is opened, and only where a best stands out', () => {
    const standing = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve((durationS, value) => (durationS === 60 ? value * 1.15 : value)),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : value,
      ),
    })
    renderPage('ride', standing)
    const region = screen.getByRole('region', { name: 'Where your bests stand out' })
    expect(within(region).queryByRole('figure')).toBeNull()
    openSection('Where your bests stand out')
    expect(within(region).getByRole('figure')).toBeInTheDocument()
  })

  it('is on a run page too', () => {
    renderPage('run', run)
    expect(closedRow('Where your bests stand out')).toMatch(
      /Your bests are in line with each other/,
    )
  })

  it('names what a ride needs when its measured bests are too few, in the list at the end', () => {
    renderPage(
      'ride',
      makeResult({ activities: profileActivities('ride', 'measured'), rideCurve: profileCurve() }),
    )
    const list = screen.getByRole('region', { name: 'Not enough yet' })
    expect(
      within(list).getByText(/^Where your bests stand out: .*with a power meter\.$/),
    ).toBeInTheDocument()
  })

  it('is left out while a ride waits for the body weight, and for a sport with no activities', () => {
    renderPage('ride', ride, false)
    expect(screen.queryByRole('region', { name: 'Where your bests stand out' })).toBeNull()
    cleanup()
    renderPage('run', makeResult({ activities: [] }))
    expect(screen.queryByRole('region', { name: 'Where your bests stand out' })).toBeNull()
    expect(screen.queryByText('Not enough yet')).toBeNull()
  })
})
