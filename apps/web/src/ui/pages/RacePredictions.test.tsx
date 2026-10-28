// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { makeActivity, makeResult } from '../components/fixtures'
import { racePredictionsOf } from '../racePredictions'
import { RacePredictions } from './RacePredictions'

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
function renderPredictions(result: AnalysisResult, allTime = false) {
  const found = racePredictionsOf('run', result)
  if (found === null) throw new Error('the result gives no predictions')
  return render(<RacePredictions sport="run" found={found} units="metric" allTime={allTime} />)
}

describe('RacePredictions', () => {
  afterEach(cleanup)

  it('shows each race with its time, pace and likely range', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    renderPredictions(result)
    const table = screen.getAllByRole('table')[0]!
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('.race-table__name')?.textContent)).toEqual([
      '5 km',
      '10 km',
      'Half marathon',
      'Marathon',
    ])
    expect(within(rows[0]!).getByText(/^likely \d+:\d\d to \d+:\d\d$/)).toBeInTheDocument()
    expect(within(rows[0]!).getByText(/^runs \d+:\d\d · heart rate \d+:\d\d$/)).toBeInTheDocument()
    const details = screen.getByText(/Show the evidence/).closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(
      screen.getByText('From your best runs: 20:57, carried from your best 10 km'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /a VO2max of 50 would run, from your heart rate against pace on 4 hard runs/,
      ),
    ).toBeInTheDocument()
  })

  it('says it rests on the runs alone without heart rate', () => {
    const result = makeResult({ activities: [withBests] })
    renderPredictions(result)
    expect(screen.getByText(/^From your best times in this period alone/)).toBeInTheDocument()
  })

  it('says All time reflects your best period, and a dated period does not', () => {
    const result = makeResult({
      activities: [withBests],
      runVo2max: { vo2max: 50, runs: 4, hillCapped: 0 },
    })
    const view = renderPredictions(result, true)
    expect(screen.getByText(/your best times on file, carried to the distance/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /In All time they reflect your best period\. A shorter period shows your recent form\.$/,
      ),
    ).toBeInTheDocument()
    view.unmount()

    renderPredictions(result, false)
    expect(screen.queryByText(/best period/)).not.toBeInTheDocument()
    expect(screen.getByText(/your best times in this period, carried/)).toBeInTheDocument()
  })

  it('names the best period for runs alone in All time too', () => {
    renderPredictions(makeResult({ activities: [withBests] }), true)
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
    expect(screen.getByText(/3 hilly runs left out of the heart-rate side/)).toBeInTheDocument()
  })
})
