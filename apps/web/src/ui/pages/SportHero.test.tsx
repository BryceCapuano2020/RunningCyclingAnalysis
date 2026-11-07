// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { ThresholdEstimate } from '@rca/core/threshold'
import type { Sport } from '@rca/core/types'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../components/fixtures'
import { rowValue } from '../test/propertyRows'
import { formatDayMonth } from '../format/date'
import { SportHero } from './SportHero'
import { detailSummaries, openDetail } from '../test/openDetail'

afterEach(cleanup)

const DAY = new Date(2026, 2, 4, 12).getTime()

/** 250 W at 75 kg, from five rides, the strongest a 12 min effort on 4 March. */
function estimate(over: Partial<ThresholdEstimate> = {}): ThresholdEstimate {
  return makeRideThreshold(15.5, {
    low: 14.9,
    high: 16.4,
    efforts: {
      value: 15,
      relativeError: 0.025,
      rides: 5,
      strongest: { activityId: 'ride-1', durationS: 720, estimated: false },
    },
    heartRate: { value: 15.9, efforts: 6 },
    ...over,
  })
}

function panel(sport: Sport, result: AnalysisResult) {
  return render(
    <SportHero
      sport={sport}
      result={result}
      previousThresholds={null}
      previousLabel={null}
      massKg={75}
      units="metric"
      outcome={null}
      missingAge={null}
    />,
  )
}

const ridden = (rideThreshold: ThresholdEstimate | null) =>
  makeResult({
    activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: DAY })],
    rideThreshold,
  })

describe('SportHero for a ride', () => {
  it('is one number with its W/kg, named by its words, with no period tag and no chip', () => {
    const { container } = panel('ride', ridden(estimate()))
    const section = screen.getByRole('region', { name: 'Threshold power' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent('250')
    expect(section.querySelector('.sport-hero__unit')).toHaveTextContent('W')
    expect(section.querySelector('.sport-hero__side')).toHaveTextContent('3.3 W/kg')
    // The rail names the period, so the panel does not.
    expect(section.querySelector('.sport-hero__period')).toBeNull()
    expect(section).not.toHaveTextContent(/12 weeks/)
    // Not "At least", "Estimated", "Not all-out" or "Hard effort": the name says it is a threshold.
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(/At least|Estimated|Not all-out|Hard effort/)
  })

  it('draws no range beside the figure: only its number, unit and W/kg sit there', () => {
    const { container } = panel('ride', ridden(estimate()))
    const figure = container.querySelector('.sport-hero__figure')
    expect([...(figure?.children ?? [])].map((child) => child.className)).toEqual([
      'display sport-hero__number',
      'sport-hero__unit',
      'sport-hero__side',
    ])
    expect(screen.queryByText('range')).toBeNull()
  })

  it('says what it rests on under the figure: the rides and the strongest effort, with its length and day', () => {
    panel('ride', ridden(estimate()))
    const section = screen.getByRole('region', { name: 'Threshold power' })
    expect(rowValue(section, 'Rides used')).toBe('5')
    expect(rowValue(section, 'Strongest effort')).toBe(`12 min, ${formatDayMonth(DAY)}`)
  })

  it('opens the range, the method link and what heart rate did from one control', () => {
    panel('ride', ridden(estimate()))
    const section = screen.getByRole('region', { name: 'Threshold power' })
    const details = section.querySelector('details.disclosure') as HTMLDetailsElement
    expect(details.open).toBe(false)
    openDetail(section)
    expect(details.open).toBe(true)
    expect(rowValue(section, 'Range')).toBe('240\u2013264 W')
    expect(rowValue(section, 'Heart rate')).toBe('Raised it, from 6 efforts')
    // The method is one link to Method, not prose.
    expect(
      within(section).getByRole('link', {
        name: /^Method, how threshold (power|pace) was worked out$/,
      }),
    ).toBeInTheDocument()
    expect(section.querySelector('details')).not.toHaveTextContent(/scaled to an hour/)
  })

  it('says heart rate was not used as a row value, with no clause', () => {
    panel('ride', ridden(estimate({ heartRate: { refused: 'flat' } })))
    openDetail()
    expect(rowValue(document.body, 'Heart rate')).toBe('Not used')
  })

  it('shows the estimate whatever the critical-power fit, and its heading stays plain with no chip', () => {
    const fitless = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride' })],
      rideCp: null,
      rideCpRefusal: 'missing',
      rideThreshold: estimate(),
    })
    panel('ride', fitless)
    expect(screen.getByRole('heading', { name: 'Threshold power' })).toBeInTheDocument()
    expect(document.querySelector('.sport-hero__number')).toHaveTextContent('250')
  })

  it('asks for an effort, and offers no detail, with no estimate', () => {
    const { container } = panel('ride', ridden(null))
    expect(container.querySelector('.sport-hero__number')).toBeNull()
    expect(screen.getByText('Needs an effort of 3 min or longer')).toBeInTheDocument()
    expect(detailSummaries()).toEqual([])
  })
})

