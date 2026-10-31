import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest'
import { AnalysisSession } from './session'
import type { Activity, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 86_400_000

/** A flat 10 km run at 4 m/s, digested with the given distance bests and start. */
function runDigest(
  id: string,
  startMs: number,
  distanceBests: { distanceM: number; seconds: number }[],
) {
  const n = 2501
  const activity: Activity = {
    id,
    name: id,
    sport: 'run',
    startMs,
    n,
    speed: new Float64Array(n).fill(4),
    distance: Float64Array.from({ length: n }, (_, i) => 4 * i),
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(NaN),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
  return { ...digestActivity(activity), distanceBests }
}

describe('AnalysisSession records', () => {
  it('holds records across the whole library, not only the period', () => {
    // The old run is more than 42 days before the newest, so the period leaves it out.
    const old = runDigest('old', 0, [{ distanceM: 5000, seconds: 1200 }])
    const recent = runDigest('recent', 60 * DAY_MS, [{ distanceM: 5000, seconds: 1250 }])
    const session = new AnalysisSession()
    session.loadDigests([old, recent], SETTINGS)
    const state = session.setRange(42, SETTINGS)
    expect(state.result?.activities.map((a) => a.id)).toEqual(['recent'])
    expect(state.records.get('old')).toContainEqual({ kind: 'distance', distanceM: 5000 })
    expect(state.records.has('recent')).toBe(false)
  })

  it('does not change the records when only the period changes', () => {
    const digests = [
      runDigest('old', 0, [{ distanceM: 5000, seconds: 1200 }]),
      runDigest('recent', 60 * DAY_MS, [{ distanceM: 5000, seconds: 1250 }]),
    ]
    const session = new AnalysisSession()
    const whole = session.loadDigests(digests, SETTINGS).records
    expect(session.setRange(42, SETTINGS).records).toEqual(whole)
  })

  it('keeps the same records object while the library and masses are unchanged', () => {
    const session = new AnalysisSession()
    session.loadDigests([runDigest('a', 0, [{ distanceM: 5000, seconds: 1200 }])], SETTINGS)
    const first = session.setRange(42, SETTINGS)
    const second = session.setRange('all', SETTINGS)
    expect(second.records).toBe(first.records)
  })

  it('returns exactly the state fields, with nothing from the cache', () => {
    const session = new AnalysisSession()
    session.loadDigests([runDigest('a', 0, [{ distanceM: 5000, seconds: 1200 }])], SETTINGS)
    const cached = session.setRange('all', SETTINGS)
    expect(Object.keys(cached).sort()).toEqual(
      [
        'countedWalkingRuns',
        'effortTrends',
        'fitness',
        'lookBack',
        'heartRateJudgement',
        'zoneEstimates',
        'hiddenDuplicates',
        'incompatibleActivities',
        'libraryActivities',
        'heldOut',
        'isSample',
        'library',
        'period',
        'outdatedActivities',
        'previous',
        'change',
        'rejected',
        'records',
        'result',
        'sameHeartRate',
        'lateEvidence',
        'syncIssues',
        'timeInZones',
        'totalActivities',
        'trend',
        'unsupportedFiles',
        'walkingPaceRuns',
      ].sort(),
    )
  })

  it('has no records with nothing loaded', () => {
    expect(new AnalysisSession().setRange(42, SETTINGS).records.size).toBe(0)
  })
})
