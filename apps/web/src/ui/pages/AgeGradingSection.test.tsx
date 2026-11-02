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
    expect(
      within(section()).getByText(
        'A run’s grade is the USATF road standards time for its distance, at your age and sex, divided by your time.',
      ),
    ).toBeInTheDocument()
    expect(within(section()).getByText('70% means 70% of standard pace.')).toBeInTheDocument()
    expect(
      within(section()).getByText(
        'Levels are bands of the grade: Local from 60%, Regional from 70%, National from 80%, World from 90%.',
      ),
    ).toBeInTheDocument()
    expect(within(section()).getByText('Below 60% is Recreational.')).toBeInTheDocument()
  })

  it('says a level name shows only when the whole range sits in one band, and the number alone otherwise', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByText('A level name shows only when the whole range sits in one band.'),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText(
        'Otherwise the number and its range show alone, with no level name.',
      ),
    ).toBeInTheDocument()
  })

  it('reads a run’s grade from its grade-adjusted pace, and names GAP as the recorded pace corrected for hills', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByText('A run’s grade uses its grade-adjusted pace (GAP).'),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText('GAP is the recorded pace, corrected for hills.'),
    ).toBeInTheDocument()
    expect(section()).not.toHaveTextContent(/flat pace|a fact from the file/)
  })

  it('says a ride grade is an estimate through its running equivalent', () => {
    render(<AgeGradingSection gradedSex={null} />)

    for (const line of [
      'A ride has no published cycling standard.',
      'Its best effort is converted to a running equivalent.',
      'That is the flat running speed that costs the same energy over the same time.',
      'The equivalent is graded like a run.',
      'So a ride grade is an estimate.',
    ]) {
      expect(within(section()).getByText(line)).toBeInTheDocument()
    }
    // The 90% range is explained once, in the energy view, so this paragraph does not repeat it.
    expect(section()).not.toHaveTextContent('Its range is the model’s 90% range')
  })

  it('says how Grade by duration is read: the best at each duration, the ride’s range, and where a sport is higher', () => {
    render(<AgeGradingSection gradedSex={null} />)

    for (const line of [
      'Grade by duration on Balance grades each sport’s best effort at each duration.',
      'A ride comes with its range.',
      'A sport is higher at a duration only where the run’s grade leaves the ride’s range.',
      'Inside that range, the two are level.',
    ]) {
      expect(within(section()).getByText(line)).toBeInTheDocument()
    }
  })

  it('explains why each effort is graded at its own date, and which date a ride takes', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByText('Each effort is graded at your age on its own date.'),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText('It is not graded at the newest activity’s date.'),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText('A ride takes the date of its own best ride at that duration.'),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText('Its running equivalent comes from that ride.'),
    ).toBeInTheDocument()
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

  it('lists the limits in plain words, one fact a line, the age one with its direction either way', () => {
    render(<AgeGradingSection gradedSex={null} />)

    const limits = within(section()).getAllByRole('listitem')
    expect(limits.map((limit) => limit.textContent)).toEqual([
      'Only the birth year is used.',
      'Until the birthday, the age can be one year too high.',
      'That moves the grade by about a year’s change in the standard.',
      'Up for adults, down for young athletes.',
      'The standards are for road races at sea level.',
      'Altitude, trail, track and cross-country are not adjusted for.',
      'Hilly courses and GPS error affect pace and measured distance.',
      'So a run’s grade is only as exact as its file.',
      'A training effort is not a race.',
      'A grade shows how a training effort compares with the standard.',
      'It is not a race result or a ranking.',
    ])
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

describe('AgeGradingSection level target', () => {
  it('says how the level target is worked out, in two lines: the ride equivalence and its range', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(
      within(section()).getByText(
        'The level target on Balance is the watts whose running equivalent grades to the other sport’s whole-percent grade.',
      ),
    ).toBeInTheDocument()
    expect(
      within(section()).getByText('Its range is the 5th to 95th percentile of the equivalence.'),
    ).toBeInTheDocument()
  })
})
