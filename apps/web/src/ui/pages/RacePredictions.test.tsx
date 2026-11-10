// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { makeActivity, makeResult } from '../components/test/fixtures'
import type { RaceWindow } from '../raceAnswer'
import { raceAnswerOf } from '../raceAnswer'
import { forecastOf } from '../test/raceForecast'
import { distanceRecords } from '../records'
import type { DistanceRecord } from '../records'
import { rowValue } from '../test/propertyRows'
import { RacePredictions } from './RacePredictions'
import { ranBests } from './raceRan'

const withBests = makeActivity({
  id: 'r1',
  sport: 'run',
  distanceM: 10_000,
  distanceBests: [
    { distanceM: 5000, seconds: 21 * 60 },
    { distanceM: 10000, seconds: 44 * 60 },
  ],
})

/** The run's predictions for a result, drawn the way the sport page draws them. */
function renderPredictions(
  result: AnalysisResult,
  window: RaceWindow = 'period',
  records: readonly Pick<DistanceRecord, 'distanceM' | 'seconds' | 'activity'>[] = [],
) {
  const answer = forecastOf(raceAnswerOf('run', result, window === 'all' ? null : 84))
  const { found, basis } = answer
  // The page hands the section the recorded bests that sit off its predictions; `records` come first, as a
  // best the predictions were not worked out from (a run the effort gate left out).
  const ran = ranBests(
    found,
    [...records, ...distanceRecords(result.activities, 'metric').records],
    RAN_OPENED_AT,
  )
  return render(
    <RacePredictions
      sport="run"
      found={found}
      units="metric"
      window={window}
      basis={basis}
      openedAt={RAN_OPENED_AT}
      ran={ran}
    />,
  )
}

/** The day the page opened, and a run the day before it. */
const RAN_OPENED_AT = new Date(2026, 10, 30, 12).getTime()
const RAN_AT = new Date(2026, 10, 27, 8).getTime()

