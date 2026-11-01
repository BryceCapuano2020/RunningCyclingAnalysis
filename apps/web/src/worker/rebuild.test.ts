import type { ActivityRecord } from '@rca/contract'
import type { AthleteSettings } from '@rca/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listActivities } from '../api/client'
import { rebuildStale } from './rebuild'
import type { LibraryContext } from './rebuild'
import { writerLockName } from './updaterLock'

vi.mock('../api/client', () => ({ createActivity: vi.fn(), listActivities: vi.fn() }))

const USER = 'u1'

/** One lock per name, granted only while nobody holds it, as the browser's lock manager does for `ifAvailable`. */
function stubLocks(held: Set<string>) {
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        _options: object,
        callback: (lock: object | null) => unknown,
      ) => {
        if (held.has(name)) return callback(null)
        held.add(name)
        try {
          return await callback({})
        } finally {
          held.delete(name)
        }
      },
    },
  })
}

function contextOf(
  endResume: () => Promise<void>,
  restartResume: (userId: string) => void = () => undefined,
  stamp: () => () => boolean = () => () => true,
): LibraryContext {
  return {
    session: {
      loadDigests: () => ({}),
      setSettings: () => ({}),
      replaceDigest: () => undefined,
    } as unknown as LibraryContext['session'],
    device: { replaced: () => undefined },
    savedRecords: new Map<string, ActivityRecord>(),
    missingOriginals: new Set<string>(),
    unmatchedOriginals: new Set<string>(),
    post: () => undefined,
    reportLibrary: () => undefined,
    reportUnreadable: () => undefined,
    stamp,
    waitingToChange: () => 0,
    endResume,
    restartResume,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('updating the stale activities', () => {
  it('ends this tab’s own outbox resume first, so its hold on the writer lock does not refuse the update', async () => {
    vi.mocked(listActivities).mockResolvedValue([])
    const held = new Set([writerLockName(USER)])
    stubLocks(held)
    // The resume lets go of the lock as it ends.
    const endResume = vi.fn(async () => {
      held.delete(writerLockName(USER))
    })

    const result = await rebuildStale(contextOf(endResume), {} as AthleteSettings, USER)

    expect(endResume).toHaveBeenCalledTimes(1)
    expect(result.stopped).not.toBe('elsewhere')
  })

  it('still reports another tab’s hold on the lock', async () => {
    vi.mocked(listActivities).mockResolvedValue([])
    stubLocks(new Set([writerLockName(USER)]))

    const result = await rebuildStale(
      contextOf(async () => undefined),
      {} as AthleteSettings,
      USER,
    )

    expect(result.stopped).toBe('elsewhere')
  })

  it('starts the outbox resume again after the update, in the order end, update, restart', async () => {
    vi.mocked(listActivities).mockResolvedValue([])
    stubLocks(new Set())
    const order: string[] = []

    await rebuildStale(
      contextOf(
        async () => void order.push('end'),
        (userId) => void order.push(`restart ${userId}`),
      ),
      {} as AthleteSettings,
      USER,
    )

    expect(order).toEqual(['end', `restart ${USER}`])
  })

  it('does not restart it for a library that was replaced meanwhile', async () => {
    vi.mocked(listActivities).mockResolvedValue([])
    stubLocks(new Set())
    const restart = vi.fn()

    await rebuildStale(
      contextOf(
        async () => undefined,
        restart,
        () => () => false,
      ),
      {} as AthleteSettings,
      USER,
    )

    expect(restart).not.toHaveBeenCalled()
  })
})
