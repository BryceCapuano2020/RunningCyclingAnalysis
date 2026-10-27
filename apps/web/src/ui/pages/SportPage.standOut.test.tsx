// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
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
      windowDays={14}
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

describe('the stand-out section on a sport page', () => {
  const ride = makeResult({
    activities: profileActivities('ride', 'measured'),
    rideCurve: profileCurve(),
    rideMeasuredCurve: profileCurve(),
  })
  const run = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })

  it('follows the best efforts and comes before the week-by-week trend, on a ride', () => {
    renderPage('ride', ride)
    const order = headings()
    expect(order.indexOf('Where your bests stand out')).toBe(order.indexOf('Best efforts') + 1)
    expect(order.indexOf('Week by week')).toBe(order.indexOf('Where your bests stand out') + 1)
  })

  it('is on a run page too', () => {
    renderPage('run', run)
    expect(headings()).toContain('Where your bests stand out')
    expect(screen.getByText(/^Your bests are in line with each other/)).toBeInTheDocument()
  })

  it('names what a ride needs when its measured bests are too few', () => {
    renderPage(
      'ride',
      makeResult({ activities: profileActivities('ride', 'measured'), rideCurve: profileCurve() }),
    )
    expect(screen.getByText(/with a power meter$/)).toBeInTheDocument()
  })

  it('is left out while a ride waits for the body weight, and for a sport with no activities', () => {
    renderPage('ride', ride, false)
    expect(headings()).not.toContain('Where your bests stand out')
    cleanup()
    renderPage('run', makeResult({ activities: [] }))
    expect(screen.queryByText('Where your bests stand out')).toBeNull()
  })
})
