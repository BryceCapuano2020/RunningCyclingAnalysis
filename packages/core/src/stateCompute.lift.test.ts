import { afterEach, describe, expect, it } from 'vitest'
import { UTC_ZONE, setViewerZone } from './calendar'
import { LIFT_REVISION } from './lift/revision'
import { liftResultsOf } from './lift/liftResults'
import type { LiftSet } from './lift/types'
import { AnalysisSession } from './session'
import { computeSnapshot } from './stateCompute'
import {
  checkInOfSnapshot,
  liftOfSnapshot,
  snapshotContentHash,
  snapshotIsCurrent,
  toSnapshot,
} from './stateSnapshot'
import { inputFor, accountsFor } from './test/accountKit'
import { snapshotCorpus } from './test/snapshotCorpus'
import { fixedZone } from './test/zones'

afterEach(() => void setViewerZone(UTC_ZONE))

/** What an account's lift log holds: a lift on three days, the last one close to the library's end. */
const setsOn = (dates: string[]): LiftSet[] =>
  dates.map((date, i) => ({
    date,
    exercise: 'back-squat',
    equipment: 'barbell',
    setOrder: i + 1,
    reps: 5,
    loadKg: 100 + 5 * i,
    rpe: 8,
  }))

const library = snapshotCorpus()[0]!
const [east, west] = accountsFor([])
const dayAt = (ms: number, zone: (ms: number) => number) =>
  new Date(ms + zone(ms) * 60_000).toISOString().slice(0, 10)

describe('a snapshot carries the lift results and the check-in', () => {
  const liftSets = setsOn(['2026-01-05', '2026-01-12', '2026-01-19'])

  it('has the lift results of the sets, as of the local day of now in the account zone', () => {
    for (const account of [east!, west!]) {
      const input = { ...inputFor(library, account), liftSets }
      const snapshot = computeSnapshot(input)
      const today = dayAt(library.nowMs, account.zone)
      expect(liftOfSnapshot(snapshot), account.name).toStrictEqual(
        liftResultsOf(liftSets, account.settings, today),
      )
      expect(liftOfSnapshot(snapshot)?.today).toBe(today)
    }
    // The two zones are a day apart at this instant, or the case proves nothing about the zone.
    expect(dayAt(library.nowMs, east!.zone)).not.toBe(dayAt(library.nowMs, west!.zone))
  })

  it('has the check-in the session makes from the same digests', () => {
    const input = inputFor(library, east!)
    const snapshot = computeSnapshot(input)
    const session = new AnalysisSession(undefined, input.viewerZone)
    session.clock = () => input.nowMs
    session.choosePeriod(input.choice)
    const state = session.loadDigests(input.digests, input.settings)
    const expected = session.checkInSnapshot(state, input.nowMs)
    expect(expected).not.toBeNull()
    expect(checkInOfSnapshot(snapshot)).toStrictEqual(expected)
  })

  it('has no check-in for an empty library, and empty lift results for no sets', () => {
    const snapshot = computeSnapshot({ ...inputFor(library, east!), digests: [] })
    expect(checkInOfSnapshot(snapshot)).toBeNull()
    expect(liftOfSnapshot(snapshot)?.state.lifts).toStrictEqual([])
  })

  it('does not change the session state: the lift sets move nothing the digests make', () => {
    const without = computeSnapshot(inputFor(library, east!))
    const withSets = computeSnapshot({ ...inputFor(library, east!), liftSets })
    expect(withSets.state).toStrictEqual(without.state)
    expect(liftOfSnapshot(withSets)).not.toStrictEqual(liftOfSnapshot(without))
  })

  it('is stale when made under another lift revision, or before it was carried', () => {
    const snapshot = computeSnapshot(inputFor(library, east!))
    expect(snapshot.liftRevision).toBe(LIFT_REVISION)
    expect(snapshotIsCurrent(snapshot)).toBe(true)
    expect(snapshotIsCurrent({ ...snapshot, liftRevision: LIFT_REVISION - 1 })).toBe(false)
    const { liftRevision: _dropped, ...before } = snapshot
    expect(snapshotIsCurrent(before)).toBe(false)
  })

  it('keeps the lift results and check-in through the JSON text', () => {
    const snapshot = computeSnapshot({ ...inputFor(library, east!), liftSets })
    const back = JSON.parse(JSON.stringify(snapshot))
    expect(liftOfSnapshot(back)).toStrictEqual(liftOfSnapshot(snapshot))
    expect(checkInOfSnapshot(back)).toStrictEqual(checkInOfSnapshot(snapshot))
  })

  it('names the same content whatever instant it was taken, and a changed log differently', async () => {
    const at = (nowMs: number, sets: LiftSet[]) =>
      computeSnapshot({
        ...inputFor(library, east!),
        liftSets: sets,
        nowMs,
        viewerZone: fixedZone(0),
      })
    const hash = (s: Awaited<ReturnType<typeof at>>) => snapshotContentHash(s)
    const first = at(library.nowMs, liftSets)
    // An hour later is the same local day: the check-in's own stamp moves, and no figure does.
    const later = at(library.nowMs + 3_600_000, liftSets)
    expect(checkInOfSnapshot(later)?.atMs).not.toBe(checkInOfSnapshot(first)?.atMs)
    expect(await hash(later)).toBe(await hash(first))
    expect(await hash(at(library.nowMs, setsOn(['2026-01-05'])))).not.toBe(await hash(first))
  })

  it('names a library that gained a workout differently, though the check-in stamp is left out of the hash', async () => {
    const snapshot = computeSnapshot(inputFor(library, east!))
    const checkIn = snapshot.checkIn as { counts: { run: number }; atMs: number }
    const gained = {
      ...snapshot,
      checkIn: { ...checkIn, counts: { ...checkIn.counts, run: checkIn.counts.run + 1 } },
    }
    expect(await snapshotContentHash(gained)).not.toBe(await snapshotContentHash(snapshot))
    // Its own stamp is not part of the hash: the same check-in taken at another instant is the same content.
    const restamped = { ...snapshot, checkIn: { ...checkIn, atMs: checkIn.atMs + 1 } }
    expect(await snapshotContentHash(restamped)).toBe(await snapshotContentHash(snapshot))
  })

  it('a snapshot made without extras (a device copy) carries neither', () => {
    const state = new AnalysisSession().loadDigests(library.digests, library.settings)
    const device = toSnapshot(state, { libraryVersion: 0, nowMs: 1, zone: 'UTC', buildSha: 'x' })
    expect(device.lift).toBeUndefined()
    expect(liftOfSnapshot(device)).toBeNull()
    expect(checkInOfSnapshot(device)).toBeNull()
  })
})
