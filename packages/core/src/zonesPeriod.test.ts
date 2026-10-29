import { describe, expect, it } from 'vitest'
import { combine, digestActivity } from './digest'
import { splitPeriods } from './period'
import type { PeriodChoice } from './period'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const PERIODS: PeriodChoice[] = [7, 14, 28, 84, 'all']

/** The sample's digests, each given a higher maximum heart rate than the one before, so the periods' own maxima differ. */
const DIGESTS: ActivityDigest[] = sampleDataset()
  .activities.map(digestActivity)
  .sort((a, b) => a.startMs - b.startMs)
  .map((digest, i) =>
    Object.assign(digest, { maxHeartRate: digest.maxHeartRate === null ? null : 150 + i }),
  )

describe('zones do not depend on the period picked', () => {
  const session = new AnalysisSession()
  session.loadDigests(DIGESTS, SETTINGS)
  const states = PERIODS.map((choice) => session.setRange(choice, SETTINGS))

  it('gives the periods different references of their own, so the test can tell', () => {
    const own = PERIODS.map(
      (choice) => combine(splitPeriods(DIGESTS, choice).selected, SETTINGS).runObservedMaxHeartRate,
    )
    expect(new Set(own).size).toBeGreaterThan(1)
  })

  it('cuts the same zones for one activity under every period', () => {
    const at = DIGESTS[0]!.startMs
    const first = JSON.stringify(
      session.setRange(PERIODS[0]!, SETTINGS) && session.zonesAt(at, SETTINGS),
    )
    for (const choice of PERIODS) {
      session.setRange(choice, SETTINGS)
      expect(JSON.stringify(session.zonesAt(at, SETTINGS))).toBe(first)
    }
    expect(first).not.toBe('[]')
  })

  it('holds one set of zone references for every period, and the library’s reference heart rates', () => {
    const [head, ...rest] = states.map((state) => JSON.stringify(state.zoneEstimates))
    expect(head).toBeDefined()
    expect(rest.every((other) => other === head)).toBe(true)
    for (const state of states) {
      expect(state.zoneEstimates?.runMaxHeartRate).toBe(state.heartRateJudgement.referenceHr.run)
      expect(state.zoneEstimates?.rideMaxHeartRate).toBe(state.heartRateJudgement.referenceHr.ride)
    }
  })

  it('reports the library’s reference heart rates in every period’s own analysis, as Method does', () => {
    for (const state of states) {
      expect(state.result?.runMaxHeartRate).toBe(state.heartRateJudgement.referenceHr.run)
      expect(state.result?.rideMaxHeartRate).toBe(state.heartRateJudgement.referenceHr.ride)
    }
  })

  it('takes its thresholds from an analysis of the whole library', () => {
    const library = combine(DIGESTS, SETTINGS, {
      heartRateSetAside: new Set(states[0]!.heartRateJudgement.setAside),
      calibration: states[0]!.heartRateJudgement.calibration,
    })
    expect(library.runCp).not.toBeNull()
    expect(states[0]!.zoneEstimates?.runCp).toEqual(library.runCp)
    expect(states[0]!.zoneEstimates?.rideCp).toEqual(library.rideCp)
  })
})
