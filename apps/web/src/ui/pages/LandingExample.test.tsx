// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fitnessLines } from '@rca/core/fitness'
import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from '../balanceGap'
import { headlineGrades } from '../grades'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
import { LandingExample } from './LandingExample'
import { LANDING_EXAMPLE } from '../landingExample'

/** A row's words as read, without the notes its defined terms keep in the markup. */
function spoken(row: Element): string {
  const copy = row.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

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
  it('matches the gap the sample athlete itself shows', () => {
    const result = sampleResult()
    expect(gapOfHeadline(headlineGrades(result, SAMPLE_PROFILE))).toMatchObject(LANDING_EXAMPLE.gap)
  })

  it('carries each grade exactly as the sample athlete’s analysis gives it, with its range', () => {
    const headline = headlineGrades(sampleResult(), SAMPLE_PROFILE)
    for (const sport of ['run', 'ride'] as const) {
      const outcome = headline[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
  })

  it('carries the sample’s fitness finding as its analysis gives it: the state, the change, its range and the heart rate', () => {
    const { fitness } = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const run = fitness.run
    expect(run.state).toBe('slipping')
    const example = LANDING_EXAMPLE.fitness
    expect(example.referenceHr).toBe(run.referenceHr)
    for (const end of ['value', 'low', 'high'] as const) {
      expect(example.change[end]).toBeCloseTo(run.change![end], 3)
    }
    // The sentence says the same size and range in pace, which the example repeats as written.
    const { headline } = fitnessLines(run, 'metric')
    expect(headline).toContain(`${example.shown.size} (${example.shown.range}) slower`)
  })

  it('leads with the finding: its state, one sentence and the change as a track', () => {
    const { container } = render(<LandingExample />)
    expect(container.querySelector('.landing-example__state')?.textContent).toBe('Slipping')
    expect(
      screen.getByText(/^At 130 bpm you now run 6\.6% \(3 to 10%\) slower than before\.$/),
    ).toBeInTheDocument()
    expect(container.querySelector('.fitness-track__band')).not.toBeNull()
    const order = [
      ...container.querySelectorAll('.landing-example__fitness, .landing-example__title'),
    ]
    expect(order.map((node) => node.className)).toEqual([
      'landing-example__fitness',
      'landing-example__title',
    ])
  })

  it('is labelled illustrative, names the sample, and gives the answer’s headline', () => {
    render(<LandingExample />)
    expect(
      screen.getByText('Illustrative: the sample athlete, a 37-year-old man at 75 kg'),
    ).toBeInTheDocument()
    expect(screen.getByText('Your balance leans toward running')).toBeInTheDocument()
  })

  it('draws the real meter and levels from the sample’s figures: the gap with its range, and each sport’s grade and level', () => {
    const { container } = render(<LandingExample />)
    expect(
      screen.getByRole('img', {
        name: /^Running grades 8 points higher than cycling \(range 2 to 13/,
      }),
    ).toBeInTheDocument()
    expect(container.querySelector('.balance-meter__value')?.textContent).toBe('+8pts')
    expect(container.querySelector('.balance-meter__edges')?.textContent).toBe('2 to 13')
    const rows = [...container.querySelectorAll('.balance-levels__row')].map(spoken)
    expect(rows).toEqual(['Running 67% Local', 'Cycling 59% Recreational to Local'])
  })

  it('draws no level scale, ring or table: the meter, one line a sport and the fitness finding are all it shows', () => {
    const { container } = render(<LandingExample />)
    expect(container.querySelector('svg:not(.icon):not(.fitness-glyph)')).toBeNull()
    expect(container.querySelector('details')).toBeNull()
  })

  it('drops the watts per kilogram, which a first-time visitor does not need', () => {
    render(<LandingExample />)
    expect(screen.queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})
