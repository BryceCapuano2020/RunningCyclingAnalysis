import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisSettings, bodyMassOn, type Measurement } from '@rca/core/athlete'
import { UTC_ZONE, setViewerZone, withViewerZone } from '@rca/core/calendar'
import { dayOf } from '@rca/core/customRange'
import type { PeriodChoice } from '@rca/core/period'
import type { SessionState } from '@rca/core/session'
import { fromSnapshot, toSnapshot } from '@rca/core/stateSnapshot'
import { DAY_MS } from '@rca/core/constants'
import {
  snapshotCorpus,
  type CorpusLibrary,
} from '../../../../packages/core/src/test/snapshotCorpus'
import { measurementOf, type StateInputs } from '../../../api/src/state/stateInputs'
import { zoneNamed } from '../../../api/src/state/zone'
import { toSettings } from '../../../api/src/state/settingsRow'
import { computeFor } from '../../../api/src/state/compute'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import { installDeviceZone } from './viewerZone'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import { REPLY_TYPES } from './protocol'
import type { WorkerRequest, WorkerResponse } from './protocol'

/*
 * Server authority, decision 1 and the equivalence acceptance test (docs/design/server-authority.md): for a signed-in
 * account the server's `computeFor` builds the results; for a signed-out visitor the browser's worker does, from the
 * digests kept on the device (`loadDevice`). Both paths stay, and this test holds them equal, so the deletion of the browser's
 * account paths cannot move a figure. The browser side is the real worker module answering a real `loadDevice` request over a
 * device library in memory; the server side is `computeFor` itself, from the inputs the API reads. The test lives in apps/web
 * because the worker's mocks and fakes are here; the API's compute is read by a relative import, as nothing here ships it.
 */

const kept = vi.hoisted(() => ({ library: null as DeviceLibrary | null }))
vi.mock('./deviceLibrary', () => ({
  openDeviceLibrary: () => kept.library,
}))

/** A choice the account stores: the default is no choice. */
type SetChoice = Exclude<PeriodChoice, 'default'>

const BIKE_KG = 9
const ZONES = ['UTC', 'America/Los_Angeles'] as const

/** What the account holds besides its digests: the same choices the page builds its settings from. */
interface Choices {
  massKg: number | null
  measurements: Measurement[]
  birthYear: number | null
  sex: 'female' | 'male' | null
  countedRuns: string[]
  keepPower: string[]
  /** The lists are stored as `[]`, not NULL, when they hold nothing: the account chose none, rather than never chose. */
  storedEmpty?: boolean
}

const NONE: Choices = {
  massKg: 70,
  measurements: [],
  birthYear: null,
  sex: null,
  countedRuns: [],
  keepPower: [],
}

/** Loads the real worker module afresh over a device library holding the digests, and asks it for `loadDevice`. */
async function browserState(
  library: CorpusLibrary,
  choices: Choices,
  choice: SetChoice | undefined,
  nowMs: number,
): Promise<SessionState> {
  const device = memoryDeviceLibrary()
  for (const digest of library.digests) await device.put(workoutKeyOf(digest), digest)
  kept.library = device
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
    await import('./analysis.worker')
    // The page resolves the dated body mass at its own now before it builds the settings (App.tsx).
    const massKg = bodyMassOn(choices.massKg, choices.measurements, nowMs)
    const settings = analysisSettings(
      { massKg, bikeMassKg: BIKE_KG },
      choices.measurements,
      choices.birthYear,
      choices.countedRuns,
      choices.keepPower,
      choices.sex,
    )
    const request: WorkerRequest = {
      type: 'loadDevice',
      settings,
      ...(choice === undefined ? {} : { choice }),
    }
    fakeSelf.onmessage?.({ data: request } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      if (!posted.some((m) => REPLY_TYPES.has(m.type))) throw new Error('still working')
    })
  } finally {
    vi.useRealTimers()
  }
  const reply = posted.find((m) => REPLY_TYPES.has(m.type))
  if (reply?.type !== 'state') throw new Error(`the worker answered ${reply?.type}`)
  return reply.state
}

/** A list as its column holds it: JSON when it has items or the account chose an empty one, NULL when it never chose. */
const column = (list: string[], storedEmpty: boolean | undefined) =>
  list.length > 0 || storedEmpty === true ? JSON.stringify(list) : null

/**
 * What the API reads for the same account, through the row mappings it reads with (`toSettings` over the stored JSON
 * columns, `measurementOf` over the dated rows), then its compute and the snapshot's round trip. `zone` null is an
 * account whose browser has reported none.
 */
function serverState(
  library: CorpusLibrary,
  choices: Choices,
  choice: SetChoice | undefined,
  nowMs: number,
  zone: string | null,
): SessionState {
  const inputs: StateInputs = {
    version: 3,
    liftRevision: 0,
    digests: library.digests,
    unreadable: 0,
    massKg: choices.massKg,
    bikeMassKg: BIKE_KG,
    birthYear: choices.birthYear,
    sex: choices.sex,
    measurements: choices.measurements.map((m) =>
      measurementOf({ kind: m.kind, sport: m.sport ?? '', from_date: m.from, value: m.value }),
    ),
    settings: toSettings({
      keep_power: column(choices.keepPower, choices.storedEmpty),
      counted_runs: column(choices.countedRuns, choices.storedEmpty),
      period: choice === undefined ? null : JSON.stringify(choice),
      zone,
    }),
  }
  return fromSnapshot(computeFor(inputs, nowMs))
}

