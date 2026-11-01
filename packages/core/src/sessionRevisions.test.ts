import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { digestActivity } from './digest'
import { withRevisionTable, withRevisionTableAsync } from './digest/revisions'
import type { RevisionDeclaration } from './digest/revisions'
import { AnalysisSession } from './session'
import type { ImportCompletion } from './sessionHooks'
import { sampleDataset, sampleSeason } from './synthetic'
import type { Activity, ActivityDigest, AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})

/** Revision 7 is the current one, as in production, but made mixable here: revision 6 is read beside it and revision 5 is stale. */
const MIXED: readonly RevisionDeclaration[] = [
  ...[1, 2, 3, 4, 5, 6].map(exclusive),
  {
    revision: 7,
    kind: 'mixable',
    adds: [],
    changes: [],
    affects: ['trend'],
    holdsBack: ['fitness'],
    bound: 'mixingStudy',
  },
]
const CURRENT = 7
const COMPATIBLE = 6
const STALE = 5
const NEWER = 8

const run: Activity = sampleDataset().activities.find((a) => a.sport === 'run')!

function fitFile(activity: Activity): File {
  return new File([new Uint8Array(encodeFit(activity, { gps: true }))], 'run.fit')
}

const stamped = (digest: ActivityDigest, modelRevision: number): ActivityDigest => ({
  ...digest,
  modelRevision,
})

/** The season, its oldest part on the compatible model, a few digests stale and one newer. */
function mixedSeason() {
  const all = digestSeason()
  const cut = Math.floor(all.length * 0.4)
  return {
    stale: all.slice(0, 3).map((d) => stamped(d, STALE)),
    compatible: all.slice(3, cut).map((d) => stamped(d, COMPATIBLE)),
    current: all.slice(cut, -1).map((d) => stamped(d, CURRENT)),
    newer: stamped(all.at(-1)!, NEWER),
  }
}

function digestSeason(): ActivityDigest[] {
  return sampleSeason()
    .activities.map((activity) => digestActivity(activity))
    .sort((a, b) => a.startMs - b.startMs)
}

