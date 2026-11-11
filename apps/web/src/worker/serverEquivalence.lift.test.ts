import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisSettings, bodyMassOn } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { UTC_ZONE, setViewerZone, withViewerZone } from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import { StateSnapshotSchema } from '@rca/contract'
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
import { plural } from '../ui/components/plural'
import { levelRangeRows } from '../ui/levelRanges'
import { liftOverviewOf, massParts, WINDOW_WEEKS } from '../ui/lift/liftEntries'
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
const setsAt = (at: number): LiftSet[] => {
  const before = (days: number) => dayOf(at - days * DAY_MS)
  return [
    set(before(40), 'back-squat', 5, 100),
    set(before(20), 'back-squat', 5, 107.5),
    set(before(6), 'back-squat', 3, 117.5),
    set(before(30), 'bench-press', 5, 70),
    set(before(9), 'bench-press', 5, 75),
    set(before(12), 'deadlift', 3, 150),
    set(before(3), 'sumo-deadlift', 3, 165),
    // A set with no effort noted, so the page's "Effort" row counts fewer rated sessions than sessions.
    set(before(3), 'overhead-press', 6, 42.5),
    { ...set(before(10), 'overhead-press', 6, 40), rpe: undefined },
  ]
}

/** The first UTC midnight after the library, plus two hours: a day later in UTC than in America/Los_Angeles. */
const late = Math.ceil(nowMs / DAY_MS) * DAY_MS + 2 * 3_600_000

interface Case {
  name: string
  /** The weight the athlete entered, or null for none (the placeholder mass). */
  massKg: number | null
  measurements?: Measurement[]
  birthYear: number | null
  sex: 'female' | 'male' | null
  at?: number
  /** Whether the corner and the levels are expected to grade, so the case is not vacuous. */
  graded: boolean
}

const CASES: Case[] = [
  { name: 'a full profile', massKg: 78, birthYear: 1988, sex: 'female', graded: true },
  {
    name: 'a placeholder mass and no profile',
    massKg: null,
    birthYear: null,
    sex: null,
    graded: false,
  },
  {
    name: 'a placeholder mass with a profile',
    massKg: null,
    birthYear: 1988,
    sex: 'male',
    graded: false,
  },
  { name: 'no year of birth', massKg: 78, birthYear: null, sex: 'female', graded: false },
  { name: 'no sex', massKg: 78, birthYear: 1988, sex: null, graded: false },
  {
    // Starts on the UTC day of the instant: in effect there, and not yet in Los Angeles, where it is still the day before.
    name: 'a dated weight that starts on a day the zones disagree on',
    massKg: 78,
    measurements: [
      { kind: 'massKg', value: 71, from: dayOf(late - 30 * DAY_MS) },
      { kind: 'massKg', value: 64, from: dayOf(late) },
    ],
    birthYear: 1988,
    sex: 'female',
    at: late,
    graded: true,
  },
]

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setViewerZone(UTC_ZONE)
})

/** The settings the page builds, the dated mass read in `zone` as the page reads it at its own now. */
function settingsFor(c: Case, zone: string, at: number) {
  const massKg = withViewerZone(zoneNamed(zone), () =>
    bodyMassOn(c.massKg, c.measurements ?? [], at),
  )
  return analysisSettings(
    { massKg, bikeMassKg: 9 },
    c.measurements ?? [],
    c.birthYear,
    [],
    [],
    c.sex,
  )
}

/** The server's snapshot while the process is in a zone that is not the account's: the account's zone is all it reads. */
function serverLift(c: Case, zone: string, at: number, sets: LiftSet[]) {
  vi.stubEnv('TZ', zone === 'UTC' ? 'Pacific/Auckland' : 'UTC')
  installDeviceZone()
  const snapshot = computeSnapshot({
    digests: library.digests,
    settings: settingsFor(c, zone, at),
    liftSets: sets,
    libraryVersion: 1,
    nowMs: at,
    zone,
    buildSha: 'x',
    viewerZone: zoneNamed(zone),
  })
  setViewerZone(UTC_ZONE)
  return { snapshot, lift: liftOfSnapshot(snapshot)! }
}

