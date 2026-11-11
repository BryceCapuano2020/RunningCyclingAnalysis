import { afterEach, describe, expect, it, vi } from 'vitest'
import { UTC_ZONE, calendarKey, setViewerZone, type Zone } from './calendar'
import { dayOf } from './customRange'
import { liftResultsOf } from './lift/liftResults'
import { AnalysisSession } from './session'
import type { SessionState } from './sessionState'
import { fromSnapshot, toSnapshot, type StateSnapshot } from './stateSnapshot'
import { dstZone, fixedZone } from './test/zones'
import { snapshotCorpus, type CorpusLibrary } from './test/snapshotCorpus'

const corpus = snapshotCorpus()

const ZONES: { name: string; zone: Zone }[] = [
  { name: 'UTC', zone: UTC_ZONE },
  { name: 'Etc/GMT+7', zone: fixedZone(-7) },
  { name: 'Pacific/Auckland', zone: fixedZone(13) },
  { name: 'America/Los_Angeles', zone: dstZone },
]

const META = { libraryVersion: 7, buildSha: 'test' }

/** What the browser's worker does: one session, the zone given once to the module (`session.setZone`), the clock set. */
function browserSnapshot(
  library: CorpusLibrary,
  zone: { name: string; zone: Zone },
  nowMs: number,
): StateSnapshot {
  const before = setViewerZone(UTC_ZONE)
  try {
    const session = new AnalysisSession()
    session.setZone(zone.zone)
    session.clock = () => nowMs
    const state = session.loadDigests(library.digests, library.settings)
    // The browser's own check-in, and the lift results of a log with no sets (the lift page builds its own from its sets).
    return toSnapshot(
      state,
      { ...META, nowMs, zone: zone.name },
      {
        lift: liftResultsOf([], library.settings, dayOf(nowMs)),
        checkIn: session.checkInSnapshot(state, nowMs),
      },
    )
  } finally {
    setViewerZone(before)
  }
}

/** What the server's job does: a fresh copy of every module, so nothing the browser path set is there, and the zone passed in. */
async function serverSnapshot(
  library: CorpusLibrary,
  zone: { name: string; zone: Zone },
  nowMs: number,
) {
  vi.resetModules()
  const calendar = await import('./calendar')
  const { computeSnapshot } = await import('./stateCompute')
  const key = calendar.calendarKey()
  const snapshot = computeSnapshot({
    ...META,
    digests: library.digests,
    settings: library.settings,
    nowMs,
    zone: zone.name,
    viewerZone: zone.zone,
  })
  // The job left that copy's own zone alone: the next job in the isolate starts from the module's default.
  expect(calendar.calendarKey()).toBe(key)
  return snapshot
}

afterEach(() => void setViewerZone(UTC_ZONE))

describe('the browser and the server compute the same snapshot', () => {
  it.each(corpus.map((library) => [library.name, library] as const))(
    '%s, in every zone',
    async (_name, library) => {
      for (const zone of ZONES) {
        const browser = browserSnapshot(library, zone, library.nowMs)
        const server = await serverSnapshot(library, zone, library.nowMs)
        expect(server, zone.name).toStrictEqual(browser)
        expect(JSON.stringify(server)).toBe(JSON.stringify(browser))
        expect(fromSnapshot(server), zone.name).toStrictEqual(fromSnapshot(browser))
      }
    },
  )

  it('agrees either side of a day roll, and the roll moves the state', async () => {
    const library = corpus[0]!
    const zone = { name: 'Etc/GMT+7', zone: fixedZone(-7) }
    const hour = 3_600_000
    // The state reads its date as the UTC day (sessionBuild.ts), and the zone cuts the days of the activities: the two rolls
    // that matter are a UTC midnight (here a new year, which moves the dated references) and the zone's own, seven hours later.
    const newYear = Date.UTC(new Date(library.nowMs).getUTCFullYear() + 1, 0, 1)
    const rolls = [
      [newYear - hour / 2, newYear + hour / 2],
      [newYear + 6.5 * hour, newYear + 7.5 * hour],
    ]
    const states: SessionState[][] = []
    for (const pair of rolls) {
      const day: SessionState[] = []
      for (const nowMs of pair) {
        const browser = browserSnapshot(library, zone, nowMs)
        const server = await serverSnapshot(library, zone, nowMs)
        expect(server).toStrictEqual(browser)
        day.push(fromSnapshot(server))
      }
      states.push(day)
    }
    expect(states[0]![0]!.zoneEstimates).not.toEqual(states[0]![1]!.zoneEstimates)
    expect(states[1]![0]).toEqual(states[1]![1])
  })

  it('leaves the process zone the page set where it was', async () => {
    setViewerZone(fixedZone(2))
    const key = calendarKey()
    await serverSnapshot(corpus[0]!, ZONES[1]!, corpus[0]!.nowMs)
    expect(calendarKey()).toBe(key)
  })
})
