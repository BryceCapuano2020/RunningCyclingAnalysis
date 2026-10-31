// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { makeActivity, makeResult } from '../components/fixtures'
import { racePredictionsOf } from '../racePredictions'
import { distanceRecords } from '../records'
import type { DistanceRecord } from '../records'
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
  allTime = false,
  records: readonly Pick<DistanceRecord, 'distanceM' | 'seconds' | 'activity'>[] = [],
) {
  const found = racePredictionsOf('run', result)
  if (found === null) throw new Error('the result gives no predictions')
  // The page hands the section the recorded bests that sit off its predictions; `records` come first, as a
  // best the predictions were not worked out from (a run the effort gate left out).
  const ran = ranBests(
    found,
    [...records, ...distanceRecords(result.activities, 'metric').records],
    RAN_OPENED_AT,
  )
  return render(
    <RacePredictions sport="run" found={found} units="metric" allTime={allTime} ran={ran} />,
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

  it('names each bar for a screen reader by the time, its assumed spread and both estimates', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    renderPredictions(result)
    const bar = screen.getAllByRole('img', { name: /^5 km predicted/ })[0]!
    expect(bar.getAttribute('aria-label')).toMatch(
      /^5 km predicted \d+:\d\d, assumed spread \d+:\d\d to \d+:\d\d\. from your best runs \d+:\d\d, from heart rate \d+:\d\d\.$/,
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

  it('keys each shape, naming the VO2max the heart-rate triangle comes from', () => {
    renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 } }),
    )
    const key = screen.getByRole('list', { name: 'Key' })
    const entries = within(key).getAllByRole('listitem')
    expect(entries.slice(0, 3).map((li) => li.textContent)).toEqual([
      'Prediction',
      'From your runs',
      'From heart rate (VO2max 50)',
    ])
    // The spread is the one term defined in place: pressed, it says what the spread is.
    expect(within(entries[3]!).getByRole('button', { name: 'Assumed spread' })).toBeInTheDocument()
    expect(within(entries[3]!).getByRole('note')).toHaveTextContent(
      /10th to 90th percentile of an assumed error/,
    )
  })

  it('calls the spread an assumed spread, never a range or a confidence interval', () => {
    const view = renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 62, runs: 5, hillCapped: 0 } }),
    )
    openAbout()
    const text = view.container.textContent ?? ''
    expect(text).toMatch(/assumed spread/i)
    expect(text).not.toMatch(/\brange\b|confidence/i)
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
    ).toEqual([
      'Race',
      'Pace',
      'Predicted',
      'Assumed spread',
      'From your best runs',
      'From heart rate',
    ])
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getAllByRole('cell')[2]!.textContent).toMatch(/^\d+:\d\d to \d+:\d\d$/)
    expect(
      screen.getByText(/^From your best runs: 2[01]:\d\d, mostly from your best 5 km$/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /a VO2max of 50 would run, from your heart rate against pace on 4 hard runs/,
      ),
    ).toBeInTheDocument()
  })

  it('says under the title that it is the middle of two estimates, or the one there is', () => {
    const both = renderPredictions(
      makeResult({ activities: [withBests], runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 } }),
    )
    expect(
      screen.getByText('The middle of two estimates, for a flat course on a good day.'),
    ).toBeInTheDocument()
    both.unmount()
    renderPredictions(makeResult({ activities: [withBests] }))
    expect(
      screen.getByText('From your best times in this period, for a flat course on a good day.'),
    ).toBeInTheDocument()
  })

  it('carries a race from the outdoor run, not from a faster indoor run', () => {
    const treadmill = makeActivity({
      id: 'r2',
      sport: 'run',
      indoor: true,
      distanceM: 10_000,
      distanceBests: [{ distanceM: 10000, seconds: 38 * 60 }],
    })
    const both = racePredictionsOf('run', makeResult({ activities: [withBests, treadmill] }))
    const outdoorOnly = racePredictionsOf('run', makeResult({ activities: [withBests] }))
    // The treadmill's distance still counts as weekly volume, which only the marathon reads.
    expect(both?.runsVdot).toBe(outdoorOnly?.runsVdot)
    expect(both?.races.slice(0, 3)).toEqual(outdoorOnly?.races.slice(0, 3))
    expect(racePredictionsOf('run', makeResult({ activities: [treadmill] }))).toBeNull()
  })

  it('says it rests on the runs alone without heart rate', () => {
    const result = makeResult({ activities: [withBests] })
    renderPredictions(result)
    openAbout()
    expect(screen.getByText(/^From your best times in this period alone/)).toBeInTheDocument()
  })

  it('says All time reflects your best period, and a dated period does not', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    const view = renderPredictions(result, true)
    openAbout()
    expect(screen.getByText(/your best times on file, carried to the distance/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /In All time they reflect your best period\. A shorter period shows your recent form\.$/,
      ),
    ).toBeInTheDocument()
    view.unmount()

    renderPredictions(result, false)
    openAbout()
    expect(screen.queryByText(/best period/)).not.toBeInTheDocument()
    expect(screen.getByText(/your best times in this period, carried/)).toBeInTheDocument()
  })

  it('names the best period for runs alone in All time too', () => {
    renderPredictions(makeResult({ activities: [withBests] }), true)
    openAbout()
    expect(
      screen.getByText(
        /^From your best times on file alone, for a flat course on a good day\. In All time they reflect your best period/,
      ),
    ).toBeInTheDocument()
  })

  it('says when heart rate points to more than the runs show', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 62, runs: 5, hillCapped: 0 },
    })
    renderPredictions(result)
    openAbout()
    expect(
      screen.getByText(
        /Your heart rate points to more than your best runs show \(about 62 against \d\d in VO2max terms\)/,
      ),
    ).toBeInTheDocument()
  })

  it('finds none for a sport without a predictor, or without evidence', () => {
    expect(racePredictionsOf('ride', makeResult({ activities: [withBests] }))).toBeNull()
    expect(racePredictionsOf('run', makeResult())).toBeNull()
  })

  it('says how many hilly runs were left out of the heart-rate side', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 3 },
    })
    renderPredictions(result)
    openAbout()
    expect(screen.getByText(/3 hilly runs left out of the heart-rate side/)).toBeInTheDocument()
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
      const found = racePredictionsOf('run', slowHeartRate)!
      const ten = found.races.find((r) => r.distanceM === 10_000)!
      expect(ten.seconds).toBeLessThanOrEqual(40 * 60 + 7)
      expect(ten.methods.every((m) => m.seconds <= 40 * 60 + 7)).toBe(true)
      expect(ten.high).toBeGreaterThan(ten.seconds)
      expect(ten.floored).toBe(true)
    })

    it('says a floored row is no slower than a time run, and the method note says a time run is the limit', () => {
      const view = renderPredictions(slowHeartRate)
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      expect(row.querySelector('.race-row__ran')?.textContent).toBe(
        'No slower than a time you have run',
      )
      expect(row.querySelector('.race-bar')?.getAttribute('aria-label')).toMatch(
        /No slower than a time you have run\.$/,
      )
      openAbout()
      expect(screen.getByText(/the prediction is no slower than that time/)).toBeInTheDocument()
    })

    it('says what was run and when on the row, and marks it as a dot labelled Run on the bar', () => {
      const view = renderPredictions(slowHeartRate, false, [easy])
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      expect(row.querySelector('.race-row__ran')?.textContent).toBe('You ran 38:00 on 27 Nov')
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

    it('keys the dot and repeats the run in the table', () => {
      renderPredictions(slowHeartRate, false, [easy])
      expect(
        within(screen.getByRole('list', { name: 'Key' })).getByText(/^Run:/),
      ).toBeInTheDocument()
      openAbout()
      const table = screen.getByRole('table')
      expect(
        within(table).getByRole('columnheader', { name: 'Recorded best, off the prediction' }),
      ).toBeInTheDocument()
      expect(within(table).getByText('38:00 on 27 Nov')).toBeInTheDocument()
    })

    it('says a best slower than the whole spread asks for more than has been run, with no dot', () => {
      // Heart rate alone carries a fast 10 km that the only 10 km run (50:00) does not support.
      const slow = { distanceM: 10_000, seconds: 50 * 60, activity: quick }
      const fast = makeResult({
        activities: [quick],
        runVo2max: { vo2max: 62, runs: 4, hillCapped: 0 },
      })
      const view = renderPredictions(fast, false, [slow])
      const row = Array.from(view.container.querySelectorAll('.race-row')).find(
        (el) => el.querySelector('.race-row__race')?.textContent === '10 km',
      )!
      expect(row.querySelector('.race-row__ran')?.textContent).toBe(
        'Your best is 50:00, from 27 Nov, slower than this spread',
      )
      expect(row.querySelector('.race-bar__ran')).toBeNull()
      expect(screen.queryByText(/^Run:/)).not.toBeInTheDocument()
    })

    it('shows nothing of a run that is neither faster than its prediction nor outside its spread', () => {
      const view = renderPredictions(makeResult({ activities: [withBests] }))
      // The 10 km is held to the 10 km already run; that is the only note on any row.
      expect(
        Array.from(view.container.querySelectorAll('.race-row__ran')).map((el) => el.textContent),
      ).toEqual(['No slower than a time you have run'])
      expect(view.container.querySelector('.race-bar__ran')).toBeNull()
      expect(screen.queryByText(/^Run:/)).not.toBeInTheDocument()
      openAbout()
      expect(screen.queryByRole('columnheader', { name: /Recorded best/ })).not.toBeInTheDocument()
    })
  })
})
