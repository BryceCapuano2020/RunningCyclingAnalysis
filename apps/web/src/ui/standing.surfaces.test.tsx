// @vitest-environment jsdom
import '../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { formatPaceValue } from '@rca/core/units'
import { formatGrade } from './gradeFormat'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'
import { balanceLevels } from './pages/levelsModel'
import { BalanceLevels } from './pages/BalanceLevels'
import { BalanceTiles } from './pages/BalanceTiles'
import { CrossSportCard } from './pages/CrossSportCard'
import { SportAnswer } from './pages/SportAnswer'
import { standingOf } from './standing'
import { gradesOfStanding } from './thresholdGrade'

afterEach(cleanup)

const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
const result = state.result!
const standing = standingOf(result, SAMPLE_PROFILE, {
  massKg: SAMPLE_SETTINGS.massKg,
  units: 'metric',
})
const grades = gradesOfStanding(result, standing)

describe('one standing, read by every surface', () => {
  it('prints the same threshold grade on the levels under the meter and on each sport page', () => {
    const rows = balanceLevels({ grades, inPeriod: { run: 3, ride: 3 }, missingAge: null }).rows
    for (const sport of ['run', 'ride'] as const) {
      const outcome = standing.grades[sport]
      if (outcome.kind !== 'graded') throw new Error(`${sport} is graded in the sample`)
      const printed = formatGrade(outcome.grade.centre.grade)
      expect(rows.find((row) => row.sport === sport)?.grade).toBe(printed)
      cleanup()
      render(
        <SportAnswer
          sport={sport}
          result={result}
          massKg={SAMPLE_SETTINGS.massKg}
          units="metric"
          profile={SAMPLE_PROFILE}
          missingAge={null}
          count={3}
          held={false}
          rangeDays={null}
          emptyText=""
          inLibrary={3}
          onShowAll={() => {}}
          onAddFiles={() => {}}
        />,
      )
      expect(document.body).toHaveTextContent(printed)
    }
  })

  it('prints the same ride as a run on the cross-sport card and on the balance tile', () => {
    const pace = formatPaceValue(standing.rideAsRun!.p50, 'metric')
    render(
      <CrossSportCard result={result} units="metric" weighted massKg={SAMPLE_SETTINGS.massKg} />,
    )
    const alone = screen.getByRole('article', { name: 'Your ride as a run' }).textContent
    expect(alone).toContain(pace)
    cleanup()
    render(
      <BalanceTiles
        result={result}
        library={state.library}
        units="metric"
        massKg={SAMPLE_SETTINGS.massKg}
        grades={grades}
        weighted
        period={{ choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }}
        onAddFiles={() => {}}
      />,
    )
    expect(screen.getByRole('article', { name: 'Your ride as a run' }).textContent).toBe(alone)
  })

  it('prints the levels from the same grades the lead is made of', () => {
    render(
      <BalanceLevels
        model={balanceLevels({ grades, inPeriod: { run: 3, ride: 3 }, missingAge: null })}
      />,
    )
    const run = standing.grades.run
    if (run.kind !== 'graded' || standing.lead === null) throw new Error('graded')
    expect(document.body).toHaveTextContent(formatGrade(run.grade.centre.grade))
  })
})
