// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { AgeGradingSection } from './AgeGradingSection'

afterEach(() => {
  cleanup()
})

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Age grading' })
}

describe('AgeGradingSection', () => {
  it('says how a run is graded, and the levels, with Below 60% as Recreational', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Age grading' })).toBeInTheDocument()
    expect(section()).toHaveTextContent(
      'A run is graded against the USATF road standards for the athlete’s age and sex: the standard time for the distance covered, divided by the time taken. A grade of 70% means the run was at 70% of the standard pace. Levels are bands of that grade: Local from 60%, Regional from 70%, National from 80%, World from 90%. Below 60% is Recreational.',
    )
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

  it('calls a run one activity’s estimate, and a ride’s range the model’s range', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent('A run’s grade is one activity’s estimate.')
    expect(section()).toHaveTextContent(
      'Its range is the model’s 90% range for that conversion, so it is an estimate too.',
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

  it('says age is counted from the birth year on the date of each effort', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(section()).toHaveTextContent(
      'Age is counted from your birth year on the date of each effort.',
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
    expect(limits[2]).toHaveTextContent('Hilly courses and GPS error')
    expect(limits[3]).toHaveTextContent('A training effort is not a race.')
  })

  it('names the sex the grades are for when a grade is shown', () => {
    render(<AgeGradingSection gradedSex="female" />)

    expect(within(section()).getByText('Your grades are for a woman.')).toBeInTheDocument()
  })

  it('names no sex when no grade is shown', () => {
    render(<AgeGradingSection gradedSex={null} />)

    expect(screen.queryByText(/Your grades are for a/)).not.toBeInTheDocument()
  })
})
