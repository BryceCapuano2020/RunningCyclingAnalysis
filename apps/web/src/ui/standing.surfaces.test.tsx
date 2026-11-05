// @vitest-environment jsdom
import '../test/warmSample'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { Period } from '@rca/core/period'
import type { AnalysisResult } from '@rca/core/pipeline'
import { AnalysisSession } from '@rca/core/session'
import { formatPaceValue } from '@rca/core/units'
import { buildShareCard } from '../share/cardModel'
import { draw } from '../share/fixtures'
import { whatMoved } from './analysis/whatMoved'
import { balanceOfPick } from './components/balanceScale'
import { formatGrade } from './gradeFormat'
import { heldPick } from './resultHold'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'
import { balanceLevels } from './pages/levelsModel'
import { BalanceHero } from './pages/BalanceHero'
import { BalanceLevels } from './pages/BalanceLevels'
import { BalanceTiles } from './pages/BalanceTiles'
import { CrossSportCard } from './pages/CrossSportCard'
import { MethodPage } from './pages/MethodPage'
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

/** The run's threshold raised by `factor`, with a range around it: the balance leans toward running. */
function withRunRaised(base: AnalysisResult, factor: number): AnalysisResult {
  const raised = base.runThreshold!.value * factor
  return {
    ...base,
    runThreshold: { ...base.runThreshold!, value: raised, low: raised * 0.97, high: raised * 1.03 },
  }
}

/** What a surface prints of the lead: its points and the sport it favours. */
interface PrintedLead {
  points: number
  toward: string
}

/** The lead as the hero, the Method page and the share card word it: "Running grades 9 points higher (2 to 16)". */
function printedGrades(text: string): PrintedLead {
  const found = /(running|cycling) grades (\d+) points? higher/i.exec(text)
  if (found === null) throw new Error(`no lead printed in: ${text}`)
  return { points: Number(found[2]), toward: found[1]!.toLowerCase() }
}

/** The lead as the import notice words it, once the lean has held and the centre moved: "(4 → 6 points)". */
function printedMove(text: string): PrintedLead {
  const found = /toward (running|cycling) \(\d+ → (\d+) points\)/.exec(text)
  if (found === null) throw new Error(`no lead printed in: ${text}`)
  return { points: Number(found[2]), toward: found[1]! }
}

describe('one lead, printed the same on every surface', () => {
  // Raised twice by different amounts, so the import notice has a centre that moved with the lean held.
  const before = withRunRaised(result, 1.08)
  const after = withRunRaised(result, 1.15)
  const standingAfter = standingOf(after, SAMPLE_PROFILE, {
    massKg: SAMPLE_SETTINGS.massKg,
    units: 'metric',
  })
  const lead = standingAfter.lead!
  const gradesAfter = gradesOfStanding(after, standingAfter)
  const ALL_TIME: Period = {
    choice: 'all',
    startMs: null,
    endMs: null,
    days: null,
    fellBack: false,
  }

  it('prints the same points and direction on the hero, the import notice, the Method page and the share card', () => {
    // The lead worth comparing leans, and has moved from the earlier result without changing its lean.
    const leadBefore = standingOf(before, SAMPLE_PROFILE).lead!
    expect(lead.lean).toBe('run')
    expect(leadBefore.lean).toBe('run')
    expect(Math.abs(lead.centre)).toBeGreaterThan(Math.abs(leadBefore.centre))
    const expected: PrintedLead = { points: Math.abs(lead.centre), toward: 'running' }

    const pick = heldPick(after).pick
    const reading = balanceOfPick(lead, pick)
    render(
      <BalanceHero
        result={after}
        library={state.library}
        pick={pick}
        reading={reading}
        period={ALL_TIME}
        onShowAll={() => {}}
        weightKnown
      />,
    )
    const hero = printedGrades(document.querySelector('.balance-hero__lede')!.textContent ?? '')
    cleanup()

    const method = (() => {
      render(
        <MethodPage
          result={after}
          heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
          units="metric"
          profile={SAMPLE_PROFILE}
          weightKnown
        />,
      )
      const answer = screen.getByRole('list', { name: 'The short answer' }).textContent ?? ''
      cleanup()
      return printedGrades(answer)
    })()

    const card = buildShareCard(
      after,
      SAMPLE_SETTINGS,
      'metric',
      ALL_TIME,
      true,
      null,
      true,
      lead,
      gradesAfter,
    )
    if (card === null) throw new Error('the sample offers a card')
    const share = printedGrades(
      draw(card, 'story')
        .texts.map((drawn) => drawn.text)
        .join(' '),
    )

    const moves = whatMoved(before, after, SAMPLE_SETTINGS, 'metric', SAMPLE_PROFILE)
    const notice = printedMove(moves.map((item) => item.text).join(' '))

    expect(hero).toEqual(expected)
    expect(method).toEqual(expected)
    expect(share).toEqual(expected)
    expect(notice).toEqual(expected)
  })
})
