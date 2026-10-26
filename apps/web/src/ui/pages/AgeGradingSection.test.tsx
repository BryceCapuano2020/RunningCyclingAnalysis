// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { AgeGradingSection } from './AgeGradingSection'

afterEach(() => {
  cleanup()
})

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Age grades and levels' })
}

describe('AgeGradingSection', () => {
  it('is a heading that moves focus, and says how a run is graded, with Below 60% as Recreational', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Age grades and levels' }),
    ).toHaveAttribute('tabindex', '-1')
    expect(section()).toHaveTextContent(
      'A run is graded against the USATF road standards for your age and sex: the standard time for the distance covered, divided by the time taken. A grade of 70% means the run was at 70% of the standard pace. Levels are bands of that grade: Local from 60%, Regional from 70%, National from 80%, World from 90%. Below 60% is Recreational.',
    )
  })

  it('reads a run’s grade as recorded, from its flat pace, which the cards call flat pace', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent(
      'A run’s grade is read as recorded, from its flat pace: the recorded pace, corrected for hills with a published energy-cost curve.',
    )
    expect(section()).not.toHaveTextContent(/a fact from the file/)
  })

  it('says a ride grade is an estimate through its running equivalent', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent(
      'A ride has no published cycling standard. Its best effort is converted to the flat running speed that costs the same energy over the same time, the running equivalent, and graded like a run, so a ride grade is an estimate.',
    )
    // The 90% range is explained once, in the energy view, so this paragraph does not repeat it.
    expect(section()).not.toHaveTextContent('Its range is the model’s 90% range')
  })

  it('explains why each effort is graded at its own date, and which date a ride takes', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent(
      'Each effort is graded at the age on its own date, not the newest activity’s',
    )
    expect(section()).toHaveTextContent(
      'A ride takes the date of its own best ride at that duration, because its running equivalent comes from that ride.',
    )
  })

  it('cites the standards, with their authors and licence, and links the repository', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByRole('link', { name: 'USATF road age standards (2025)' }),
    ).toHaveAttribute('href', ROAD_STANDARDS_SOURCE.url)
    expect(section()).toHaveTextContent(
      'by Alan Jones and Tom Bernhard, licensed CC0 1.0, a public domain dedication.',
    )
  })

  it('does not repeat the birth-year rule that its first limit already states', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).not.toHaveTextContent(
      'Age is counted from your birth year on the date of each effort.',
    )
    expect(within(section()).getAllByRole('listitem')[0]).toHaveTextContent(
      'Only the birth year is used',
    )
  })

  it('keeps the source link inside the source line, where its tap target is styled', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section().querySelector('.age-grading__source a')).toHaveAttribute(
      'href',
      ROAD_STANDARDS_SOURCE.url,
    )
  })

  it('gives the Profile link its own class, where its tap target is styled', () => {
    render(<AgeGradingSection gradedSex="male" />)

    expect(within(section()).getByRole('link', { name: 'Change age and sex' })).toHaveClass(
      'age-grading__link',
    )
  })

  it('lists four limits in plain words, the age one with its direction either way', () => {
    render(<AgeGradingSection gradedSex={null} />)

    const limits = within(section()).getAllByRole('listitem')
    expect(limits).toHaveLength(4)
    expect(limits[0]).toHaveTextContent(
      'Only the birth year is used, so until the birthday the age can be one year too high. That moves the grade by about a year’s change in the standard: up for adults, down for young athletes.',
    )
    expect(limits[1]).toHaveTextContent('The standards are for road races at sea level.')
    expect(limits[2]).toHaveTextContent(
      'Hilly courses and GPS error affect the pace and the measured distance, so a run’s grade is only as exact as its file.',
    )
    expect(limits[3]).toHaveTextContent(
      'A training effort is not a race. A grade shows how a training effort compares with the standard; it is not a race result or a ranking.',
    )
  })

  it('names the sex the grades are for when a grade is shown', () => {
    render(<AgeGradingSection gradedSex="female" />)

    expect(within(section()).getByText('Your grades are for a woman.')).toBeInTheDocument()
  })

  it('names no sex when no grade is shown', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(screen.queryByText(/Your grades are for a/)).not.toBeInTheDocument()
  })

  it('links to Profile to change the age and sex the grades use', () => {
    render(<AgeGradingSection gradedSex="male" />)

    expect(within(section()).getByRole('link', { name: 'Change age and sex' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('uses one term set, "level", and no vague words', () => {
    const { container } = render(<AgeGradingSection gradedSex="male" />)
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/\b(Female|Male|the athlete’s|in this period|ranking of you)\b/)
    expect(text).not.toMatch(/\bminutes\b/)
  })
})
