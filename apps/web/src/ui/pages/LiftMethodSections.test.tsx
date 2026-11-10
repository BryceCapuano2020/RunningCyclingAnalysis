// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CHANGE_Z,
  HALF_LIFE_DAYS,
  LIFT_STANDARDS_SOURCE,
  LOMBARDI_EXPONENT,
  REP_CAP,
  WINDOW_DAYS,
  Z_HIGH,
  Z_LOW,
} from '@rca/core/lift'
import { SECTION_ID } from '../components/methodTopics'
import { LiftMethodSections } from './LiftMethodSections'

function sectionOf(id: string): HTMLElement {
  return document.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement
}

describe('the Lift sections of Method', () => {
  it('quotes the one-rep max constants from core', () => {
    render(<LiftMethodSections />)
    expect(screen.getByRole('heading', { name: 'Lifting' })).toHaveAttribute('id', SECTION_ID.lift)
    const text = sectionOf(SECTION_ID.lift).textContent
    for (const fact of [
      'Epley, Brzycki and Lombardi',
      `power ${LOMBARDI_EXPONENT}`,
      `over ${REP_CAP} reps to failure`,
      `${WINDOW_DAYS} days to its latest session`,
      `halves every ${HALF_LIFE_DAYS} days`,
      `The 80% range runs ${Z_LOW} standard errors below and ${Z_HIGH} above`,
      `past ${CHANGE_Z} standard errors`,
      'add 1.25 per rep in reserve',
    ]) {
      expect(text).toContain(fact)
    }
  })

  it('says how the big three total and lifting time on Activities are worked out', () => {
    render(<LiftMethodSections />)
    const text = sectionOf(SECTION_ID.lift).textContent
    expect(text).toContain(
      'The big three total adds squat, bench press and deadlift, or shows the heaviest when one is missing.',
    )
    // 180 s a working set and 120 s a warm-up, from core.
    expect(text).toContain('3 min per working set and 2 min per warm-up, rest included')
  })

  it('credits the lift standard, states its 90% anchor and the ages and weights it covers', () => {
    render(<LiftMethodSections />)
    expect(screen.getByRole('heading', { name: 'Lift age grade' })).toBeInTheDocument()
    const text = sectionOf(SECTION_ID.liftGrade).textContent
    expect(text).toContain(LIFT_STANDARDS_SOURCE.attribution)
    expect(text).toContain('with the 99.9th percentile lifter at 90%')
    expect(text).toContain('ages 14 to 80')
    expect(text).toContain('over 110% of the standard is not graded')
  })
})
