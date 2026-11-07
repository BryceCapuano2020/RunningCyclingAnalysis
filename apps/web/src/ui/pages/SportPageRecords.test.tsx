// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SportCurves } from '@rca/core/digest'
import { NO_LATE_EVIDENCE } from '@rca/core/digest/lateEvidenceTypes'
import { NO_SAME_HEART_RATE } from '@rca/core/digest/sameHeartRateTypes'
import { NO_TRENDS } from '@rca/core/digest/trendPoints'
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
import { wholeText } from '../test/wholeText'

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
      trends={NO_TRENDS}
      sameHeartRate={NO_SAME_HEART_RATE[sport]}
      lateEvidence={NO_LATE_EVIDENCE[sport]}
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

/** The record list item for one duration in All best efforts, found by its label such as "1 min". */
function recordNamed(eyebrow: string): HTMLElement {
  const records = screen.getByRole('region', { name: 'All best efforts' })
  const item = within(records).getByText(eyebrow).closest('li')
  if (item === null) throw new Error(`No record named ${eyebrow}`)
  return item
}

const EARLIER_ON = new Date(2025, 11, 1, 7, 30).getTime()

describe('the change on the period before', () => {
  it('shows the change between two measured rides', () => {
    const now = makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'measured' })
    const earlier = makeActivity({
      id: 'ride-0',
      sport: 'ride',
      name: 'Old ride',
      powerSource: 'measured',
      startMs: EARLIER_ON,
    })
    const previous: SportCurves = { runCurve: [], rideCurve: [curvePoint(60, 250, 'ride-0')] }
    renderPage(
      'ride',
      makeResult({ activities: [now], rideCurve: [curvePoint(60, 258, 'ride-1')] }),
      previous,
      [now, earlier],
    )

    expect(
      within(recordNamed('1 min')).getByText(wholeText('8 W more than previous 6 weeks')),
    ).toBeInTheDocument()
  })

  it('leaves the change out when the current ride’s watts are estimated', () => {
    const now = makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' })
    const earlier = makeActivity({
      id: 'ride-0',
      sport: 'ride',
      name: 'Old ride',
      powerSource: 'measured',
      startMs: EARLIER_ON,
    })
    const previous: SportCurves = { runCurve: [], rideCurve: [curvePoint(60, 250, 'ride-0')] }
    renderPage(
      'ride',
      makeResult({ activities: [now], rideCurve: [curvePoint(60, 258, 'ride-1')] }),
      previous,
      [now, earlier],
    )

    expect(within(recordNamed('1 min')).queryByText(wholeText(/previous 6 weeks/))).toBeNull()
  })

  it('leaves the change out when the earlier best was estimated', () => {
    const now = makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'measured' })
    const earlier = makeActivity({
      id: 'ride-0',
      sport: 'ride',
      name: 'Old ride',
      powerSource: 'virtual',
      startMs: EARLIER_ON,
    })
    const previous: SportCurves = { runCurve: [], rideCurve: [curvePoint(60, 250, 'ride-0')] }
    renderPage(
      'ride',
      makeResult({ activities: [now], rideCurve: [curvePoint(60, 258, 'ride-1')] }),
      previous,
      [now, earlier],
    )

    expect(within(recordNamed('1 min')).queryByText(wholeText(/previous 6 weeks/))).toBeNull()
  })

  it('still shows a run’s change, since a run’s pace is never estimated', () => {
    const now = makeActivity({ id: 'run-1', sport: 'run' })
    const earlier = makeActivity({
      id: 'run-0',
      sport: 'run',
      name: 'Old run',
      startMs: EARLIER_ON,
    })
    const previous: SportCurves = { runCurve: [curvePoint(300, 14, 'run-0')], rideCurve: [] }
    renderPage(
      'run',
      makeResult({ activities: [now], runCurve: [curvePoint(300, 14.5, 'run-1')] }),
      previous,
      [now, earlier],
    )

    expect(
      within(recordNamed('5 min')).getByText(wholeText(/faster than previous 6 weeks/)),
    ).toBeInTheDocument()
  })
})

describe('an indoor run on the sport page', () => {
  it('holds no distance record, so the slower outdoor run holds the 10 km', () => {
    const indoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      indoor: true,
      name: 'Indoor run',
      distanceBests: [{ distanceM: 10000, seconds: 2250 }],
    })
    const outdoor = makeActivity({
      id: 'run-2',
      sport: 'run',
      name: 'Morning run',
      distanceBests: [{ distanceM: 10000, seconds: 2400 }],
    })
    renderPage('run', makeResult({ activities: [indoor, outdoor] }))

    const item = recordNamed('10 km')
    expect(within(item).getByText(wholeText('40:00'))).toBeInTheDocument()
    expect(within(item).queryByText('Indoor')).toBeNull()
  })

  it('leaves the 10 km without a record when only an indoor run ran it', () => {
    const indoor = makeActivity({
      id: 'run-1',
      sport: 'run',
      indoor: true,
      name: 'Indoor run',
      distanceBests: [{ distanceM: 10000, seconds: 2250 }],
    })
    renderPage('run', makeResult({ activities: [indoor] }))

    expect(screen.queryByText(wholeText('10 km'))).toBeNull()
  })
})

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
    const panel = screen.getByRole('region', { name: 'Age grade at threshold' })
    expect(panel).toHaveTextContent(/Recreational|Local|Regional|National|World/)
    const figure = screen.getByRole('figure', { name: 'Best effort by duration' })
    expect(figure).toHaveTextContent(/\d+:\d{2} \/km/)
    expect(figure).not.toHaveAccessibleDescription()
    expect(figure).not.toHaveTextContent(
      /Best 20 min: [^A-Z]*(Recreational|Local|Regional|National|World)/,
    )
  })
})
