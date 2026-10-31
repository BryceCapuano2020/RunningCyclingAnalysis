import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { digestActivity } from './digest'
import { withRevisionTable } from './digest/revisions'
import type { RevisionDeclaration } from './digest/revisions'
import { workoutKey } from './duplicates'
import { AnalysisSession } from './session'
import { sampleSeason } from './synthetic'
import type { ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})

/** Revision 6 is current; revision 5 is read beside it; revision 4 and below are held out. */
const TABLE: readonly RevisionDeclaration[] = [
  ...[1, 2, 3, 4, 5].map(exclusive),
  {
    revision: 6,
    kind: 'mixable',
    adds: [],
    changes: [],
    affects: ['trend'],
    holdsBack: ['fitness'],
    bound: 'mixingStudy',
  },
]

const season = sampleSeason().activities.map((activity) => digestActivity(activity))
const [first, second] = season
if (first === undefined || second === undefined) throw new Error('The season has fewer than two')
const at = (digest: ActivityDigest, modelRevision: number): ActivityDigest => ({
  ...digest,
  modelRevision,
})
const keyOf = (digest: ActivityDigest) => workoutKey(digest.sport, digest.startMs)

describe('AnalysisSession.replaceDigest', () => {
  it('moves a held-out digest to the current ones, and the next state counts it', () =>
    withRevisionTable(TABLE, () => {
      const session = new AnalysisSession()
      const before = session.loadDigests([at(first, 4), at(second, 6)], SETTINGS)
      expect(before.outdatedActivities).toBe(1)
      expect(session.hasOutdated(first.sport, first.startMs)).toBe(true)

      expect(session.replaceDigest(keyOf(first), at(first, 6))).toBe(true)

      expect(session.hasOutdated(first.sport, first.startMs)).toBe(false)
      const after = session.setSettings(SETTINGS)
      expect(after.outdatedActivities).toBe(0)
      expect(after.totalActivities).toBe(before.totalActivities + 1)
      expect(after.libraryActivities).toBe(before.libraryActivities)
    }))

  it('moves a compatible digest to the current ones', () =>
    withRevisionTable(TABLE, () => {
      const session = new AnalysisSession()
      session.loadDigests([at(first, 5)], SETTINGS)
      expect(session.replaceDigest(keyOf(first), at(first, 6))).toBe(true)
      const state = session.setSettings(SETTINGS)
      expect(state.libraryActivities).toBe(1)
      expect(state.totalActivities).toBe(1)
    }))

  it('leaves a workout the library already holds at a higher rank as it is', () =>
    withRevisionTable(TABLE, () => {
      const session = new AnalysisSession()
      session.loadDigests([at(first, 6)], SETTINGS)
      expect(session.replaceDigest(keyOf(first), at(first, 4))).toBe(false)
      expect(session.setSettings(SETTINGS).outdatedActivities).toBe(0)
    }))

  it('adds a workout the library does not hold yet, under its own status', () =>
    withRevisionTable(TABLE, () => {
      const session = new AnalysisSession()
      session.loadDigests([at(second, 6)], SETTINGS)
      expect(session.replaceDigest(keyOf(first), at(first, 4))).toBe(true)
      expect(session.setSettings(SETTINGS).outdatedActivities).toBe(1)
    }))
})
