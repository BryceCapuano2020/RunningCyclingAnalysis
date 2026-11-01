import { hashedFileName } from './import/minimise'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { AnalysisSession, SyncFailure } from './session'
import { sampleDataset } from './synthetic'
import { encodeTcx } from './tcx/encode'
import type { Activity, AthleteSettings } from './types'

/**
 * Rule R: whether a file is stored never depends on what else is held for its workout, so the stored set is the same
 * in every order, and the analysis hides all but the best copy.
 */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

function shifted(activity: Activity, ms: number): Activity {
  return { ...activity, startMs: activity.startMs + ms }
}

/** One workout in three formats, each starting at another second. */
const COPIES = {
  fit: () => new File([new Uint8Array(encodeFit(run, { gps: true }))], 'one.fit'),
  gpx: () => new File([new Uint8Array(encodeGpx(shifted(run, 4_000)))], 'one.gpx'),
  tcx: () => new File([new Uint8Array(encodeTcx(shifted(run, 8_000), { gps: true }))], 'one.tcx'),
}
type Format = keyof typeof COPIES

const ORDERS: Format[][] = [
  ['fit', 'gpx', 'tcx'],
  ['fit', 'tcx', 'gpx'],
  ['gpx', 'fit', 'tcx'],
  ['gpx', 'tcx', 'fit'],
  ['tcx', 'fit', 'gpx'],
  ['tcx', 'gpx', 'fit'],
]

async function importInOrder(order: Format[], separately: boolean) {
  const session = new AnalysisSession()
  const stored: string[] = []
  const sink = async (item: { digest: { id: string } }) => {
    stored.push(item.digest.id)
  }
  let state
  if (separately) {
    for (const format of order)
      state = await session.addFiles([COPIES[format]()], SETTINGS, undefined, sink)
  } else {
    state = await session.addFiles(
      order.map((format) => COPIES[format]()),
      SETTINGS,
      undefined,
      sink,
    )
  }
  return { state: state!, stored: stored.sort() }
}

describe.each([
  ['together', false],
  ['one after another', true],
])('one workout in three formats, added %s', (_name, separately) => {
  it('stores every copy and shows only the best, in every order', async () => {
    const results = await Promise.all(ORDERS.map((order) => importInOrder(order, separately)))

    const first = results[0]!
    expect(first.stored).toHaveLength(3)
    for (const { state, stored } of results) {
      expect(stored).toEqual(first.stored)
      expect(state.result?.activities).toHaveLength(1)
      expect(state.result?.activities[0]?.id).toContain(hashedFileName('one.fit'))
      expect(state.hiddenDuplicates).toBe(2)
      expect(state.totalActivities).toBe(1)
      expect(state.library).toHaveLength(1)
    }
  })
})

describe('the same copies on the device, with nowhere to save them', () => {
  it('hold every copy and show one, in every order', async () => {
    for (const order of ORDERS) {
      const session = new AnalysisSession()
      const state = await session.addFiles(
        order.map((format) => COPIES[format]()),
        SETTINGS,
      )
      expect(state.hiddenDuplicates).toBe(2)
      expect(state.result?.activities[0]?.id).toContain(hashedFileName('one.fit'))
    }
  })
})

describe('a sink that holds work back until the copies are known', () => {
  it('is told which digests the analysis hides once every file is read, and its failures are issues', async () => {
    const session = new AnalysisSession()
    const seen: string[] = []
    const sink = Object.assign(async () => undefined, {
      finish: async (hidden: ReadonlySet<string>) => {
        seen.push(...[...hidden].map((id) => id.replace(/^\d+-/, '')))
        return [{ key: 'run-1', code: 'storage-quota' as const }]
      },
    })

    const state = await session.addFiles(
      ['gpx', 'fit', 'tcx'].map((format) => COPIES[format as Format]()),
      SETTINGS,
      undefined,
      sink,
    )

    expect(seen.sort()).toEqual(['one.gpx', 'one.tcx'].map(hashedFileName).sort())
    expect(state.syncIssues).toEqual([{ code: 'storage-quota', count: 1 }])
  })

  it('is not called when the saves were stopped, since nothing more is sent', async () => {
    const session = new AnalysisSession()
    let finished = false
    const sink = Object.assign(
      async () => {
        throw new SyncFailure('signed-out', 'Signed out')
      },
      {
        finish: async () => {
          finished = true
          return []
        },
      },
    )
    await session.addFiles([COPIES.fit()], SETTINGS, undefined, sink)
    expect(finished).toBe(false)
  })
})