describe('the lift state in the snapshot is what the Lift page builds signed out', () => {
  for (const c of CASES) {
    it.each(ZONES)(`${c.name}, in %s`, (zone) => {
      const at = c.at ?? nowMs
      const sets = setsAt(at)
      const { snapshot, lift } = serverLift(c, zone, at, sets)
      // The page reads its day and its dated mass in the device zone, which is the viewer's zone.
      vi.stubEnv('TZ', zone)
      installDeviceZone()
      const today = dayOf(at)
      expect(lift.today).toBe(today)
      expect(StateSnapshotSchema.safeParse(JSON.parse(JSON.stringify(snapshot))).success).toBe(true)
      const settings = settingsFor(c, zone, at)
      const profile =
        c.birthYear === null || c.sex === null ? null : { birthYear: c.birthYear, sex: c.sex }
      for (const units of ['metric', 'imperial'] as const) {
        const page = liftOverviewOf(sets, settings, profile, units, today)
        // The page's list, in its order, is the snapshot's.
        expect(page.lifts.map((e) => e.id)).toEqual(lift.order)
        for (const entry of page.lifts) {
          const key = entry.id as ExerciseKey
          expect(entry.summary, entry.id).toStrictEqual(lift.state.lifts.find((l) => l.key === key))
          expect(entry.history, entry.id).toStrictEqual(lift.histories[key])
          // The detail rows that come from the window of the last eight weeks.
          const counts = lift.windows[key]!
          const row = (label: string) => entry.rows.find((r) => r.label === label)?.value
          expect(row(`Sets in the last ${WINDOW_WEEKS} weeks`)).toBe(String(counts.sets))
          expect(row('Effort')).toBe(
            counts.sessions === 0
              ? undefined
              : `RPE on ${counts.ratedSessions} of ${plural(counts.sessions, 'session')}`,
          )
        }
        expect(page.leadId).toBe(lift.lead?.key ?? null)
        expect(page.lead?.change).toStrictEqual(lift.lead?.change)
        expect(page.lead?.grade).toStrictEqual(lift.lead?.grade)
        // The big three as the page leads with them: each max, its grade and the total, in the unit shown.
        const big = page.bigThree
        expect(big === null).toBe(lift.bigThree.kind === 'none')
        for (const shown of big?.lifts ?? []) {
          const at = lift.bigThree.parts.findIndex((p) => p.lift === shown.lift)
          expect(shown.max).toStrictEqual(
            at < 0 ? null : massParts(lift.bigThree.parts[at]!.kg, units),
          )
          expect(shown.grade).toStrictEqual(at < 0 ? null : lift.bigThreeGrades[at])
        }
        expect(big?.total ?? null).toStrictEqual(
          lift.bigThree.kind === 'total' ? massParts(lift.bigThree.kg, units) : null,
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
      // Not vacuous: the grade is there where the case has what it needs, and a gap where it has not.
      expect(lift.corner.kind === 'graded').toBe(c.graded)
      expect(lift.levels.metric === null).toBe(!c.graded)
      expect(lift.windows[lift.order[0]!]!.sets).toBeGreaterThan(0)
    })
  }

  it('a dated weight changes the corner between the zones, so that case is not vacuous', () => {
    const dated = CASES.find((c) => /dated weight/.test(c.name))!
    const corner = (zone: string) => serverLift(dated, zone, late, setsAt(late)).lift.corner
    expect(corner('UTC')).not.toStrictEqual(corner('America/Los_Angeles'))
  })

  it('names the gaps: no profile before no mass, as liftGrade orders them', () => {
    const [, none, assumed, noYear, noSex] = CASES
    const gap = (c: Case) => serverLift(c, 'UTC', nowMs, setsAt(nowMs)).lift.corner
    expect(gap(none!)).toStrictEqual({ kind: 'gap', why: 'no-profile' })
    expect(gap(assumed!)).toStrictEqual({ kind: 'gap', why: 'no-mass' })
    expect(gap(noYear!)).toStrictEqual({ kind: 'gap', why: 'no-profile' })
    expect(gap(noSex!)).toStrictEqual({ kind: 'gap', why: 'no-profile' })
  })
})

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
      data: { type: 'loadDevice', settings: analysisSettings({ massKg: 78, bikeMassKg: 9 }) },
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
