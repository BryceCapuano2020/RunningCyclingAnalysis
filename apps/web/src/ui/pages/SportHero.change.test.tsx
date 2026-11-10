// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { wkgOfFlatSpeed } from '@rca/core/display'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { ThresholdEstimate } from '@rca/core/threshold'
import type { Sport } from '@rca/core/types'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../components/test/fixtures'
import { SportAnswer } from './SportAnswer'
import { SportHero } from './SportHero'

afterEach(cleanup)

const MASS = 75
type Previous = Record<Sport, ThresholdEstimate | null> | null

function hero(sport: Sport, result: AnalysisResult, previous: Previous, label: string | null) {
  return render(
    <SportHero
      sport={sport}
      result={result}
      previousThresholds={previous}
      previousLabel={label}
      massKg={MASS}
      units="metric"
      outcome={null}
      missingAge={null}
    />,
  )
}

const rode = (value: number) =>
  makeResult({
    activities: [makeActivity({ id: 'ride-1', sport: 'ride' })],
    rideThreshold: makeRideThreshold(value, { low: value - 0.6, high: value + 0.9 }),
  })
const ran = (speed: number) =>
  makeResult({
    activities: [makeActivity({ id: 'run-1', sport: 'run' })],
    runThreshold: makeRunThreshold(wkgOfFlatSpeed(speed)),
  })
const NONE: Previous = { run: null, ride: null }
const change = () => screen.getByTestId('hero-change')

describe('the sport hero', () => {
  it('is a title and one row of three labelled figures: threshold with its range, level, change', () => {
    hero('ride', rode(15.5), { run: null, ride: makeRideThreshold(15) }, 'Previous 12 weeks')
    const stats = [...document.querySelectorAll('.sport-hero__stat dt')].map((dt) => dt.textContent)
    expect(stats).toEqual(['Threshold', 'Change'])
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Threshold power')
    const threshold = screen.getByTestId('hero-threshold')
    expect(threshold.querySelector('.sport-hero__number')).toHaveTextContent('250')
    expect(threshold.querySelector('.sport-hero__range')).toHaveTextContent(/^\d+–\d+ W$/)
    expect(document.querySelector('canvas, svg')).toBeNull()
  })

  it('says a ride’s change in watts on the previous period, with its sign', () => {
    hero('ride', rode(15.5), { run: null, ride: makeRideThreshold(15) }, 'Previous 12 weeks')
    expect(change()).toHaveTextContent(/^Change\+\d+ W on the previous 12 weeks$/)
    cleanup()
    hero('ride', rode(15), { run: null, ride: makeRideThreshold(15.5) }, 'Previous 12 weeks')
    expect(change()).toHaveTextContent(/^Change−\d+ W on the previous 12 weeks$/)
  })

  it('says a run’s change as the pace gained, faster or slower', () => {
    hero(
      'run',
      ran(4.2),
      { run: makeRunThreshold(wkgOfFlatSpeed(4)), ride: null },
      'Previous 6 weeks',
    )
    expect(change()).toHaveTextContent('Change0:12 /km faster on the previous 6 weeks')
    cleanup()
    hero(
      'run',
      ran(4),
      { run: makeRunThreshold(wkgOfFlatSpeed(4.2)), ride: null },
      'Previous 6 weeks',
    )
    expect(change()).toHaveTextContent('Change0:12 /km slower')
  })

  it('sets the amount in the mono class and the words around it in the serif one', () => {
    hero(
      'run',
      ran(4.2),
      { run: makeRunThreshold(wkgOfFlatSpeed(4)), ride: null },
      'Previous 6 weeks',
    )
    expect(change().querySelector('.sport-hero__amount')).toHaveTextContent('0:12 /km')
    expect(change().querySelector('.sport-hero__words')).toHaveTextContent(
      'faster on the previous 6 weeks',
    )
  })

  it('says no change when the two print the same', () => {
    hero('ride', rode(15), { run: null, ride: makeRideThreshold(15) }, 'Previous 12 weeks')
    expect(change()).toHaveTextContent('ChangeNo change on the previous 12 weeks')
  })

  it('is one value when the previous period has no estimate', () => {
    hero('ride', rode(15), NONE, 'Previous 12 weeks')
    expect(change()).toHaveTextContent('ChangeNo earlier ride with a threshold')
    cleanup()
    hero('run', ran(4), NONE, 'Previous 12 weeks')
    expect(change()).toHaveTextContent('ChangeNo earlier run with a threshold')
  })

  it('has no change cell for all time, which has no period before', () => {
    hero('ride', rode(15), null, null)
    expect(screen.queryByTestId('hero-change')).toBeNull()
    expect(screen.getByTestId('hero-threshold')).toBeInTheDocument()
  })
})

describe('the sport answer around the hero', () => {
  const base = {
    result: makeResult({ activities: [] }),
    massKg: MASS,
    units: 'metric',
    profile: null,
    missingAge: null,
    rangeDays: null,
    emptyText: 'Nothing in this period.',
    inLibrary: 3,
    onAddFiles: () => {},
  } as const

  it('holds a ride without a body weight to the weight note, with no hero', () => {
    render(<SportAnswer {...base} sport="ride" count={3} held />)
    expect(screen.queryByTestId('hero-change')).toBeNull()
    expect(document.querySelector('.sport-hero')).toBeNull()
  })

  it('shows an empty sport its prompt and no hero', () => {
    render(<SportAnswer {...base} sport="run" count={0} held={false} />)
    expect(screen.getByText('Nothing in this period.')).toBeInTheDocument()
    expect(document.querySelector('.sport-hero')).toBeNull()
  })

  it('shows no figures, only what to add, with no threshold estimate', () => {
    render(
      <SportAnswer
        {...base}
        result={makeResult({
          activities: [makeActivity({ id: 'run-1', sport: 'run' })],
          runThreshold: null,
        })}
        sport="run"
        count={2}
        held={false}
      />,
    )
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    expect(within(section).queryByTestId('hero-change')).toBeNull()
    expect(section).toHaveTextContent('Needs an effort of 8 min or longer')
  })
})
