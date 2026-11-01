// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortMilestones } from '@rca/core/lookback'
import { RUN_YEARS, YEARS_LOOKBACK } from '../yearsFixtures'
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
    expect(
      screen.getByText('Needs 40 steady rides over 52 weeks. You have 23 over 19.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('lists the stretches with no steady runs and none at all, the bests by year, and what the caps left out', () => {
    const month = (y: number, m: number) => Date.UTC(y, m - 1, 1)
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 1200 },
      unit: 'm/s',
      best: { value: 3.5, atMs: month(2021, 5), id: 'a' },
      years: [
        { year: 2020, partial: false, value: 3.2, id: 'b', n: 30 },
        { year: 2021, partial: false, value: 3.5, id: 'a', n: 40 },
      ],
      omittedYears: 0,
      steps: [],
      verdicts: [{ year: 2021, verdict: 'higher' }],
    }
    const rich = {
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: {
          ...YEARS_LOOKBACK.sports.run,
          fitness: {
            ...RUN_YEARS,
            thin: [{ fromMs: month(2022, 9), toMs: month(2022, 12) }],
            breaks: [{ fromMs: month(2020, 1), toMs: month(2020, 4) }],
            omittedEpisodes: 3,
            omittedSpans: 1,
          },
          milestones: [best],
        },
      },
    }
    render(<YearsSection sport="run" lookBack={rich} units="metric" />)
    const quiet = screen.getByRole('region', { name: 'Quiet stretches' })
    expect(quiet).toHaveTextContent(/No steady runs from September to December 2022\./)
    expect(quiet).toHaveTextContent(/No runs from January to April 2020\./)
    expect(quiet).toHaveTextContent(/And 1 smaller stretch\./)
    expect(screen.getByRole('region', { name: 'Episodes' })).toHaveTextContent(
      /And 3 smaller changes\./,
    )
    const bests = screen.getByRole('region', { name: 'Bests by year' })
    expect(bests).toHaveTextContent(/Best 20 min: /)
    expect(bests).toHaveTextContent(/Faster in 2021 than in 2020\./)
  })
})
