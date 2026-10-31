// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { YEARS_LOOKBACK } from '../yearsFixtures'
import { YearsSection } from './YearsSection'

afterEach(cleanup)

describe('the "Your years" section', () => {
  it('has the chart, the episodes, the quiet stretches and nothing said of now', () => {
    render(<YearsSection sport="run" lookBack={YEARS_LOOKBACK} units="metric" />)
    expect(
      screen.getByRole('figure', { name: 'Pace at 148 bpm over the years' }),
    ).toBeInTheDocument()
    const episodes = screen.getByRole('region', { name: 'Episodes' })
    expect(
      within(episodes)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringMatching(/^May 2021 to January 2022\. Slipped about 8\.7%/),
      expect.stringMatching(/^From June 2023\. Slipped about 6\.4%.*still lower in August 2024/),
    ])
    const quiet = screen.getByRole('region', { name: 'Quiet stretches' })
    expect(quiet).toHaveTextContent(
      /January 2022 to June 2023\. Stayed within 3%\. 140 steady runs\./,
    )
    expect(screen.getByTestId('years-section').textContent).not.toMatch(/\bnow\b/i)
  })

  it('says what a short library needs, in the section and nowhere else', () => {
    const short = {
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        ride: {
          ...YEARS_LOOKBACK.sports.ride,
          fitness: {
            kind: 'too-short',
            steady: 23,
            weeks: 19,
            needSteady: 40,
            needWeeks: 52,
          } as const,
        },
      },
    }
    render(<YearsSection sport="ride" lookBack={short} units="metric" />)
    expect(screen.getByText(/So far there are 23 steady runs over 19 weeks\./)).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })
})
