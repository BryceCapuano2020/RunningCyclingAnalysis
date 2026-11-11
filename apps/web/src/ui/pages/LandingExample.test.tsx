// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { landingText } from '../../test/landingText'
import { gapOfHeadline } from '../balanceGap'
import { thresholdGrades } from '../thresholdGrade'
import { halfOfState } from '../runHalf'
import { SAMPLE_DESCRIPTION, SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../sampleAthlete'
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

/** The sample athlete's own grades, the run's by its forecast half as its Balance asks it: what the example is drawn from. */
function sampleGrades() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const { result } = state
  if (result === null) throw new Error('The sample has no result')
  return thresholdGrades(result, SAMPLE_PROFILE, halfOfState(state)(result))
}

describe('LandingExample', () => {
  it('matches the gap the sample athlete itself shows', () => {
    expect(gapOfHeadline(sampleGrades())).toMatchObject(LANDING_EXAMPLE.gap)
  })

  it('carries each grade exactly as the sample athlete’s analysis gives it, with its range', () => {
    const headline = sampleGrades()
    for (const sport of ['run', 'ride'] as const) {
      const outcome = headline[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
  })

  it('is labelled once, Sample athlete, names the persona in one line under the headline, and gives the answer’s headline', () => {
    const { container } = render(<LandingExample />)
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
    expect(container.querySelector('figcaption')).toHaveTextContent(
      `Sample athlete: ${SAMPLE_DESCRIPTION}`,
    )
    expect(container.querySelectorAll('figcaption')).toHaveLength(1)
    expect(screen.getByText('Your athletic balance')).toBeInTheDocument()
    // Nothing says illustrative, and no fitness finding rides on the example.
    expect(container.textContent).not.toMatch(/illustrative|Fitness at the same heart rate/i)
  })

  it('names the sample’s weight in the visitor’s units', () => {
    render(<LandingExample units="imperial" />)
    expect(screen.getByText('a 37-year-old man at 165.3 lb')).toBeInTheDocument()
  })

  it('draws the level triangle from the sample’s figures: run and ride at their grades and levels, and lifting with no grade yet', () => {
    const { container } = render(<LandingExample />)
    const text = landingText(LANDING_EXAMPLE)
    const corners = [...container.querySelectorAll('.level-triangle__corner')].map(spoken)
    // Each graded corner also carries its range for a screen reader, after the words the page prints.
    expect(
      corners.map((corner, order) => corner.startsWith(text.rows[order] ?? 'Lifting No grade yet')),
    ).toEqual([true, true, true])
    expect(corners[2]).toBe('Lifting No grade yet')
    // Two graded sports are an open line with their two dots, and lifting's axis has a cap and no dot.
    expect(container.querySelectorAll('.level-triangle__dot')).toHaveLength(2)
    expect(container.querySelector('.level-triangle__line')).not.toBeNull()
    expect(container.querySelector('.level-triangle__shape')).toBeNull()
    expect(container.querySelectorAll('.level-triangle__cap')).toHaveLength(1)
  })

  it('leaves the lean to the triangle, with no line under the headline, as Balance does', () => {
    const { container } = render(<LandingExample />)
    expect(container.querySelector('.landing-example__line')).toBeNull()
    expect(container).not.toHaveTextContent(/leans toward|points higher/)
  })

  it('leads nowhere from its corners, and shows no meter or levels line', () => {
    const { container } = render(<LandingExample />)
    expect(container.querySelectorAll('.level-triangle a')).toHaveLength(0)
    expect(container.querySelector('.balance-meter, .balance-levels')).toBeNull()
    expect(container.querySelector('details')).toBeNull()
  })

  it('drops the watts per kilogram, which a first-time visitor does not need', () => {
    render(<LandingExample />)
    expect(screen.queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})
