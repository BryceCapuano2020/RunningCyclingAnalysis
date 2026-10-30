import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { AnalysisSession, SyncFailure } from './session'
import type { SyncSink } from './session'
import { DEFAULT_ATHLETE, generateActivity } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 24 * 3_600_000

/** A zip of short runs, one a day apart, so none is a duplicate of another. */
function zipOfRuns(count: number): File {
  const entries: Record<string, Uint8Array> = {}
  for (let i = 0; i < count; i++) {
    const activity = generateActivity(
      DEFAULT_ATHLETE,
      {
        id: `run-${i}`,
        name: `Run ${i}`,
        sport: 'run',
        startMs: Date.UTC(2020, 0, 1) + i * DAY_MS,
        durationS: 300,
        effort: 'easy',
        terrain: 'flat',
      },
      i + 1,
    )
    entries[`activities/${i}.fit`] = encodeFit(activity, { gps: true })
  }
  return new File([zipSync(entries)], 'export.zip')
}

describe('saves that run in the background', () => {
  it('begins several saves before the first has finished, and waits for all of them before the import ends', async () => {
    const session = new AnalysisSession()
    const queued: { done: Promise<void>; finish: () => void }[] = []
    const sink: SyncSink = async (item) => {
      let finish: () => void = () => undefined
      const done = new Promise<void>((resolve) => (finish = resolve))
      queued.push({ done, finish })
      return item.queueable === true ? { done } : undefined
    }

    let ended = false
    const run = session.addFiles([zipOfRuns(5)], SETTINGS, undefined, sink).then((state) => {
      ended = true
      return state
    })
    await waitUntil(() => queued.length === 5)
    // All five were begun, none finished, and the import has not ended.
    expect(ended).toBe(false)
    for (const save of queued) save.finish()
    const state = await run

    expect(ended).toBe(true)
    expect(state.totalActivities).toBe(5)
    expect(state.syncIssues).toEqual([])
  })

  it('reports a save that failed in the background against its own activity, and the rest as saved', async () => {
    const session = new AnalysisSession()
    let n = 0
    const sink: SyncSink = async (item) => {
      const index = n++
      if (item.queueable !== true) return
      return {
        done: index === 2 ? Promise.reject(new SyncFailure('server', 'Boom')) : Promise.resolve(),
      }
    }

    const state = await session.addFiles([zipOfRuns(5)], SETTINGS, undefined, sink)

    expect(state.totalActivities).toBe(5)
    expect(state.syncIssues).toEqual([{ code: 'server', count: 1 }])
  })

  it('stops saving after a failure that ends the saves, and leaves the rest unsaved with its reason', async () => {
    const session = new AnalysisSession()
    let begun = 0
    const sink: SyncSink = async (item) => {
      begun++
      if (item.queueable !== true) return
      // The first fails at once, as a full library does; later ones would succeed.
      return {
        done:
          begun === 1
            ? Promise.reject(new SyncFailure('activity-quota', 'Full'))
            : Promise.resolve(),
      }
    }

    const state = await session.addFiles([zipOfRuns(8)], SETTINGS, undefined, sink)

    expect(state.totalActivities).toBe(8)
    const unsaved = state.syncIssues.find((issue) => issue.code === 'activity-quota')
    expect(unsaved).toBeDefined()
    // Once the failure was read, nothing more was sent.
    expect(begun).toBeLessThan(8)
    expect(unsaved!.count).toBe(8 - (begun - 1))
  })

  it('does not wait for a pending save to be marked unsaved: a saved one leaves no issue behind', async () => {
    const session = new AnalysisSession()
    const sink: SyncSink = async (item) =>
      item.queueable === true ? { done: Promise.resolve() } : undefined

    const state = await session.addFiles([zipOfRuns(3)], SETTINGS, undefined, sink)

    expect(state.syncIssues).toEqual([])
  })

  it('saves a workout it holds again, and one that is retried, before anything else is sent', async () => {
    const session = new AnalysisSession()
    const order: string[] = []
    const settle: (() => void)[] = []
    const sink: SyncSink = async (item) => {
      order.push(`${item.digest.id}:${item.queueable === true ? 'queued' : 'now'}`)
      if (item.queueable !== true) return
      return { done: new Promise<void>((resolve) => settle.push(resolve)) }
    }
    const run = session.addFiles([zipOfRuns(2)], SETTINGS, undefined, sink)
    await waitUntil(() => settle.length === 2)
    for (const finish of settle) finish()
    await run
    expect(order.every((entry) => entry.endsWith(':queued'))).toBe(true)

    // The same files again, to retain their originals: not new to the library, so not queued.
    order.length = 0
    await session.addFiles([zipOfRuns(2)], SETTINGS, undefined, sink, true)
    expect(order).toHaveLength(2)
    expect(order.every((entry) => entry.endsWith(':now'))).toBe(true)
  })

  it('ends the import even when reading it fails, once the saves it began have settled', async () => {
    const session = new AnalysisSession()
    let finish: () => void = () => undefined
    const sink: SyncSink = async (item) => {
      if (item.queueable !== true) return
      return { done: new Promise<void>((resolve) => (finish = resolve)) }
    }
    const broken = new File([new Uint8Array([1, 2, 3])], 'broken.zip')

    const run = session.addFiles([zipOfRuns(1), broken], SETTINGS, undefined, sink)
    setTimeout(() => finish(), 5)
    const state = await run

    expect(state.totalActivities).toBe(1)
  })
})

/** Waits, in real time, until the condition holds. */
async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 2))
  if (!condition()) throw new Error('condition never held')
}
