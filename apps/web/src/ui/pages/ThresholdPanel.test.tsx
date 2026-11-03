// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { ThresholdEstimate } from '@rca/core/threshold'
import type { Sport } from '@rca/core/types'
import { makeActivity, makeResult, makeRideThreshold } from '../components/fixtures'
import { formatDayMonth } from '../format/date'
import { ThresholdPanel } from './ThresholdPanel'

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
    <ThresholdPanel sport={sport} result={result} massKg={75} units="metric" rangeDays={84} />,
  )
}

const ridden = (rideThreshold: ThresholdEstimate | null) =>
  makeResult({
    activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: DAY })],
    rideThreshold,
  })

describe('ThresholdPanel for a ride', () => {
  it('is one number with its W/kg, named by its words and its period, and no chip', () => {
    const { container } = panel('ride', ridden(estimate()))
    const section = screen.getByRole('region', { name: 'Threshold power' })
    expect(section.querySelector('.sport-hero__number')).toHaveTextContent('250')
    expect(section.querySelector('.sport-hero__unit')).toHaveTextContent('W')
    expect(section.querySelector('.sport-hero__side')).toHaveTextContent('3.3 W/kg')
    expect(section.querySelector('.sport-hero__period')).toHaveTextContent('· 12 weeks')
    // Not "At least", "Estimated", "Not all-out" or "Hard effort": the name says it is a threshold.
    expect(container.querySelector('.stat-tile__basis, .chip')).toBeNull()
    expect(container.textContent).not.toMatch(/At least|Estimated|Not all-out|Hard effort/)
  })

  it('draws no range beside the figure', () => {
    const { container } = panel('ride', ridden(estimate()))
    expect(container.querySelector('.range-track, .sport-hero__track')).toBeNull()
  })

  it('says what it rests on under the figure: the rides and the strongest effort, with its length and day', () => {
    panel('ride', ridden(estimate()))
    expect(
      screen.getByText(`From 5 rides. Strongest: 12 min on ${formatDayMonth(DAY)}.`, {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('opens the range, the method and what heart rate did from one control', () => {
    panel('ride', ridden(estimate()))
    const section = screen.getByRole('region', { name: 'Threshold power' })
    const control = within(section).getByRole('button', { name: /^How this was worked out/ })
    expect(control).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(control)
    expect(control).toHaveAttribute('aria-expanded', 'true')
    const note = within(section).getByRole('note')
    expect(note).toHaveTextContent('Range 240 to 264 W.')
    expect(note).toHaveTextContent('scaled to an hour and averaged')
    expect(note).toHaveTextContent('Heart rate can raise the answer and never lowers it.')
    expect(note).toHaveTextContent('Here it raised the answer, from 6 efforts.')
  })

  it('says why heart rate was not used, in one plain clause', () => {
    panel('ride', ridden(estimate({ heartRate: { refused: 'flat' } })))
    fireEvent.click(screen.getByRole('button', { name: /^How this was worked out/ }))
    expect(screen.getByRole('note')).toHaveTextContent(
      'Here it was not used: your heart rate rises too little with power to read.',
    )
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
    expect(screen.queryByRole('button', { name: /^How this was worked out/ })).toBeNull()
  })
})

describe('ThresholdPanel for a run', () => {
  it('keeps its Estimated chip and its range as a track, and moves the effort chip into its detail', () => {
    const effort = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }
    const { container } = panel('run', makeResult({ effort: [effort] }))
    const section = screen.getByRole('region', { name: 'Threshold pace, estimated' })
    expect(within(section).getByText('Estimated')).toHaveClass('stat-tile__basis')
    expect(section.querySelector('.range-track')).not.toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
    expect(within(section).queryByRole('button', { name: /Not all-out|Hard effort/ })).toBeNull()
    fireEvent.click(within(section).getByRole('button', { name: /^How this was worked out/ }))
    expect(within(section).getByRole('note')).toHaveTextContent(
      /^Fitted to your best 3 to 20 min efforts\. Your best 20 min running reached 70%/,
    )
  })
})
