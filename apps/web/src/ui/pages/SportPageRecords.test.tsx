// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SportCurves } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  makeActivity,
  makeResult,
} from '../components/fixtures'
import type { AgeGap, AgeProfile } from '../grades'
import { SportPage } from './SportPage'
import { changeOf } from '../charts/changeFixtures'

afterEach(() => {
  cleanup()
})

/** Renders a sport page over a previous period, with the library the earlier best is looked up in. */
function renderPage(
  sport: 'run' | 'ride',
  result: AnalysisResult,
  previous: SportCurves | null = null,
  library: ActivitySummary[] = result.activities,
  profile: AgeProfile | null = null,
) {
  const missingAge: AgeGap | null = profile === null ? 'year of birth and sex' : null
  return render(
    <SportPage
      sport={sport}
      result={result}
      previous={previous}
      previousLabel={previous === null ? null : 'Previous 6 weeks'}
      change={previous === null ? null : changeOf('higher')}
      units="metric"
      massKg={75}
      weighted
      profile={profile}
      missingAge={missingAge}
      rangeDays={42}
      controls={<span>Period picker</span>}
      emptyText="Nothing in this period."
      inLibrary={library.length}
      library={library}
      onAddFiles={vi.fn()}
    />,
  )
}

describe('the level on the sport page', () => {
  it('is the threshold’s alone: the curve states its best 20 min by its figure, with no level beside it', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    renderPage(
      'run',
      makeResult({
        activities: [run],
        runCurve: [
          curvePoint(300, FIVE_K_IN_20_MIN_WKG * 1.05, 'run-1'),
          curvePoint(1200, FIVE_K_IN_20_MIN_WKG, 'run-1'),
        ],
      }),
      null,
      [run],
      MAN_BORN_1986,
    )

    // The level panel states the grade at the threshold, with its level.
    const panel = screen.getByTestId('hero-level')
    expect(panel).toHaveTextContent(
      /Recreational|Active|Trained|Club|Local|Regional|National|World/,
    )
    const figure = screen.getByRole('figure', { name: 'Best effort by duration' })
    expect(figure).toHaveTextContent(/\d+:\d{2} \/km/)
    expect(figure).not.toHaveAccessibleDescription()
    expect(figure).not.toHaveTextContent(
      /Best 20 min: [^A-Z]*(Recreational|Active|Trained|Club|Local|Regional|National|World)/,
    )
  })
})
