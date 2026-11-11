import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisSettings } from '@rca/core/athlete'
import { UTC_ZONE, setViewerZone } from '@rca/core/calendar'
import { dayOf } from '@rca/core/customRange'
import type { ExerciseKey, LiftSet } from '@rca/core/lift'
import { checkInBetween } from '@rca/core/lookback'
import { computeSnapshot } from '@rca/core/stateCompute'
import { checkInOfSnapshot, fromSnapshot, liftOfSnapshot } from '@rca/core/stateSnapshot'
import { checkInSnapshotOf } from '../../../../packages/core/src/sessionCheckIn'
import { snapshotCorpus } from '../../../../packages/core/src/test/snapshotCorpus'
import { computeFor } from '../../../api/src/state/compute'
import type { StateInputs } from '../../../api/src/state/stateInputs'
import { zoneNamed } from '../../../api/src/state/zone'
import { levelRangeRows } from '../ui/levelRanges'
import { liftOverviewOf } from '../ui/lift/liftEntries'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import { resetCheckinDb } from './checkinStore'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import { REPLY_TYPES } from './protocol'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { installDeviceZone } from './viewerZone'

/*
 * Server authority, equivalence acceptance test, the lift state and the check-in (docs/design/server-authority.md, L3). The
 * server's snapshot carries the lift results and the check-in; a signed-out visitor's page builds the first with
 * `liftOverviewOf` over the sets in `rca-lifts`, and the worker the second from the device library.
 */

const kept = vi.hoisted(() => ({ library: null as DeviceLibrary | null }))
vi.mock('./deviceLibrary', () => ({ openDeviceLibrary: () => kept.library }))

const library = snapshotCorpus()[1]!
const nowMs = library.nowMs
const ZONES = ['UTC', 'America/Los_Angeles'] as const

let order = 0
const set = (date: string, exercise: string, reps: number, loadKg: number, rpe = 8): LiftSet => ({
  date,
  exercise,
  equipment: 'barbell',
  setOrder: (order += 1),
  reps,
  loadKg,
  rpe,
})
const daysBefore = (days: number) => dayOf(nowMs - days * 86_400_000)
const sets: LiftSet[] = [
  set(daysBefore(40), 'back-squat', 5, 100),
  set(daysBefore(20), 'back-squat', 5, 107.5),
  set(daysBefore(6), 'back-squat', 3, 117.5),
  set(daysBefore(30), 'bench-press', 5, 70),
  set(daysBefore(9), 'bench-press', 5, 75),
  set(daysBefore(12), 'deadlift', 3, 150),
  set(daysBefore(3), 'sumo-deadlift', 3, 165),
  set(daysBefore(3), 'overhead-press', 6, 42.5),
]
const settings = analysisSettings({ massKg: 78, bikeMassKg: 9 }, [], 1988, [], [], 'female')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setViewerZone(UTC_ZONE)
})

describe('the lift state in the snapshot is what the Lift page builds signed out', () => {
  it.each(ZONES)('over the same sets, in %s', (zone) => {
    // The page reads today in the device zone; the server in the account's.
    vi.stubEnv('TZ', zone)
    installDeviceZone()
    const today = dayOf(nowMs)
    const snapshot = computeSnapshot({
      digests: library.digests,
      settings,
      liftSets: sets,
      libraryVersion: 1,
      nowMs,
      zone,
      buildSha: 'x',
      viewerZone: zoneNamed(zone),
    })
    const lift = liftOfSnapshot(snapshot)!
    expect(lift.today).toBe(today)
    for (const units of ['metric', 'imperial'] as const) {
      const page = liftOverviewOf(sets, settings, { birthYear: 1988, sex: 'female' }, units, today)
      // Each figure the page shows, against the one the snapshot carries.
      const estimated = lift.state.lifts.filter((l) => l.estimate !== null)
      expect(page.lifts.map((e) => e.id).sort()).toEqual(estimated.map((l) => l.key).sort())
      for (const entry of page.lifts) {
        expect(entry.summary, entry.id).toStrictEqual(estimated.find((l) => l.key === entry.id))
        expect(entry.history, entry.id).toStrictEqual(lift.histories[entry.id as ExerciseKey])
      }
      expect(page.leadId).toBe(lift.lead?.key ?? null)
      expect(page.lead?.change).toStrictEqual(lift.lead?.change)
      expect(page.lead?.grade).toStrictEqual(lift.lead?.grade)
      expect(page.bigThree?.lifts.map((l) => l.grade)).toStrictEqual(
        lift.bigThree.parts.length === 0 ? undefined : expectedGrades(lift),
      )
      const corner = lift.corner
      expect(page.levels).toStrictEqual(
        lift.levels[units] === null
          ? null
          : levelRangeRows(
              'lift',
              lift.levels[units],
              units,
              corner.kind === 'graded' ? corner.grade.centre.level : null,
            ),
      )
      // The page pads its weeks with empty ones; the weeks it has from the sets are the snapshot's.
      const shown = new Map(page.weeks.map((w) => [w.weekStart, w]))
      const have = lift.state.weeks.filter((w) => shown.has(w.weekStart))
      expect(have.length).toBeGreaterThan(0)
      for (const week of have) expect(shown.get(week.weekStart)).toStrictEqual(week)
    }
    // Not vacuous: the corner is graded and the levels exist.
    expect(lift.corner.kind).toBe('graded')
    expect(lift.levels.metric).not.toBeNull()
  })
})

