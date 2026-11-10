// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GRADE_LEVELS, ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { wholeText } from '../test/wholeText'
import { AgeGradingSection } from './AgeGradingSection'

afterEach(() => {
  cleanup()
})

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Age grades and levels' })
}

describe('AgeGradingSection', () => {
  it('is a heading that takes focus, led by what an age grade is', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Age grades and levels' }),
    ).toHaveAttribute('tabindex', '-1')
    expect(section().querySelector('.method__lead')).toHaveTextContent(
      'An age grade is your effort as a share of world class at your age and sex.',
    )
  })

  it('says how a run and a ride are graded, with the ride anchor from core', () => {
    render(<AgeGradingSection gradedSex={null} />)

    for (const line of [
      'A run’s grade is the USATF road standards time for its distance at your age and sex, over your time.',
      'It uses grade-adjusted pace (GAP), corrected for hills.',
      'A ride’s W/kg is set against the best riders’ hour (6.40 W/kg men, 5.69 women), then graded as a run at that share.',
      'A threshold is graded at your age on the day of its strongest effort.',
    ]) {
      expect(within(section()).getByText(wholeText(line))).toBeInTheDocument()
    }
  })

  it('lists every level in core, highest first, with its span, and says which bands are WMA’s', () => {
    render(<AgeGradingSection gradedSex={null} />)

    const items = within(section())
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    const levels = items.filter((item) => / is (\d+%|under)/.test(item))
    expect(levels.map((item) => item.split(' is ')[0])).toEqual(
      GRADE_LEVELS.map((band) => band.label),
    )
    expect(levels[0]).toBe('World is 90% and up: among the best in the world for your age.')
    expect(levels).toContain('National is 80% to 89%: you contend at a national championship.')
    expect(levels).toContain('Club is 50% to 59%: you hold your own in a club race.')
    expect(levels.at(-1)).toBe('Recreational is under 30%: you move for fun.')
    expect(section()).toHaveTextContent('the WMA classes from Local up, this app’s own below')
  })

  it('states the limits once: the birth year and the road standards', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent(
      'Only your birth year is used, so before your birthday the age can be a year high.',
    )
    expect(section()).toHaveTextContent('The standards are for road races at sea level.')
    expect(section()).not.toHaveTextContent(/level target|whole-percent grade/)
  })

  it('cites the standards, with their authors and licence, inside the styled source line', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByRole('link', { name: 'USATF road age standards (2025)' }),
    ).toHaveAttribute('href', ROAD_STANDARDS_SOURCE.url)
    expect(section().querySelector('.age-grading__source a')).toHaveAttribute(
      'href',
      ROAD_STANDARDS_SOURCE.url,
    )
    expect(section()).toHaveTextContent(
      'by Alan Jones and Tom Bernhard, licensed CC0 1.0, a public domain dedication.',
    )
  })

  it('names the sex the grades are for only when a grade is shown, and links to Profile', () => {
    render(<AgeGradingSection gradedSex="female" />)

    expect(
      within(section()).getByText(wholeText(/^Your grades are for a woman\./)),
    ).toBeInTheDocument()
    const link = within(section()).getByRole('link', { name: 'Change age and sex' })
    expect(link).toHaveAttribute('href', '#/profile')
    expect(link).toHaveClass('age-grading__link')
    cleanup()
    render(<AgeGradingSection gradedSex={null} />)
    expect(screen.queryByText(wholeText(/Your grades are for a/))).not.toBeInTheDocument()
  })
})
