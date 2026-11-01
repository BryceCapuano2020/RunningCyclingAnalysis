import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { combine } from './digest/combine'
import { digestActivity } from './digest/digestActivity'
import { libraryCurves } from './digest/libraryCurves'
import { AnalysisSession } from './session'
import { DEFAULT_ATHLETE, sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: 9 }
const DIGESTS = sampleDataset().activities.map((a) => digestActivity(a))

describe('the library’s bests', () => {
  it('are the run and measured ride curves an analysis of the whole library works out', () => {
    const analysis = combine(DIGESTS, SETTINGS)
    expect(libraryCurves(DIGESTS, SETTINGS)).toEqual({
      runCurve: analysis.runCurve,
      rideMeasuredCurve: analysis.rideMeasuredCurve,
    })
  })

  it('are carried by a period short of activities, and are the all-time ones', () => {
    const session = new AnalysisSession()
    session.loadDigests([...DIGESTS], SETTINGS)
    const everything = session.setRange('all', SETTINGS)
    const week = session.setRange(7, SETTINGS)
    expect(week.libraryBests).toEqual({
      run: everything.result!.runCurve,
      ride: everything.result!.rideMeasuredCurve,
    })
  })

  it('are not carried for all time, whose result holds them', () => {
    const session = new AnalysisSession()
    session.loadDigests([...DIGESTS], SETTINGS)
    expect(session.setRange('all', SETTINGS).libraryBests).toBeNull()
  })

  it('are not carried for a library with nothing in it', () => {
    expect(new AnalysisSession().setSettings(SETTINGS).libraryBests).toBeNull()
  })
})
