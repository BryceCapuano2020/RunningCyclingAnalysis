// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import type { EarnedRecord } from '@rca/core/records'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { DURATIONS_S } from '@rca/core/constants'
import { curveOf, curvePoint } from '../charts/fixtures'
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
    expect(marksOf('Best 5 min')).toContain('All-time record')
    expect(marksOf('Best 5 km')).toContain('All-time record')
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

/** A curve whose points are held by the activity named for each duration, as `[value, id]`. */
function curveHeldBy(held: Record<number, [number, string]>) {
  return DURATIONS_S.map((durationS) => {
    const point = held[durationS]
    return point === undefined
      ? curvePoint(durationS, NaN, null)
      : curvePoint(durationS, point[0], point[1])
  })
}

/** Renders any activity with the activities and curves the period holds. */
function renderFor(
  activity: ActivitySummary,
  result: AnalysisResult,
  options: { period?: Period; earned?: EarnedRecord[]; weightKnown?: boolean; inPeriod?: boolean },
) {
  const { period, earned = [], weightKnown = true, inPeriod = true } = options
  return render(
    <ActivityBests
      activity={activity}
      result={result}
      units="metric"
      massKg={70}
      weightKnown={weightKnown}
      profile={null}
      inPeriod={inPeriod}
      period={period}
      earned={earned}
      splitsLoad={{ status: 'loaded', splits: null }}
      splitsView="units"
    />,
  )
}

describe('the marks follow who holds the best', () => {
  it('gives no period mark to a distance time that another run in the period beats', () => {
    const faster = makeActivity({
      id: 'activity-2',
      sport: 'run',
      distanceBests: [{ distanceM: 5000, seconds: 1200 }],
    })
    renderFor(run, makeResult({ activities: [run, faster] }), { period: TWELVE_MONTHS })
    expect(marksOf('Best 5 km')).toEqual([])
    // Nothing beats its 10 km, so that one is the period's best.
    expect(marksOf('Best 10 km')).toContain('Best in the last 12 months')
  })

  it('gives a tie at a distance to the earlier run, as the records do', () => {
    const tied = (id: string, startMs: number) =>
      makeActivity({
        id,
        sport: 'run',
        startMs,
        distanceBests: [{ distanceM: 5000, seconds: 1300 }],
      })
    const earlier = tied('activity-1', 1_000_000)
    const later = tied('activity-2', 2_000_000)
    const result = makeResult({ activities: [later, earlier] })
    renderFor(earlier, result, { period: TWELVE_MONTHS })
    expect(marksOf('Best 5 km')).toContain('Best in the last 12 months')
    cleanup()
    renderFor(later, result, { period: TWELVE_MONTHS })
    expect(marksOf('Best 5 km')).toEqual([])
  })

  it('lists no duration another activity holds the best of in the period', () => {
    const result = makeResult({
      activities: [run],
      runCurve: curveHeldBy({ 300: [16, 'activity-2'], 1200: [14.2, 'activity-1'] }),
    })
    renderFor(run, result, { period: TWELVE_MONTHS })
    expect(screen.queryByText('Best 5 min', { selector: '.records__label' })).toBeNull()
    expect(marksOf('Best 20 min')).toContain('Best in the last 12 months')
  })

  it('names the sport page without asking for All time when the period already is all time', () => {
    // The chips say this run holds the 5 min record, though the period's curve gives the best to another.
    const result = makeResult({
      activities: [run],
      runCurve: curveHeldBy({ 300: [16, 'activity-2'] }),
    })
    renderFor(run, result, { period: ALL_TIME, earned: [{ kind: 'duration', durationS: 300 }] })
    expect(screen.getByText(/All-time records here: Best 5 min\. See the/)).toBeInTheDocument()
    expect(screen.queryByText(/Choose All time/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run page' })).toHaveAttribute('href', '#/run')
  })
})

describe('a ride’s best efforts', () => {
  const ride = makeActivity({ id: 'activity-1', name: 'Hill ride', sport: 'ride' })
  const rideResult = makeResult({
    activities: [ride],
    rideCurve: curveOf({ 60: 1400, 300: 1230, 1200: 1050 }),
  })
  const earned: EarnedRecord[] = [
    { kind: 'duration', durationS: 60 },
    { kind: 'duration', durationS: 300 },
  ]

  it('marks an all-time record beside Estimated, and names the period for the rest', () => {
    renderFor(ride, rideResult, { period: TWELVE_MONTHS, earned })
    expect(marksOf('Best 5 min')).toEqual(['Estimated', 'All-time record'])
    expect(marksOf('Best 20 min')).toEqual(['Estimated', 'Best in the last 12 months'])
  })

  it('marks only the records that have a chip, so the one-minute best is the period’s', () => {
    renderFor(ride, rideResult, { period: TWELVE_MONTHS, earned })
    expect(marksOf('Best 1 min')).toEqual(['Estimated', 'Best in the last 12 months'])
  })

  it('names all-time records outside the period with a link to the Ride page', () => {
    renderFor(ride, makeResult({ activities: [] }), {
      period: TWELVE_MONTHS,
      earned,
      inPeriod: false,
    })
    expect(screen.getByText(/All-time records here: Best 5 min\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ride page' })).toHaveAttribute('href', '#/ride')
  })

  it('waits for the weight, and marks nothing until it is entered', () => {
    renderFor(ride, rideResult, { period: TWELVE_MONTHS, earned, weightKnown: false })
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByText('All-time record')).not.toBeInTheDocument()
    expect(screen.queryByText('Best 5 min')).not.toBeInTheDocument()
  })
})
