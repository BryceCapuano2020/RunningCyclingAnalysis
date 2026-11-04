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
    expect(finding.querySelector('.fitness-track__band')).not.toBeNull()
    // One card: the finding is not a figure of its own, and it follows the balance and the levels.
    expect(container.querySelectorAll('figure.landing-example')).toHaveLength(1)
    expect(finding.closest('figure')).toBe(card)
    const levels = card.querySelector('.balance-levels')!
    expect(levels.compareDocumentPosition(finding) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says no size for the slip, which reads a point either way as the visit day moves', () => {
    const { container } = render(<LandingExample />)
    const sentence = container.querySelector('.landing-example__sentence')?.textContent ?? ''
    expect(sentence).not.toMatch(/%|\d+ to \d+/)
    expect(sentence).toMatch(/\d+ bpm\.$/)
  })

  it('is labelled once, Sample athlete, names the persona beside it, and gives the answer’s headline', () => {
    const { container } = render(<LandingExample />)
    expect(screen.getByText('Sample athlete')).toBeInTheDocument()
    expect(container.querySelector('figcaption')).toHaveTextContent(
      `Sample athlete${SAMPLE_DESCRIPTION}`,
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

  it('draws the real meter and levels from the sample’s figures: the gap with its range, and each sport’s grade and level', () => {
    const { container } = render(<LandingExample />)
    const text = landingText(LANDING_EXAMPLE)
    expect(
      screen.getByRole('img', { name: new RegExp(`^${text.name} \\(range `) }),
    ).toBeInTheDocument()
    expect(container.querySelector('.balance-meter__value')?.textContent).toBe(text.value)
    expect(container.querySelector('.balance-meter__edges')?.textContent).toBe(text.edges)
    const rows = [...container.querySelectorAll('.balance-levels__row')].map(spoken)
    expect(rows).toEqual(text.rows)
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
