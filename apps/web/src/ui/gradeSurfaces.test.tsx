// @vitest-environment jsdom
import '../test/warmSample'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import type { AnalysisResult } from '@rca/core/pipeline'
import { AnalysisSession } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import { triangleGeometry } from '@rca/core/standing'
import { buildShareCard } from '../share/cardModel'
import { LevelTriangle } from './components/LevelTriangle'
import { SportAnswer } from './pages/SportAnswer'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'
import { standingOf } from './standing'
import { gradesOfStanding } from './thresholdGrade'
import { halfForecastFor } from './runHalf'
import { triangleViewOf } from './triangleSports'

afterEach(cleanup)

/*
 * A sport's age grade (a run's by its forecast half) is one figure shown on the Balance triangle, on the sport's page and on the share card
 * (docs/ENGINEERING.md, "One figure, one function"). Each test renders all three from one result and compares the level and the
 * percent they print, so a surface that works out a grade of its own fails here.
 */

const SPORTS: readonly Sport[] = ['run', 'ride']
const CONTEXT = { massKg: SAMPLE_SETTINGS.massKg, units: 'metric' } as const
const ALL_TIME: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }
const sample = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result!

/** The run's forecast half for a result, asked as the sport page below asks it (all time, no library beyond the result). */
const halfOf = (result: AnalysisResult) => halfForecastFor({ result, rangeDays: null, library: [] })

/** The result with a sport's threshold raised, so the grades under test are not one pair of numbers. */
function withRaised(base: AnalysisResult, sport: Sport, factor: number): AnalysisResult {
  const found = sport === 'run' ? base.runThreshold! : base.rideThreshold!
  const raised = {
    ...found,
    value: found.value * factor,
    low: found.low * factor,
    high: found.high * factor,
  }
  return sport === 'run' ? { ...base, runThreshold: raised } : { ...base, rideThreshold: raised }
}

/** What a surface prints of a grade: its level and its whole percent. */
interface Printed {
  level: string
  percent: string
}

/** The corners of the level triangle, by sport. */
function onLevels(result: AnalysisResult): Record<Sport, Printed> {
  const standing = standingOf(result, SAMPLE_PROFILE, CONTEXT, halfOf(result))
  const grades = gradesOfStanding(result, standing)
  render(<LevelTriangle view={triangleViewOf(grades)} />)
  const read = (sport: Sport): Printed => {
    const corner = document.querySelector(`.level-triangle__corner[data-sport="${sport}"]`)!
    return {
      level: corner.querySelector('.level-triangle__level')!.textContent!,
      percent: corner.querySelector('.level-triangle__figure')!.textContent!,
    }
  }
  const printed = { run: read('run'), ride: read('ride') }
  cleanup()
  return printed
}

/** The age grade on a sport's page. */
function onSportPage(result: AnalysisResult, sport: Sport): Printed {
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
  const printed = {
    level: document.querySelector('.sport-hero__level-name')!.textContent!,
    percent: document.querySelector('.sport-hero__level-value')!.textContent!,
  }
  cleanup()
  return printed
}

/** A sport's level and percent on the share card's triangle. */
function onShareCard(result: AnalysisResult, sport: Sport): Printed {
  const standing = standingOf(result, SAMPLE_PROFILE, CONTEXT, halfOf(result))
  const card = buildShareCard(
    result,
    SAMPLE_SETTINGS,
    'metric',
    ALL_TIME,
    true,
    true,
    standing.lead,
    gradesOfStanding(result, standing),
  )
  const corner = triangleGeometry(card!.triangle.grades, 1).corners[sport]
  if (corner.percent === null) throw new Error(`no grade on the ${sport} corner`)
  return { level: corner.level!, percent: `${corner.percent}%` }
}

describe.each([
  ['the sample', sample],
  ['a faster run', withRaised(sample, 'run', 1.1)],
  ['a slower ride', withRaised(sample, 'ride', 0.9)],
])('the grade for %s', (_name, result) => {
  const levels = onLevels(result)

  it.each(SPORTS)(
    'is the same level and percent for %s on the triangle, the sport page and the share card',
    (sport) => {
      expect(levels[sport].percent).toMatch(/^\d+%$/)
      expect(onSportPage(result, sport)).toEqual(levels[sport])
      expect(onShareCard(result, sport)).toEqual(levels[sport])
    },
  )
})
