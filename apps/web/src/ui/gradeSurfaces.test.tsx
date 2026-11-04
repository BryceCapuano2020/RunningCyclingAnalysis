// @vitest-environment jsdom
import '../test/warmSample'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import type { AnalysisResult } from '@rca/core/pipeline'
import { AnalysisSession } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import { buildShareCard } from '../share/cardModel'
import { balanceLevels } from './pages/levelsModel'
import { BalanceLevels } from './pages/BalanceLevels'
import { SportAnswer } from './pages/SportAnswer'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'
import { standingOf } from './standing'
import { gradesOfStanding } from './thresholdGrade'

afterEach(cleanup)

/*
 * A sport's age grade at its threshold is one figure shown on the Balance levels, on the sport's page and on the share card
 * (docs/ENGINEERING.md, "One figure, one function"). Each test renders all three from one result and compares the level and the
 * percent they print, so a surface that works out a grade of its own fails here.
 */

const SPORTS: readonly Sport[] = ['run', 'ride']
const CONTEXT = { massKg: SAMPLE_SETTINGS.massKg, units: 'metric' } as const
const ALL_TIME: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }
const sample = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result!

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

/** The levels under the balance meter, by sport. */
function onLevels(result: AnalysisResult): Record<Sport, Printed> {
  const standing = standingOf(result, SAMPLE_PROFILE, CONTEXT)
  const grades = gradesOfStanding(result, standing)
  const model = balanceLevels({ grades, inPeriod: { run: 3, ride: 3 }, missingAge: null })
  render(<BalanceLevels model={model} />)
  const read = (sport: Sport): Printed => {
    const row = document.querySelector(`.balance-levels__row[data-sport="${sport}"]`)!
    // The first row's level is a term with its definition beside it; the level is the term the button wears.
    const level = row.querySelector('.balance-levels__level')!
    return {
      level: (level.querySelector('button') ?? level).textContent!,
      percent: row.querySelector('.balance-levels__grade')!.textContent!,
    }
  }
  const printed = { run: read('run'), ride: read('ride') }
  cleanup()
  return printed
}

/** The age grade at threshold on a sport's page. */
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

/** The grade line on a sport's hero of the share card: "Local · 61% at threshold". */
function onShareCard(result: AnalysisResult, sport: Sport): Printed {
  const standing = standingOf(result, SAMPLE_PROFILE, CONTEXT)
  const card = buildShareCard(
    result,
    SAMPLE_SETTINGS,
    'metric',
    ALL_TIME,
    true,
    null,
    true,
    standing.lead,
    gradesOfStanding(result, standing),
  )
  const line = card?.heroes.find((hero) => hero.sport === sport)?.grade
  const found = /^(.+) · (\d+%) at threshold$/.exec(line ?? '')
  if (found === null) throw new Error(`no grade on the ${sport} hero: ${line}`)
  return { level: found[1]!, percent: found[2]! }
}

describe.each([
  ['the sample', sample],
  ['a faster run', withRaised(sample, 'run', 1.1)],
  ['a slower ride', withRaised(sample, 'ride', 0.9)],
])('the grade at threshold for %s', (_name, result) => {
  const levels = onLevels(result)

  it.each(SPORTS)(
    'is the same level and percent for %s on the levels, the sport page and the share card',
    (sport) => {
      expect(levels[sport].percent).toMatch(/^\d+%$/)
      expect(onSportPage(result, sport)).toEqual(levels[sport])
      expect(onShareCard(result, sport)).toEqual(levels[sport])
    },
  )
})
