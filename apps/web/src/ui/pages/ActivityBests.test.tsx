// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import type { EarnedRecord } from '@rca/core/records'
import type { AnalysisResult } from '@rca/core/pipeline'
import { curveOf } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { ActivityBests } from './ActivityBests'

afterEach(() => {
  cleanup()
})

const SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}
const TWELVE_MONTHS: Period = { ...SIX_WEEKS, choice: 365, days: 365 }
const ALL_TIME: Period = { ...SIX_WEEKS, choice: 'all', days: null }
const CUSTOM: Period = {
  ...SIX_WEEKS,
  choice: { from: '2025-05-12', to: '2025-08-03' },
  days: 84,
}

const run = makeActivity({
  id: 'activity-1',
  name: 'Morning run',
  sport: 'run',
  distanceBests: [
    { distanceM: 5000, seconds: 1300 },
    { distanceM: 10000, seconds: 2700 },
  ],
})

/** The period's curve has the run at 5 and 20 minutes. */
const periodResult: AnalysisResult = makeResult({
  activities: [run],
  runCurve: curveOf({ 300: 15.6, 1200: 14.2 }),
})

const EARNED: EarnedRecord[] = [
  { kind: 'duration', durationS: 300 },
  { kind: 'distance', distanceM: 5000 },
]

function renderBests(
  options: { period?: Period; earned?: EarnedRecord[]; inPeriod?: boolean } = {},
) {
  const { period, earned = EARNED, inPeriod = true } = options
  return render(
    <ActivityBests
      activity={run}
      result={inPeriod ? periodResult : makeResult({ activities: [] })}
      units="metric"
      massKg={70}
      weightKnown
      profile={null}
      inPeriod={inPeriod}
      period={period}
      earned={earned}
      splitsLoad={{ status: 'loaded', splits: null }}
      splitsView="units"
    />,
  )
}

/** The marks on the row of a best, such as "Best 5 min". */
function marksOf(label: string): string[] {
  const row = screen.getByText(label, { selector: '.records__label' }).closest('li')
  if (row === null) throw new Error(`No best named ${label}`)
  return within(row)
    .queryAllByText(/./, { selector: '.chip' })
    .map((chip) => chip.textContent ?? '')
}

describe('the activity page’s best efforts', () => {
  it('marks an all-time record and names the period for a best that is only the period’s', () => {
    renderBests({ period: TWELVE_MONTHS })
    expect(marksOf('Best 5 min')).toContain('All-time record')
    expect(marksOf('Best 5 min')).not.toContain('Best in the last 12 months')
    expect(marksOf('Best 20 min')).toContain('Best in the last 12 months')
    expect(marksOf('Best 20 min')).not.toContain('All-time record')
  })

  it('names a 6-week period and a custom range in its own words', () => {
    renderBests({ period: SIX_WEEKS })
    expect(marksOf('Best 20 min')).toContain('Best in the last 6 weeks')
    cleanup()
    renderBests({ period: CUSTOM })
    expect(marksOf('Best 20 min')).toContain('Best between 12 May and 3 Aug 2025')
  })

  it('names no period when it is all time, where a best is an all-time record or nothing more', () => {
    renderBests({ period: ALL_TIME })
    expect(marksOf('Best 5 min')).toEqual(expect.arrayContaining(['All-time record']))
    expect(marksOf('Best 20 min')).not.toContainEqual(expect.stringMatching(/Best (in|between)/))
  })

  it('marks run distance times as all-time records or the period’s best, and leaves other times plain', () => {
    renderBests({ period: TWELVE_MONTHS })
    expect(marksOf('Best 5 km')).toContain('All-time record')
    // This run is also the only 10 km in the period, though it holds no all-time record there.
    expect(marksOf('Best 10 km')).toContain('Best in the last 12 months')
    cleanup()
    renderBests({ period: undefined })
    expect(marksOf('Best 10 km')).toEqual([])
  })

  it('shows the same all-time records whichever period the page holds', () => {
    for (const period of [SIX_WEEKS, TWELVE_MONTHS, ALL_TIME, CUSTOM, undefined]) {
      renderBests({ period })
      expect(marksOf('Best 5 min')).toContain('All-time record')
      expect(marksOf('Best 5 km')).toContain('All-time record')
      cleanup()
    }
  })

  it('outside the period lists its distance times and names its all-time records, without a period', () => {
    renderBests({ period: TWELVE_MONTHS, inPeriod: false })
    expect(marksOf('Best 5 km')).toContain('All-time record')
    expect(marksOf('Best 10 km')).toEqual([])
    expect(screen.getByText(/All-time records here: Best 5 min\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run page' })).toHaveAttribute('href', '#/run')
    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Outside/)).not.toBeInTheDocument()
    expect(screen.queryByText(/12 months/)).not.toBeInTheDocument()
  })

  it('says nothing outside the period when the activity holds no record and has no distance time', () => {
    const plain = makeActivity({ id: 'activity-2', sport: 'run' })
    const { container } = render(
      <ActivityBests
        activity={plain}
        result={makeResult({ activities: [] })}
        units="metric"
        massKg={70}
        weightKnown
        profile={null}
        inPeriod={false}
        period={TWELVE_MONTHS}
        earned={[]}
        splitsLoad={{ status: 'loaded', splits: null }}
        splitsView="units"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
