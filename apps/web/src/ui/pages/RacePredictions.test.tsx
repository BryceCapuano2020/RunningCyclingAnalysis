// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from '../components/fixtures'
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

describe('RacePredictions', () => {
  afterEach(cleanup)

  it('shows each race with its time, pace and likely range', () => {
    const result = makeResult({ activities: [withBests], runVo2max: { vo2max: 50, runs: 4 } })
    render(<RacePredictions sport="run" result={result} units="metric" />)
    const table = screen.getAllByRole('table')[0]!
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      '5 km',
      '10 km',
      'Half marathon',
      'Marathon',
    ])
    expect(within(rows[0]!).getByText(/^likely \d+:\d\d to \d+:\d\d$/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /a VO2max of 50 would run, from your heart rate against pace on 4 hard runs/,
      ),
    ).toBeInTheDocument()
  })

  it('says it rests on the runs alone without heart rate', () => {
    const result = makeResult({ activities: [withBests] })
    render(<RacePredictions sport="run" result={result} units="metric" />)
    expect(screen.getByText(/^From your best times in this period alone/)).toBeInTheDocument()
  })

  it('says when heart rate points to more than the runs show', () => {
    const result = makeResult({ activities: [withBests], runVo2max: { vo2max: 62, runs: 5 } })
    render(<RacePredictions sport="run" result={result} units="metric" />)
    expect(
      screen.getByText(
        /Your heart rate points to more than your best runs show \(about 62 against \d\d\)/,
      ),
    ).toBeInTheDocument()
  })

  it('shows nothing for a sport without a predictor, or without evidence', () => {
    const { container } = render(
      <>
        <RacePredictions
          sport="ride"
          result={makeResult({ activities: [withBests] })}
          units="metric"
        />
        <RacePredictions sport="run" result={makeResult()} units="metric" />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