/** Every top-level field of the state, so a difference names the field that moved. */
function expectSameState(server: SessionState, browser: SessionState): void {
  const keys = new Set([...Object.keys(server), ...Object.keys(browser)])
  expect([...keys].sort()).toEqual(Object.keys(server).sort())
  for (const key of [...keys].sort()) {
    expect(server[key as keyof SessionState], key).toStrictEqual(browser[key as keyof SessionState])
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setViewerZone(UTC_ZONE)
})

const corpus = snapshotCorpus()

interface Case {
  name: string
  choices: Choices
  choice: SetChoice | undefined
  /** The instant, when the case is about one; the library's own otherwise. */
  nowMs?: number
  /** The zones to run in: `null` is an account with no saved zone, which the server reads as UTC. */
  zones?: readonly (string | null)[]
}

/** The first UTC midnight after the library, plus two hours: a day later in UTC than in America/Los_Angeles. */
const lateUtcDay = (library: CorpusLibrary) =>
  Math.ceil(library.nowMs / DAY_MS) * DAY_MS + 2 * 3_600_000

/** The choices of each case, from the library's own activities. */
function casesFor(library: CorpusLibrary): Case[] {
  const runs = library.digests.filter((d) => d.sport === 'run').slice(0, 3)
  const rides = library.digests.filter((d) => d.sport === 'ride').slice(0, 3)
  const from = dayOf(library.nowMs - 40 * DAY_MS)
  const to = dayOf(library.nowMs - 10 * DAY_MS)
  const earlier = dayOf(library.nowMs - 90 * DAY_MS)
  const late = lateUtcDay(library)
  return [
    { name: 'the default period', choices: NONE, choice: undefined },
    { name: 'a period of days', choices: NONE, choice: 56 },
    { name: 'all time', choices: NONE, choice: 'all' },
    { name: 'a custom range', choices: NONE, choice: { from, to } },
    {
      name: 'a settings change',
      choices: {
        massKg: 64,
        measurements: [{ kind: 'massKg', value: 61, from: earlier }],
        birthYear: 1985,
        sex: 'female',
        countedRuns: runs.map(workoutKeyOf),
        keepPower: rides.map((d) => d.id),
      },
      choice: 'all',
    },
    {
      name: 'lists stored empty, not null',
      choices: { ...NONE, storedEmpty: true },
      choice: 'all',
    },
    {
      // The weight starts on the UTC day of the instant: in effect there, and not yet in Los Angeles, where it is still the day before.
      name: 'a dated weight that starts on a day the zones disagree on',
      choices: {
        ...NONE,
        measurements: [
          { kind: 'massKg', value: 61, from: dayOf(late - 30 * DAY_MS) },
          { kind: 'massKg', value: 58, from: dayOf(late) },
        ],
      },
      choice: undefined,
      nowMs: late,
    },
    { name: 'no saved zone', choices: NONE, choice: undefined, zones: [null] },
  ]
}

describe('the server computes what the browser builds for a signed-out visitor', () => {
  for (const library of corpus) {
    it.each(casesFor(library).map((c) => [c.name, c] as const))(
      `${library.name}: %s`,
      async (_name, { choices, choice, nowMs = library.nowMs, zones = ZONES }) => {
        for (const zone of zones) {
          // An account with no saved zone is cut in UTC, as a device in UTC is.
          vi.stubEnv('TZ', zone ?? 'UTC')
          installDeviceZone()
          const browser = await browserState(library, choices, choice, nowMs)
          const server = serverState(library, choices, choice, nowMs, zone)
          expectSameState(server, browser)
          // Not equivalence: this checks that the snapshot round trip keeps a state, which the device's copy and the stored one rely on.
          const meta = { libraryVersion: 0, nowMs, zone: zone ?? 'UTC', buildSha: 'x' }
          expectSameState(fromSnapshot(toSnapshot(browser, meta)), browser)
        }
      },
    )
  }

  it('a settings change moves the state, so the case is not vacuous', async () => {
    const library = corpus[1]!
    const [base, changed] = casesFor(library).filter((c) => /default|settings/.test(c.name))
    vi.stubEnv('TZ', 'UTC')
    const before = serverState(library, base!.choices, 'all', library.nowMs, 'UTC')
    const after = serverState(library, changed!.choices, 'all', library.nowMs, 'UTC')
    expect(after).not.toEqual(before)
  })

  it('the zone-dependent weight is a different mass in each zone, so that case is not vacuous', () => {
    const dated = casesFor(corpus[1]!).find((c) => /dated weight/.test(c.name))!
    const massIn = (zone: string) =>
      withViewerZone(zoneNamed(zone), () =>
        bodyMassOn(dated.choices.massKg, dated.choices.measurements, dated.nowMs!),
      )
    expect(massIn('UTC')).toBe(58)
    expect(massIn('America/Los_Angeles')).toBe(61)
  })

  it.todo(
    'the lift state: `lift` in the snapshot equals what the Lift page builds from the same rows (a later slice)',
  )
  it.todo(
    'the check-in: the snapshot carries the CheckInSnapshot the worker makes from the same digests (a later slice)',
  )
})
