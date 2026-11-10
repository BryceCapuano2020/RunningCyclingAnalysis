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

describe('the Lift sections of Method', () => {
  it('quotes the one-rep max constants from core', () => {
    const { container } = render(<LiftMethodSections />)
    const section = container.querySelector(`[aria-labelledby="${SECTION_ID.lift}"]`) as HTMLElement
    expect(screen.getByRole('heading', { name: 'Estimated one-rep max' })).toBeInTheDocument()
    for (const text of [
      'Epley, Brzycki and Lombardi',
      `power ${LOMBARDI_EXPONENT}`,
      `more than ${REP_CAP} reps from failure`,
      `${WINDOW_DAYS} days to its latest session`,
      `halves every ${HALF_LIFE_DAYS} days`,
      '80% range',
      `${Z_LOW} standard errors below the estimate and ${Z_HIGH} above`,
      `more than ${CHANGE_Z} standard errors`,
      'reps plus 1.25 for each rep in reserve',
    ]) {
      expect(section.textContent).toContain(text)
    }
  })

  it('credits the lift standard and states its 90% anchor', () => {
    const { container } = render(<LiftMethodSections />)
    const section = container.querySelector(
      `[aria-labelledby="${SECTION_ID.liftGrade}"]`,
    ) as HTMLElement
    expect(screen.getByRole('heading', { name: 'Lift age grade' })).toBeInTheDocument()
    expect(section.textContent).toContain(LIFT_STANDARDS_SOURCE.attribution)
    expect(section.textContent).toContain(LIFT_STANDARDS_SOURCE.shortName)
    expect(section.textContent).toContain('set at 90%, world class')
  })
})
