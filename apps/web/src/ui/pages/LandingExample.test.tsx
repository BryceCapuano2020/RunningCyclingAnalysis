// @vitest-environment jsdom
import '../../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { landingText } from '../../test/landingText'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { gapOfHeadline } from '../balanceGap'
import { thresholdGrades } from '../thresholdGrade'
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

/** The sample athlete's own analysis, which the example is drawn from. */
function sampleResult() {
  const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result
  if (result === null) throw new Error('The sample has no result')
  return result
}

describe('LandingExample', () => {
  it('matches the gap the sample athlete itself shows', () => {
    const result = sampleResult()
    expect(gapOfHeadline(thresholdGrades(result, SAMPLE_PROFILE))).toMatchObject(
      LANDING_EXAMPLE.gap,
    )
  })

  it('carries each grade exactly as the sample athlete’s analysis gives it, with its range', () => {
    const headline = thresholdGrades(sampleResult(), SAMPLE_PROFILE)
    for (const sport of ['run', 'ride'] as const) {
      const outcome = headline[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
  })

  it('carries the sample’s fitness finding as its analysis gives it: the state, the heart rate and the change it draws', () => {
    const { fitness } = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
    const run = fitness.run
    expect(run.state).toBe('slipping')
    const example = LANDING_EXAMPLE.fitness
    expect(example.referenceHr).toBe(run.referenceHr)
    for (const end of ['value', 'low', 'high'] as const) {
      expect(example.change[end]).toBeCloseTo(run.change![end], 3)
    }
  })

  it('gives the finding inside the sample’s own card: its state, one sentence with the heart rate and the change as a track', () => {
    const { container } = render(<LandingExample />)
    const card = container.querySelector('figure.landing-example')!
    const finding = card.querySelector('.landing-example__fitness')!
    expect(finding.querySelector('.landing-example__state')?.textContent).toBe('Slipping')
    expect(finding.querySelector('.landing-example__sentence')?.textContent).toBe(
      `Slower than your old level at ${LANDING_EXAMPLE.fitness.referenceHr} bpm.`,
    )
    expect(finding.querySelector('.fitness-track__ring')).not.toBeNull()
    // One card: the finding is not a figure of its own, and it follows the triangle.
    expect(container.querySelectorAll('figure.landing-example')).toHaveLength(1)
    expect(finding.closest('figure')).toBe(card)
    const triangle = card.querySelector('.level-triangle')!
    expect(
      triangle.compareDocumentPosition(finding) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('says no size for the slip, which reads a point either way as the visit day moves', () => {
    const { container } = render(<LandingExample />)
    const sentence = container.querySelector('.landing-example__sentence')?.textContent ?? ''
    expect(sentence).not.toMatch(/%|\d+ to \d+/)
    expect(sentence).toMatch(/\d+ bpm\.$/)
  })

  it('is labelled once, Sample athlete, names the persona in one line under the headline, and gives the answer’s headline', () => {
    const { container } = render(<LandingExample />)
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
    expect(container.querySelector('figcaption')).toHaveTextContent(
      `Sample athlete: ${SAMPLE_DESCRIPTION}`,
    )
    expect(container.querySelectorAll('figcaption')).toHaveLength(1)
    expect(screen.getByText(balanceTitle(gapReading(LANDING_EXAMPLE.gap)))).toBeInTheDocument()
    // The old label chain is gone: nothing says illustrative, and the fitness finding has no label of its own.
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

  it('says the lean and the gap in a line under the headline, as Balance does', () => {
    const { container } = render(<LandingExample />)
    const lead = Math.abs(LANDING_EXAMPLE.gap.centre)
    expect(container.querySelector('.landing-example__line')?.textContent).toMatch(
      new RegExp(`^(Running|Cycling) grades ${lead} points? higher at.threshold\\.$`),
    )
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