describe('a session library with compatible, stale and newer digests', () => {
  it('reads current and compatible digests, lists the held-out ones and counts every one', () => {
    const { stale, compatible, current, newer } = mixedSeason()
    const state = withRevisionTable(MIXED, () =>
      new AnalysisSession().loadDigests([...stale, ...compatible, ...current, newer], SETTINGS),
    )
    expect(state.totalActivities).toBe(compatible.length + current.length)
    expect(state.outdatedActivities).toBe(stale.length)
    expect(state.incompatibleActivities).toBe(1)
    expect(state.libraryActivities).toBe(stale.length + compatible.length + current.length + 1)
    expect(state.heldOut).toHaveLength(stale.length + 1)
    expect(state.heldOut.filter((h) => h.status === 'newer').map((h) => h.id)).toEqual([newer.id])
    const listed = new Set(state.library.map((summary) => summary.id))
    expect([...compatible, ...current].every((d) => listed.has(d.id))).toBe(true)
    expect([...stale, newer].some((d) => listed.has(d.id))).toBe(false)
  })

  it('gives each consumer the digests its rule allows: trend reads compatible, fitness is held back', () => {
    const { stale, compatible, current, newer } = mixedSeason()
    // All time, so the compatible digests (the oldest) are inside the period.
    const allTime = (digests: ActivityDigest[]) => {
      const session = new AnalysisSession()
      session.loadDigests(digests, SETTINGS)
      return session.setRange('all', SETTINGS)
    }
    const state = withRevisionTable(MIXED, () =>
      allTime([...stale, ...compatible, ...current, newer]),
    )
    // What a library of those digests gives when every read digest is current, and when only the current ones are.
    const everyRead = allTime([...compatible, ...current].map((d) => stamped(d, CURRENT)))
    const currentOnly = allTime(current)

    expect(state.trend).toEqual(everyRead.trend)
    expect(state.result?.activities).toHaveLength(everyRead.result!.activities.length)
    expect(state.fitness).toEqual(currentOnly.fitness)
    // The two differ, so the equalities above prove the routing and are not coincidences.
    expect(everyRead.fitness).not.toEqual(currentOnly.fitness)
    expect(everyRead.trend).not.toEqual(currentOnly.trend)
  })

  it('replaces a compatible digest of a workout by a fresh copy, reported upgraded and not added', async () => {
    const session = new AnalysisSession()
    const old = stamped(digestActivity(run), COMPATIBLE)
    const outcomes: ImportCompletion[] = []
    const after = await withRevisionTableAsync(MIXED, async () => {
      expect(session.loadDigests([old], SETTINGS).totalActivities).toBe(1)
      return session.addFiles([fitFile(run)], SETTINGS, undefined, undefined, false, (o) =>
        outcomes.push(o),
      )
    })
    expect(outcomes[0]?.added).toEqual([])
    expect(outcomes[0]?.upgraded).toHaveLength(1)
    expect(outcomes[0]?.filesAdded).toBe(1)
    expect(after.totalActivities).toBe(1)
    expect(after.libraryActivities).toBe(1)
    expect(after.library[0]?.id).toBe(outcomes[0]?.upgraded[0]?.id)
  })

  it('replaces a stale digest the same way, and a first import still reports added', async () => {
    const session = new AnalysisSession()
    const stale = stamped(digestActivity(run), STALE)
    const outcomes: ImportCompletion[] = []
    await withRevisionTableAsync(MIXED, async () => {
      expect(session.loadDigests([stale], SETTINGS).outdatedActivities).toBe(1)
      const after = await session.addFiles(
        [fitFile(run)],
        SETTINGS,
        undefined,
        undefined,
        false,
        (o) => outcomes.push(o),
      )
      expect(after.outdatedActivities).toBe(0)
      expect(after.heldOut).toEqual([])
    })
    expect(outcomes[0]?.upgraded).toHaveLength(1)
    expect(outcomes[0]?.added).toEqual([])

    const fresh = new AnalysisSession()
    const first: ImportCompletion[] = []
    await fresh.addFiles([fitFile(run)], SETTINGS, undefined, undefined, false, (o) =>
      first.push(o),
    )
    expect(first[0]?.added).toHaveLength(1)
    expect(first[0]?.upgraded).toEqual([])
  })

  it('still hides a duplicate of a compatible digest, so the pair is counted once', () => {
    const base = digestActivity(run)
    // The same workout in a lower format, a few seconds off: the richer copy is shown, the other hidden.
    const poorer = {
      ...base,
      id: 'poorer-copy.gpx',
      startMs: base.startMs + 1000,
      modelRevision: COMPATIBLE,
    }
    const state = withRevisionTable(MIXED, () =>
      new AnalysisSession().loadDigests([stamped(base, COMPATIBLE), poorer], SETTINGS),
    )
    expect(state.libraryActivities).toBe(2)
    expect(state.hiddenDuplicates).toBe(1)
    expect(state.totalActivities).toBe(1)
  })

  it('refuses to hold a table across an await, since it would silently revert', async () => {
    expect(() => withRevisionTable(MIXED, async () => 1)).toThrow(/withRevisionTableAsync/)
    // The real table is back even though the run was refused.
    expect(await withRevisionTableAsync(MIXED, async () => 1)).toBe(1)
  })

  it('removes a workout from every map, and clear empties them all', () => {
    const { stale, compatible, current } = mixedSeason()
    withRevisionTable(MIXED, () => {
      const session = new AnalysisSession()
      session.loadDigests([stale[0]!, compatible[0]!, current[0]!], SETTINGS)
      for (const digest of [stale[0]!, compatible[0]!, current[0]!]) {
        session.removeActivity(digest.sport, digest.startMs, SETTINGS)
      }
      const state = session.loadDigests([stale[0]!, compatible[0]!, current[0]!], SETTINGS)
      expect(state.libraryActivities).toBe(3)
      expect(session.clear().libraryActivities).toBe(0)
    })
  })

  it('keeps the better-read copy when the same workout arrives in two statuses', () => {
    const digest = digestActivity(run)
    const state = withRevisionTable(MIXED, () => {
      const session = new AnalysisSession()
      return session.loadDigests(
        [stamped(digest, STALE), stamped(digest, COMPATIBLE), stamped(digest, STALE)],
        SETTINGS,
      )
    })
    expect(state.libraryActivities).toBe(1)
    expect(state.totalActivities).toBe(1)
    expect(state.outdatedActivities).toBe(0)
  })
})