/** Opens "About these predictions", as a press on its summary does: the notes mount once it has been opened. */
function openAbout() {
  const details = screen.getByText('About these predictions').closest('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
}

describe('RacePredictions', () => {
  afterEach(cleanup)

  it('shows each race as a row of its name and pace, a bar and its time at the right', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    renderPredictions(result)
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('race-row'))
    expect(rows.map((row) => row.querySelector('.race-row__race')?.textContent)).toEqual([
      '5 km',
      '10 km',
      'Half marathon',
      'Marathon',
    ])
    expect(rows[0]!.querySelector('.race-row__pace')?.textContent).toMatch(/^\d:\d\d \/km$/)
    expect(rows[0]!.querySelector('.race-row__time')?.textContent).toMatch(/^\d+:\d\d$/)
    expect(rows[3]!.querySelector('.race-row__time')?.textContent).toMatch(/^\d:\d\d:\d\d$/)
    // The spread's two ends are printed on the bar.
    expect(rows[0]!.querySelectorAll('.race-bar__end')).toHaveLength(2)
  })

  it('names each bar for a screen reader by the time, its range and both estimates', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    renderPredictions(result)
    const bar = screen.getAllByRole('img', { name: /^5 km predicted/ })[0]!
    expect(bar.getAttribute('aria-label')).toMatch(
      /^5 km predicted \d+:\d\d, range \d+:\d\d to \d+:\d\d\. from your best runs \d+:\d\d, from heart rate \d+:\d\d\.$/,
    )
  })

  it('draws a triangle above the bar for the runs and one below for heart rate, and only the one there is', () => {
    const both = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    const view = renderPredictions(both)
    const first = view.container.querySelector('.race-row')!
    expect(first.querySelectorAll('.race-bar__mark--above')).toHaveLength(1)
    expect(first.querySelectorAll('.race-bar__mark--below')).toHaveLength(1)
    view.unmount()
    const runsOnly = renderPredictions(makeResult({ activities: [withBests] }))
    const only = runsOnly.container.querySelector('.race-row')!
    expect(only.querySelectorAll('.race-bar__mark--above')).toHaveLength(1)
    expect(only.querySelectorAll('.race-bar__mark--below')).toHaveLength(0)
  })

  it('draws the prediction between the spread’s caps, never outside them', () => {
    const view = renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 } }),
    )
    for (const bar of Array.from(view.container.querySelectorAll('.race-bar'))) {
      const caps = Array.from(bar.querySelectorAll('.race-bar__cap')).map((cap) =>
        Number.parseFloat((cap as HTMLElement).style.left),
      )
      const dot = Number.parseFloat((bar.querySelector('.race-bar__dot') as HTMLElement).style.left)
      expect(dot).toBeGreaterThan(caps[0]!)
      expect(dot).toBeLessThan(caps[1]!)
    }
  })

  it('keys each shape above the rows, naming the VO2max the heart-rate triangle comes from', () => {
    renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 } }),
    )
    const key = screen.getByRole('list', { name: 'Key' })
    expect(key.compareDocumentPosition(document.querySelector('.race-rows')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(key.closest('details')).toBeNull()
    const entries = within(key).getAllByRole('listitem')
    expect(entries.slice(0, 3).map((li) => li.textContent)).toEqual([
      'Prediction',
      'From your runs',
      'Heart rate (VO2max 50)',
    ])
    // The range is the one term defined in place: pressed, it says what the range is.
    expect(within(entries[3]!).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    expect(within(entries[3]!).getByRole('note')).toHaveTextContent(
      /10th to the 90th percentile of the typical error/,
    )
  })

  it('calls the spread a range, never an assumed spread or a confidence interval', () => {
    const view = renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 62, runs: 5, hillCapped: 0 } }),
    )
    openAbout()
    const text = view.container.textContent ?? ''
    expect(text).toMatch(/\brange\b/i)
    expect(text).not.toMatch(/spread|confidence/i)
  })

  it('keeps the explanation, the table of every figure and where each estimate came from behind About these predictions', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    renderPredictions(result)
    // Closed: none of it is mounted.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    openAbout()
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Race', 'Pace', 'Predicted', 'Range', 'Best runs', 'Heart rate'])
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getAllByRole('cell')[2]!.textContent).toMatch(/^\d+:\d\d to \d+:\d\d$/)
    expect(rowValue(document.body, '5 km, best runs')).toMatch(/^2[01]:\d\d$/)
    expect(rowValue(document.body, '5 km, heart rate')).toMatch(/^\d+:\d\d$/)
    // VO2max is given once, as a number; no row is a sentence and there is no "For" row.
    expect(rowValue(document.body, 'VO2max')).toBe('50')
    expect(rowValue(document.body, 'For')).toBeNull()
    expect(document.body.textContent).not.toMatch(/mostly from|flat course/)
    expect(screen.queryByText(/middle of two estimates/)).not.toBeInTheDocument()
  })

  it('says the run the times were carried from inside About these predictions, and no line under the title', () => {
    const dated = makeActivity({ ...withBests, startMs: RAN_AT })
    renderPredictions(makeResult({ activities: [dated] }))
    expect(rowValue(document.body, 'Based on')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Race predictions' }).nextElementSibling).toBeNull()
    openAbout()
    expect(rowValue(document.body, 'Based on')).toBe('5 km, 27 Nov')
    const line = screen.getByText('Based on')
    expect(line.closest('details')).toBe(
      screen.getByText('About these predictions').closest('details'),
    )
  })

  it('carries a race from the outdoor run, not from a faster indoor run', () => {
    const treadmill = makeActivity({
      id: 'r2',
      sport: 'run',
      indoor: true,
      distanceM: 10_000,
      distanceBests: [{ distanceM: 10000, seconds: 38 * 60 }],
    })
    const found = (activities: (typeof withBests)[]) =>
      forecastOf(raceAnswerOf('run', makeResult({ activities }), null)).found
    const both = found([withBests, treadmill])
    const outdoorOnly = found([withBests])
    // The treadmill's distance still counts as weekly volume, which only the marathon reads.
    expect(both?.runsVdot).toBe(outdoorOnly?.runsVdot)
    expect(both?.races.slice(0, 3)).toEqual(outdoorOnly?.races.slice(0, 3))
    expect(raceAnswerOf('run', makeResult({ activities: [treadmill] }), null)).toBeNull()
  })

  it('gives no VO2max row where no estimate uses heart rate', () => {
    renderPredictions(makeResult({ activities: [withBests] }))
    openAbout()
    expect(rowValue(document.body, 'VO2max')).toBeNull()
    expect(screen.queryByText(/alone/)).not.toBeInTheDocument()
  })

  it('says All time uses your best period, and a dated period does not', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    const view = renderPredictions(result, 'all')
    openAbout()
    expect(rowValue(document.body, 'All time')).toBe('Your best period')
    view.unmount()

    renderPredictions(result)
    openAbout()
    expect(rowValue(document.body, 'All time')).toBeNull()
    expect(rowValue(document.body, 'For')).toBeNull()
  })

  it('says the same of All time with no heart rate behind the times', () => {
    renderPredictions(makeResult({ activities: [withBests] }), 'all')
    openAbout()
    expect(rowValue(document.body, 'All time')).toBe('Your best period')
  })

  describe('a forecast from runs none of which was shown hard', () => {
    const found = forecastOf(raceAnswerOf('run', makeResult({ activities: [withBests] }), 84)).found

    const renderBound = (window: RaceWindow = 'period') =>
      render(
        <RacePredictions
          sport="run"
          found={found}
          units="metric"
          window={window}
          bound
          openedAt={RAN_OPENED_AT}
        />,
      )

    it('prints each time as the row’s figure with no bar, no key and no range column', () => {
      const view = renderBound()
      const rows = Array.from(view.container.querySelectorAll('.race-row'))
      expect(rows).toHaveLength(found.races.length)
      for (const row of rows) {
        expect(row.querySelector('.race-row__time')?.textContent).toMatch(/^\d+:\d\d(:\d\d)?$/)
        expect(row.querySelector('.race-bar')).toBeNull()
      }
      expect(screen.queryByRole('list', { name: 'Key' })).not.toBeInTheDocument()
      openAbout()
      const table = screen.getByRole('table', { name: 'Race predictions and each estimate' })
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((th) => th.textContent),
      ).toEqual(['Race', 'Pace', 'Predicted', 'Best runs', 'Heart rate'])
    })

    it.each([
      ['period', 'None in this period'],
      ['year', 'None in the last 12 months'],
      ['all', 'None in your files'],
    ] as const)(
      'says in the disclosure, for %s, that the runs were not shown hard',
      (window, start) => {
        renderBound(window)
        expect(rowValue(document.body, 'Runs shown hard')).toBeNull()
        openAbout()
        expect(rowValue(document.body, 'Runs shown hard')).toBe(start)
      },
    )

    it('says nothing of it for a forecast from hard runs, which keeps its bar and key', () => {
      const view = renderPredictions(makeResult({ activities: [withBests] }))
      expect(view.container.querySelectorAll('.race-bar')).toHaveLength(found.races.length)
      openAbout()
      expect(screen.getByRole('list', { name: 'Key' })).toBeInTheDocument()
      expect(rowValue(document.body, 'Runs shown hard')).toBeNull()
      expect(screen.getByRole('columnheader', { name: 'Range' })).toBeInTheDocument()
    })
  })

  it('says nothing of how far the runs and the heart rate disagree: the key shows both', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 62, runs: 5, hillCapped: 3 },
    })
    renderPredictions(result)
    openAbout()
    expect(screen.getByText('Heart rate (VO2max 62)')).toBeInTheDocument()
    expect(screen.queryByText(/points to more|hilly runs|wide/)).not.toBeInTheDocument()
  })

  it('finds none for a sport without a predictor, or without evidence', () => {
    expect(raceAnswerOf('ride', makeResult({ activities: [withBests] }), null)).toBeNull()
    expect(raceAnswerOf('run', makeResult(), null)).toBeNull()
  })

  describe('a recorded best off the prediction', () => {
    // The 10 km already run in 40:07 is a floor for the prediction. A faster 10 km the predictions were not
    // worked out from (a run the effort gate left out) is a run the row says was run.
    const quick = makeActivity({
      id: 'r3',
      sport: 'run',
      startMs: RAN_AT,
      distanceM: 10_000,
      distanceBests: [
        { distanceM: 5000, seconds: 19 * 60 },
        { distanceM: 10000, seconds: 40 * 60 + 7 },
      ],
    })
    const slowHeartRate = makeResult({
      activities: [quick],
      runVo2max: { vo2max: 38, runs: 4, hillCapped: 0 },
    })
    const easy = { distanceM: 10_000, seconds: 38 * 60, activity: quick }

    it('puts a prediction no slower than a time already run at the distance', () => {
      const found = forecastOf(raceAnswerOf('run', slowHeartRate, null)).found
      const ten = found.races.find((r) => r.distanceM === 10_000)!
      expect(ten.seconds).toBeLessThanOrEqual(40 * 60 + 7)
      expect(ten.methods.every((m) => m.seconds <= 40 * 60 + 7)).toBe(true)
      expect(ten.high).toBeGreaterThan(ten.seconds)
      expect(ten.floored).toBe(true)
    })

    it('labels a floored row Your best, with no note about holding the prediction at it', () => {
      const view = renderPredictions(slowHeartRate)
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      expect(row.querySelector('.race-row__ran')?.textContent).toBe('Your best')
      expect(row.querySelector('.race-bar')?.getAttribute('aria-label')).toMatch(/Your best\.$/)
      openAbout()
      expect(screen.queryByText(/held at that time/)).not.toBeInTheDocument()
    })

    it('says what was run and when on the row, and marks it as a dot labelled Run on the bar', () => {
      const view = renderPredictions(slowHeartRate, 'period', [easy])
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      // One meta line: the pace, then the recorded best.
      expect(row.querySelector('.race-row__meta')?.textContent).toMatch(
        /^\d:\d\d \/km · ran 38:00, 27 Nov$/,
      )
      expect(row.querySelectorAll('.race-row__name > *')).toHaveLength(2)
      expect(row.querySelector('.race-bar__ran-label')?.textContent).toBe('Run')
      expect(row.querySelectorAll('.race-bar__ran')).toHaveLength(1)
      expect(row.querySelector('.race-bar')?.getAttribute('aria-label')).toMatch(
        /You ran 38:00 on 27 Nov\.$/,
      )
      // Placed quicker than the prediction on the bar: left of the prediction's dot.
      const at = (cls: string) =>
        Number.parseFloat((row.querySelector(cls) as HTMLElement).style.left)
      expect(at('.race-bar__ran')).toBeLessThan(at('.race-bar__dot'))
    })

    it('keys the dot above the rows and repeats the run in the table', () => {
      renderPredictions(slowHeartRate, 'period', [easy])
      expect(
        within(screen.getByRole('list', { name: 'Key' })).getByText('Your best'),
      ).toBeInTheDocument()
      openAbout()
      const table = screen.getByRole('table')
      expect(within(table).getByRole('columnheader', { name: 'Your best' })).toBeInTheDocument()
      expect(within(table).getByText('38:00 on 27 Nov')).toBeInTheDocument()
    })

    it('says a best slower than the whole range asks for more than has been run, with no dot', () => {
      // Heart rate alone carries a fast 10 km that the only 10 km run (50:00) does not support.
      const slow = { distanceM: 10_000, seconds: 50 * 60, activity: quick }
      const fast = makeResult({
        activities: [quick],
        runVo2max: { vo2max: 62, runs: 4, hillCapped: 0 },
      })
      const view = renderPredictions(fast, 'period', [slow])
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      expect(row.querySelector('.race-row__ran')?.textContent).toBe(
        'best 50:00, 27 Nov, slower than this range',
      )
      expect(row.querySelector('.race-bar__ran')).toBeNull()
      expect(within(screen.getByRole('list', { name: 'Key' })).queryByText('Your best')).toBeNull()
    })

    it('shows nothing of a run that is neither faster than its prediction nor outside its range', () => {
      const view = renderPredictions(makeResult({ activities: [withBests] }))
      // The 10 km is held to the 10 km already run; that is the only note on any row.
      expect(
        Array.from(view.container.querySelectorAll('.race-row__ran')).map((el) => el.textContent),
      ).toEqual(['Your best'])
      expect(view.container.querySelector('.race-bar__ran')).toBeNull()
      expect(within(screen.getByRole('list', { name: 'Key' })).queryByText('Your best')).toBeNull()
      openAbout()
      expect(screen.queryByRole('columnheader', { name: 'Your best' })).not.toBeInTheDocument()
    })
  })
})