/** The grades the page lists for the big three: one for each of squat, bench and deadlift, null where a lift has no part. */
function expectedGrades(lift: NonNullable<ReturnType<typeof liftOfSnapshot>>) {
  return ['squat', 'bench', 'deadlift'].map((name) => {
    const at = lift.bigThree.parts.findIndex((p) => p.lift === name)
    return at < 0 ? null : lift.bigThreeGrades[at]
  })
}

/** Loads the worker afresh over the device library and a baseline kept in this browser, and asks it for `loadDevice`. */
async function workerCheckIn(baseline: ReturnType<typeof checkInSnapshotOf>) {
  const device = memoryDeviceLibrary()
  for (const digest of library.digests) await device.put(workoutKeyOf(digest), digest)
  kept.library = device
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetCheckinDb()
  vi.resetModules()
  const posted: WorkerResponse[] = []
  const fakeSelf = {
    postMessage: (message: WorkerResponse) => void posted.push(message),
    onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null,
  }
  vi.stubGlobal('self', fakeSelf)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(nowMs)
  try {
    const { writeScope: write } = await import('./checkinMarks')
    await write('device', 0, {
      marks: { v: 1, baseline, lastImportAtMs: baseline.atMs, pending: null },
    })
    await import('./analysis.worker')
    fakeSelf.onmessage?.({
      data: { type: 'loadDevice', settings },
    } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      if (!posted.some((m) => REPLY_TYPES.has(m.type))) throw new Error('still working')
    })
  } finally {
    vi.useRealTimers()
  }
  const reply = posted.find((m) => REPLY_TYPES.has(m.type))
  if (reply?.type !== 'state') throw new Error(`the worker answered ${reply?.type}`)
  return reply
}

describe('the check-in in the snapshot is what the signed-out worker builds', () => {
  it.each(ZONES)('against the same baseline, in %s', async (zone) => {
    vi.stubEnv('TZ', zone)
    installDeviceZone()
    const inputs: StateInputs = {
      version: 3,
      digests: library.digests,
      unreadable: 0,
      massKg: 78,
      bikeMassKg: 9,
      birthYear: null,
      sex: null,
      measurements: [],
      settings: { keepPower: null, countedRuns: null, period: null, zone },
    }
    const snapshot = computeFor(inputs, nowMs)
    const serverLive = checkInOfSnapshot(snapshot)!
    // A baseline from before the newest workouts: the same library without them, taken a day earlier.
    const newest = [...library.digests].sort((a, b) => b.startMs - a.startMs).slice(0, 2)
    const older = library.digests.filter((d) => !newest.includes(d))
    const baseline = checkInSnapshotOf(older, fromSnapshot(snapshot), nowMs - 86_400_000)
    const reply = await workerCheckIn(baseline)
    const browser = reply.checkIn?.checkIn
    expect(browser).not.toBeNull()
    expect(browser).toStrictEqual(checkInBetween(baseline, serverLive))
    // Not vacuous: the newest workouts are what it says was added.
    const added = (browser?.added.run ?? 0) + (browser?.added.ride ?? 0)
    expect(added).toBe(2)
  })
})