describe('SportHero for a run', () => {
  const RUN_DAY = new Date(2026, 5, 10, 12).getTime()

  /** 4:24 /km, from four runs, the strongest a 40 min effort on 10 June. */
  const runEstimate = (over: Partial<ThresholdEstimate> = {}) =>
    makeRunThreshold(16, {
      low: 15.2,
      high: 16.8,
      efforts: {
        value: 16,
        relativeError: 0.03,
        rides: 4,
        strongest: { activityId: 'run-1', durationS: 2400, estimated: false },
      },
      ...over,
    })

  const ran = (runThreshold: ThresholdEstimate | null) =>
    makeResult({
      activities: [makeActivity({ id: 'run-1', sport: 'run', startMs: RUN_DAY })],
      runThreshold,
    })

  it('is one number named by its words, with no period tag, no Estimated chip and no range track', () => {
    const { container } = panel('run', ran(runEstimate()))
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent('4:24')
    expect(section.querySelector('.sport-hero__unit')).toHaveTextContent('/km')
    expect(section.querySelector('.sport-hero__period')).toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).not.toMatch(/At least|Estimated|Not all-out|Hard effort/)
    const figure = container.querySelector('.sport-hero__figure')
    expect([...(figure?.children ?? [])].map((child) => child.className)).toEqual([
      'display sport-hero__number',
      'sport-hero__unit',
    ])
  })

  it('says what it rests on under the figure: the runs and the strongest effort, with its length and day', () => {
    panel('run', ran(runEstimate()))
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    expect(rowValue(section, 'Runs used')).toBe('4')
    expect(rowValue(section, 'Strongest effort')).toBe(`40 min, ${formatDayMonth(RUN_DAY)}`)
  })

  it('opens the range and the method from one control, and says nothing of heart rate', () => {
    panel('run', ran(runEstimate({ heartRate: { value: 17.5, efforts: 6 }, value: 17.5 })))
    const section = screen.getByRole('region', { name: 'Threshold pace' })
    const details = section.querySelector('details.disclosure') as HTMLDetailsElement
    expect(details.open).toBe(false)
    openDetail(section)
    expect(details.open).toBe(true)
    expect(rowValue(section, 'Range')).toBe('4:10\u20134:39 /km')
    expect(
      within(section).getByRole('link', {
        name: /^Method, how threshold (power|pace) was worked out$/,
      }),
    ).toBeInTheDocument()
    expect(section.querySelector('details')).not.toHaveTextContent(/heart rate|not used|raise/i)
  })

  it('shows the estimate whatever the critical-power fit, and asks for an 8 min effort with no estimate', () => {
    const fitless = makeResult({
      activities: [makeActivity({ id: 'run-1', sport: 'run' })],
      runCp: null,
      runCpRefusal: 'missing',
      runThreshold: runEstimate(),
    })
    const { container, unmount } = panel('run', fitless)
    expect(container.querySelector('.sport-hero__number')).toHaveTextContent('4:24')
    unmount()
    const empty = panel('run', ran(null))
    expect(empty.container.querySelector('.sport-hero__number')).toBeNull()
    expect(screen.getByText('Needs an effort of 8 min or longer')).toBeInTheDocument()
    expect(detailSummaries()).toEqual([])
  })
})
