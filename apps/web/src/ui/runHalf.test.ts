import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { HALF_MARATHON_M } from '@rca/core/constants'
import { AnalysisSession } from '@rca/core/session'
import { runLevelTimes } from '@rca/core/standing'
import { withoutWalking } from './analysis/walkingPaceCopy'
import { levelRangeRows } from './levelRanges'
import { headlineHalf, raceAnswerFor } from './raceAnswer'
import { halfForecastFor, halfForecastOf } from './runHalf'
import { SAMPLE_SETTINGS, sampleProfileAt } from './sampleAthlete'
import { standingOf } from './standing'
import { thresholdGrade } from './thresholdGrade'

/*
 * One figure for the run: the half Balance's row leads with is the run's grade on Balance and the Run hero, and the row the Run
 * page's levels table marks is the band that time falls in (docs/ENGINEERING.md, "One figure, one function"). The sample athlete
 * is synthetic.
 */
describe('the run graded by its forecast half', () => {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  const result = state.result!
  const library = withoutWalking(state.library)
  const profile = sampleProfileAt(state.library[0]!.startMs)
  const context = {
    result,
    rangeDays: state.period.days,
    library,
    heartRateJudgement: state.heartRateJudgement,
    periodEndMs: state.period.endMs,
  }

  it('reads the same half as Balance’s row, and grades the run by it on every surface', () => {
    const half = headlineHalf(raceAnswerFor('run', context))
    expect(half).not.toBeNull()
    const forecast = halfForecastFor(context)!
    expect(forecast).toEqual(halfForecastOf(half, context))
    expect(forecast.seconds).toBe(half!.seconds)
    const balance = standingOf(
      result,
      profile,
      { massKg: SAMPLE_SETTINGS.massKg, units: 'metric' },
      forecast,
    )
    const hero = thresholdGrade(result, 'run', profile, forecast)
    expect(balance.grades.run.kind).toBe('graded')
    expect(hero.kind).toBe('graded')
    if (balance.grades.run.kind !== 'graded' || hero.kind !== 'graded') return
    expect(hero.grade.centre).toEqual(balance.grades.run.grade.centre)

    // The table marks the level the grade names, and that row's band holds the half's time.
    const level = balance.grades.run.grade.centre.level
    const bands = runLevelTimes(profile, forecast.atMs, HALF_MARATHON_M)!
    const rows = levelRangeRows('run', bands, 'metric', level)
    const marked = rows.findIndex((row) => row.mine)
    expect(rows[marked]!.label).toBe(level)
    const band = bands[marked]!
    const seconds = Math.round(forecast.seconds)
    expect(band.worst === null || seconds <= band.worst).toBe(true)
    expect(band.best === null || seconds >= band.best).toBe(true)
  })

  it('falls back to the threshold grade on every surface without a forecast', () => {
    const balance = standingOf(
      result,
      profile,
      { massKg: SAMPLE_SETTINGS.massKg, units: 'metric' },
      null,
    )
    const plain = standingOf(result, profile)
    expect(balance.grades.run).toEqual(plain.grades.run)
    expect(thresholdGrade(result, 'run', profile, null)).toEqual(
      thresholdGrade(result, 'run', profile),
    )
  })
})
