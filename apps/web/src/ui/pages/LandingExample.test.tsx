// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { formatPace } from '@rca/core/units'
import { gapOfHeadline } from '../balanceGap'
import { headlineGrades } from '../grades'
import { threshold } from '../records'
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
    expect(threshold(result, 'run', SAMPLE_SETTINGS.massKg, 'metric')?.value).toBe(
      formatPace(LANDING_EXAMPLE.runSpeedMs, 'metric'),
    )
    expect(threshold(result, 'ride', SAMPLE_SETTINGS.massKg, 'metric')?.value).toBe(
      `${LANDING_EXAMPLE.rideWatts} W`,
    )
  })

  it('shows the sample’s threshold pace as its Balance does, in both units', () => {
    const result = sampleResult()
    for (const units of ['metric', 'imperial'] as const) {
      expect(threshold(result, 'run', SAMPLE_SETTINGS.massKg, units)?.value).toBe(
        formatPace(LANDING_EXAMPLE.runSpeedMs, units),
      )
    }
    render(<LandingExample units="imperial" />)
    expect(screen.getByText('Pace 7:12 /mi')).toBeInTheDocument()
  })

  it('carries each grade exactly as the sample athlete’s analysis gives it, with its range', () => {
    const headline = headlineGrades(sampleResult(), SAMPLE_PROFILE)
    for (const sport of ['run', 'ride'] as const) {
      const outcome = headline[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
  })

  it('is labelled illustrative, names the sample, and shows each sport’s level and grade', () => {
    render(<LandingExample units="metric" />)
    expect(screen.getByText('Illustrative: the sample athlete')).toBeInTheDocument()
    expect(screen.getByText('The sample is a 37-year-old man at 75 kg.')).toBeInTheDocument()
    expect(screen.getByText('Run · Local · 64%')).toBeInTheDocument()
    expect(screen.getByText('Ride · Recreational · 58%')).toBeInTheDocument()
    expect(screen.getByText('Pace 4:29 /km')).toBeInTheDocument()
    expect(screen.getByText('Power 225 W')).toBeInTheDocument()
  })

  it('leaves the ladder keys out, since the example is illustrative and says so', () => {
    render(<LandingExample units="metric" />)
    expect(screen.queryByText(/Solid dot:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ring:/)).not.toBeInTheDocument()
  })

  it('drops the watts per kilogram, which a first-time visitor does not need', () => {
    render(<LandingExample units="metric" />)
    expect(screen.queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})
