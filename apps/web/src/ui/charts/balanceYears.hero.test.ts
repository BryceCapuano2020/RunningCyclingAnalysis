import { describe, expect, it } from 'vitest'
import { balanceLibrary } from '@rca/core/history/test/balanceLibrary'
import type { PeriodChoice } from '@rca/core/period'
import { AnalysisSession } from '@rca/core/session'
import { PROFILE, SETTINGS, TWELVE_YEARS } from '../balanceFixtures'
import { headlineGrades } from '../grades'
import type { GradeOutcome } from '../grades'
import { yearViews } from './balanceYears'

/** The grades the hero reads for a window of the library, run and ride. */
function heroFor(session: AnalysisSession, choice: PeriodChoice) {
  const state = session.setRange(choice, SETTINGS)
  return { hero: headlineGrades(state.result!, PROFILE), history: state.history }
}

const gradeOf = (outcome: GradeOutcome | undefined) =>
  outcome?.kind === 'graded' ? outcome.grade : null

describe('the chart against the Balance hero', () => {
  const session = new AnalysisSession()
  session.loadDigests(balanceLibrary(TWELVE_YEARS), SETTINGS)

  it('grades each year to the number the hero has for a window of just that year', () => {
    const views = yearViews(session.setRange('all', SETTINGS).history.balance, PROFILE, true)
    const graded = views.filter((view) => Object.keys(view.grades).length > 0)
    expect(graded).toHaveLength(11)
    for (const view of graded) {
      const { hero } = heroFor(session, { from: `${view.year}-01-01`, to: `${view.year}-12-31` })
      expect(view.grades.run?.grade ?? null).toEqual(gradeOf(hero.run))
      expect(view.grades.ride?.grade ?? null).toEqual(gradeOf(hero.ride))
    }
  })

  it('grades a library inside one year to the number the hero has for all of it', () => {
    const oneYear = new AnalysisSession()
    oneYear.loadDigests(
      balanceLibrary([{ year: 2022, run: { scale: 1.02 }, ride: { scale: 0.95 } }]),
      SETTINGS,
    )
    const { hero, history } = heroFor(oneYear, 'all')
    const [view] = yearViews(history.balance, PROFILE, true)
    expect(view!.grades.run!.grade).toEqual(gradeOf(hero.run))
    expect(view!.grades.ride!.grade).toEqual(gradeOf(hero.ride))
  })
})
