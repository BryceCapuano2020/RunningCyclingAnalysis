// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { formatPace } from '@rca/core/units'
import { gapOfHeadline } from '../balanceGap'
import { headlineGrades } from '../grades'
import { headlineEffort, sportRecords } from '../records'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { LandingExample } from './LandingExample'
import { LANDING_EXAMPLE } from '../landingExample'

afterEach(() => {
  cleanup()
})

/** The sample athlete's own analysis, which the example is drawn from. */
function sampleResult() {
  const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result
  if (result === null) throw new Error('The sample has no result')
  return result
}

describe('LandingExample', () => {
  it('matches the numbers the sample athlete itself shows', () => {
    const result = sampleResult()
    expect(gapOfHeadline(headlineGrades(result, SAMPLE_PROFILE))).toMatchObject(LANDING_EXAMPLE.gap)
    // The best 20 minutes each lane rests on, in both units.
    for (const units of ['metric', 'imperial'] as const) {
      const records = (sport: 'run' | 'ride') =>
        headlineEffort(sport, sportRecords(result, sport, SAMPLE_SETTINGS.massKg, units))
      expect(records('run')).toBe(formatPace(LANDING_EXAMPLE.best20.runSpeedMs, units))
      expect(records('ride')).toBe(`${LANDING_EXAMPLE.best20.rideWatts} W`)
    }
  })

  it('carries each grade exactly as the sample athlete’s analysis gives it, with its range', () => {
    const headline = headlineGrades(sampleResult(), SAMPLE_PROFILE)
    for (const sport of ['run', 'ride'] as const) {
      const outcome = headline[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
  })

  it('is labelled illustrative, names the sample, and gives the answer’s headline', () => {
    render(<LandingExample units="metric" />)
    expect(
      screen.getByText('Illustrative: the sample athlete, a 37-year-old man at 75 kg'),
    ).toBeInTheDocument()
    expect(screen.getByText('Your balance leans toward running')).toBeInTheDocument()
  })

  it('draws the real level scale from the sample’s figures: each sport’s grade, level and best 20 minutes, and the gap', () => {
    const { container } = render(<LandingExample units="metric" />)
    const scale = container.querySelector('.balance-scale')
    expect(scale).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /^Age-grade level of your best 20 min\. Run 67 percent, Local, recorded\. Ride 56 percent, Recreational to Local, power measured, level via the run equivalent, range 51 to 61 percent\./,
      }),
    ).toBeInTheDocument()
    const drawing = within(container.querySelector('svg') as unknown as HTMLElement)
    expect(drawing.getByText('67%')).toBeInTheDocument()
    expect(drawing.getByText('56%')).toBeInTheDocument()
    expect(screen.getByText(/^Local · 3:56 \/km on your best 20 min$/)).toBeInTheDocument()
    expect(screen.getByText(/^Recreational to Local · 243 W/)).toBeInTheDocument()
    expect(screen.getByText(/^11 pts toward running · 90% range/)).toBeInTheDocument()
    // A recorded grade is a dot, an estimate a ring over a bracketed band, as on Balance.
    expect(container.querySelector('.balance-scale__dot')).not.toBeNull()
    expect(container.querySelector('.balance-scale__ring')).not.toBeNull()
    expect(container.querySelector('.balance-scale__range')).not.toBeNull()
  })

  it('gives the pace per mile for imperial', () => {
    render(<LandingExample units="imperial" />)
    expect(screen.getByText(/^Local · 6:19 \/mi on your best 20 min$/)).toBeInTheDocument()
  })

  it('has its figures as a table too, and no ghost target, which needs the analysis', () => {
    const { container } = render(<LandingExample units="metric" />)
    expect(container.querySelector('.balance-scale__details')).not.toBeNull()
    expect(container.querySelector('.balance-scale__ghost')).toBeNull()
  })

  it('drops the watts per kilogram, which a first-time visitor does not need', () => {
    render(<LandingExample units="metric" />)
    expect(screen.queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})
