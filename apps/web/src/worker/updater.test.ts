import type { ActivityRecord } from '@rca/contract'
import { digestActivity, MODEL_REVISION } from '@rca/core/digest'
import { withRevisionTable } from '@rca/core/digest/revisions'
import type { RevisionDeclaration } from '@rca/core/digest/revisions'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import { runUpdate, updateCandidates } from './updater'
import type { UpdateSteps } from './updater'
import { BREAKER_FAILURES, STEP_TIMEOUT_MS } from './updaterConfig'

const sample = sampleDataset().activities[0]
if (sample === undefined) throw new Error('The sample has no activities')
const BASE = digestActivity(sample)
const DAY = 86_400_000

function record(n: number, digest: Partial<ActivityDigest> = {}, hasFile = true): ActivityRecord {
  return {
    id: `rec${n}`,
    digest: { ...BASE, id: `a${n}`, startMs: BASE.startMs + n * DAY, modelRevision: 1, ...digest },
    fileName: 'a.fit',
    hasFile,
    fileSize: hasFile ? 1 : null,
    createdAt: 1,
  }
}

const records = (count: number) => Array.from({ length: count }, (_, i) => record(i))
const apiError = (status: number, code: string, retryAfterMs?: number, message = code) =>
  new ApiRequestError(status, code, message, retryAfterMs)

/** Steps over a fake server. `original` reads the record's own digest back as the activity in its file. */
function fakeSteps(overrides: Partial<UpdateSteps> = {}) {
  const log = { originals: [] as string[], replaced: [] as string[], kept: [] as string[] }
  const steps: UpdateSteps = {
    original: async (saved) => {
      log.originals.push(saved.id)
      return { fileHash: 'h', activity: saved.digest as unknown as Activity }
    },
    digest: (activity) => ({
      ...(activity as unknown as ActivityDigest),
      modelRevision: MODEL_REVISION,
    }),
    replace: async (digest, saved) => {
      log.replaced.push(saved.id)
      return { ...saved, digest }
    },
    keep: (saved) => {
      log.kept.push(saved.id)
    },
    stampHolds: () => true,
    waiting: () => 0,
    sleep: async () => undefined,
    note: () => undefined,
    ...overrides,
  }
  return { steps, log }
}

afterEach(() => vi.useRealTimers())

describe('updateCandidates', () => {
  it('lists stale activities with an original, newest first, leaving out the unmatched', () => {
    const list = [
      record(1),
      record(4),
      record(2, {}, false),
      record(3),
      record(5, { modelRevision: MODEL_REVISION }),
    ]
    expect(updateCandidates(list, new Set(['rec3'])).map(({ id }) => id)).toEqual(['rec4', 'rec1'])
  })

  it('also lists a compatible digest that lacks a field the current model records', () => {
    const exclusive = (revision: number): RevisionDeclaration => ({
      revision,
      kind: 'exclusive',
      adds: [],
      changes: [],
      affects: [],
    })
    const table: readonly RevisionDeclaration[] = [
      exclusive(1),
      exclusive(2),
      { revision: 3, kind: 'additive', adds: ['athleteType'], changes: [], affects: [] },
      { revision: 4, kind: 'additive', adds: [], changes: [], affects: [] },
    ]
    const ids = withRevisionTable(table, () =>
      updateCandidates(
        [
          record(0, { modelRevision: 2 }),
          record(1, { modelRevision: 3 }),
          record(2, { modelRevision: 4 }),
        ],
        new Set(),
      ).map(({ id }) => id),
    )
    // Revision 2 is compatible but lacks athleteType, 3 lacks nothing, 4 is current.
    expect(ids).toEqual(['rec0'])
  })
})

describe('runUpdate', () => {
  it('rebuilds every candidate once, starting with the newest, and keeps each verified upgrade', async () => {
    const { steps, log } = fakeSteps()
    const list = updateCandidates(records(6), new Set())
    const result = await runUpdate(list, steps)
    expect(result).toMatchObject({ rebuilt: 6, failed: 0, limited: 0, stopped: null })
    expect(log.originals).toEqual(['rec5', 'rec4', 'rec3', 'rec2', 'rec1', 'rec0'])
    expect([...log.replaced].sort()).toEqual([...log.originals].sort())
    expect(log.kept).toHaveLength(6)
  })

  it('counts an original that no longer matches as an outcome, not a failure', async () => {
    const { steps } = fakeSteps({
      original: async (saved) => {
        if (saved.id === 'rec0') return { fileHash: 'h', activity: undefined }
        if (saved.id === 'rec1') throw apiError(404, 'not_found')
        if (saved.id === 'rec2') throw apiError(409, 'activity_conflict')
        return { fileHash: 'h', activity: saved.digest as unknown as Activity }
      },
    })
    const result = await runUpdate(records(10), steps)
    expect(result.unmatched.map(({ id }) => id).sort()).toEqual(['rec0', 'rec1', 'rec2'])
    expect(result).toMatchObject({ rebuilt: 7, failed: 0, stopped: null })
  })

  describe('the circuit breaker', () => {
    it('stops after five failures in a row (the exact count is in the one-lane file)', async () => {
      const { steps } = fakeSteps({
        original: async () => {
          throw apiError(500, 'server_error')
        },
      })
      const result = await runUpdate(records(30), steps)
      expect(result.stopped).toBe('breaker')
      // Two lanes: a step already running when the fifth failure lands still ends.
      expect(result.failed).toBeGreaterThanOrEqual(BREAKER_FAILURES)
      expect(result.failed).toBeLessThanOrEqual(BREAKER_FAILURES + 1)
      expect(result.rebuilt).toBe(0)
    })

    it('counts a digest that is not the same workout as a failure, and sends nothing', async () => {
      const wrong: Array<(digest: ActivityDigest) => ActivityDigest> = [
        (digest) => ({ ...digest, startMs: digest.startMs + 1000 }),
        (digest) => ({ ...digest, sport: digest.sport === 'run' ? 'ride' : 'run' }),
        (digest) => ({ ...digest, modelRevision: MODEL_REVISION - 1 }),
      ]
      for (const alter of wrong) {
        const { steps, log } = fakeSteps({
          digest: (activity) =>
            alter({ ...(activity as unknown as ActivityDigest), modelRevision: MODEL_REVISION }),
        })
        const result = await runUpdate([record(1)], steps)
        expect(result).toMatchObject({ rebuilt: 0, failed: 1 })
        expect(log.replaced).toEqual([])
      }
    })

    it('sends the saved id when the file gives another, because the workout is the same', async () => {
      const sent: ActivityDigest[] = []
      const { steps } = fakeSteps({
        digest: (activity) => ({
          ...(activity as unknown as ActivityDigest),
          id: '1745273200000-renamed.fit#1',
          modelRevision: MODEL_REVISION,
        }),
        replace: async (digest, saved) => {
          sent.push(digest)
          return { ...saved, digest }
        },
      })
      const saved = record(1)
      expect(await runUpdate([saved], steps)).toMatchObject({ rebuilt: 1, failed: 0 })
      expect(sent[0]?.id).toBe(saved.digest.id)
    })

    it('does not let one row the server will not take stop the rows after it', async () => {
      const { steps, log } = fakeSteps({
        replace: async (digest, saved) => {
          if (saved.id === 'rec3')
            throw apiError(400, 'invalid_request', undefined, 'digest.name: Too long')
          return { ...saved, digest }
        },
      })
      const result = await runUpdate(records(10), steps)
      expect(result).toMatchObject({ rebuilt: 9, failed: 1, stopped: null })
      expect(log.originals).toHaveLength(10)
    })
  })

  describe('answers that end the run', () => {
    it.each([
      ['app_outdated', apiError(409, 'app_outdated'), 'outdated'],
      [
        'the refusal of a newer model',
        apiError(
          400,
          'invalid_request',
          undefined,
          'digest.modelRevision: This server supports model revisions through 6',
        ),
        'refused',
      ],
    ] as const)('stops at once on %s', async (_name, error, reason) => {
      const { steps, log } = fakeSteps({
        replace: async () => {
          throw error
        },
      })
      const result = await runUpdate(records(20), steps)
      expect(result.stopped).toBe(reason)
      expect(result.failed).toBe(0)
      expect(log.originals.length).toBeLessThanOrEqual(2)
    })

    it('stops at once on a record from a newer model', async () => {
      const { steps, log } = fakeSteps({
        replace: async (digest, saved) => ({
          ...saved,
          digest: { ...digest, modelRevision: MODEL_REVISION + 1 },
        }),
      })
      const result = await runUpdate(records(20), steps)
      expect(result).toMatchObject({ stopped: 'newer', rebuilt: 0, failed: 0 })
      expect(log.originals.length).toBeLessThanOrEqual(2)
    })

    it('throws a sign-out, and starts nothing after it', async () => {
      const { steps, log } = fakeSteps({
        original: async () => {
          throw apiError(401, 'unauthenticated')
        },
      })
      await expect(runUpdate(records(20), steps)).rejects.toMatchObject({ status: 401 })
      expect(log.replaced).toEqual([])
    })
  })

  describe('limits', () => {
    it('stops downloading at a daily limit and counts the activities it did not reach', async () => {
      const { steps, log } = fakeSteps({
        original: async (saved) => {
          if (saved.id === 'rec5') throw apiError(429, 'daily_limit')
          return { fileHash: 'h', activity: saved.digest as unknown as Activity }
        },
      })
      const result = await runUpdate(updateCandidates(records(8), new Set()), steps)
      expect(result.limitKind).toBe('daily')
      expect(result.stopped).toBeNull()
      // Every candidate is either rebuilt or counted as limited, and the rest are not downloaded.
      expect(result.limited + result.rebuilt).toBe(8)
      expect(result.limited).toBeGreaterThanOrEqual(1)
      expect(log.originals.length).toBeLessThan(8)
    })

    it('waits out a rate limit once and tries the same step again', async () => {
      const slept: number[] = []
      let refused = true
      const { steps } = fakeSteps({
        sleep: async (ms) => {
          slept.push(ms)
        },
        replace: async (digest, saved) => {
          if (refused) {
            refused = false
            throw apiError(429, 'rate_limited', 5_000)
          }
          return { ...saved, digest }
        },
      })
      const result = await runUpdate([record(1)], steps)
      expect(result).toMatchObject({ rebuilt: 1, limited: 0, limitKind: null })
      expect(slept).toEqual([5_000])
    })

    it('ends a second rate limit as limited, and one asking for too long at once', async () => {
      const slept: number[] = []
      const sleep = async (ms: number) => {
        slept.push(ms)
      }
      const twice = fakeSteps({
        sleep,
        replace: async () => {
          throw apiError(429, 'rate_limited', 1_000)
        },
      })
      expect(await runUpdate(records(5), twice.steps)).toMatchObject({
        rebuilt: 0,
        limitKind: 'rate',
        limited: 5,
      })
      expect(slept.slice(0, 1)).toEqual([1_000])

      slept.length = 0
      const long = fakeSteps({
        sleep,
        original: async () => {
          throw apiError(429, 'rate_limited', 1_000_000)
        },
      })
      expect(await runUpdate(records(3), long.steps)).toMatchObject({ limitKind: 'rate' })
      expect(slept).toEqual([])
    })

    it('lets a daily limit outrank a rate limit met in the same run', async () => {
      const { steps } = fakeSteps({
        original: async (saved) => {
          throw saved.id === 'rec3'
            ? apiError(429, 'daily_limit')
            : apiError(429, 'rate_limited', 1)
        },
      })
      const result = await runUpdate(updateCandidates(records(4), new Set()), steps)
      expect(result.limitKind).toBe('daily')
    })
  })

  describe('an upgrade the server did not take', () => {
    it('sends the same digest once more when the answer still carries the old revision', async () => {
      const calls: number[] = []
      const { steps, log } = fakeSteps({
        replace: async (digest, saved) => {
          calls.push(calls.length)
          // Another request changed the row first, so the server kept its own copy.
          return calls.length === 1 ? saved : { ...saved, digest }
        },
      })
      expect(await runUpdate([record(1)], steps)).toMatchObject({ rebuilt: 1, failed: 0 })
      expect(calls).toHaveLength(2)
      expect(log.originals).toHaveLength(1)
    })

    it('counts a failure when the retry is unchanged too', async () => {
      const { steps, log } = fakeSteps({ replace: async (_digest, saved) => saved })
      expect(await runUpdate([record(1)], steps)).toMatchObject({ rebuilt: 0, failed: 1 })
      expect(log.kept).toEqual([])
    })
  })

  it('keeps the athlete label of the saved digest, which the file cannot give', async () => {
    const sent: ActivityDigest[] = []
    const { steps } = fakeSteps({
      replace: async (digest, saved) => {
        sent.push(digest)
        return { ...saved, digest }
      },
    })
    await runUpdate([record(1, { athleteType: 'hike' })], steps)
    expect(sent[0]?.athleteType).toBe('hike')
  })

  it('does not fail a rebuild whose evidence could not be kept', async () => {
    const { steps } = fakeSteps({
      keep: () => {
        throw new Error('quota')
      },
    })
    expect(await runUpdate([record(1)], steps)).toMatchObject({ rebuilt: 1, failed: 0 })
  })

  describe('stamps', () => {
    it('discards a result when the stamps stopped holding during the download', async () => {
      let holds = true
      const { steps, log } = fakeSteps({
        original: async (saved) => {
          holds = false
          return { fileHash: 'h', activity: saved.digest as unknown as Activity }
        },
        stampHolds: () => holds,
      })
      const result = await runUpdate(records(4), steps)
      expect(result).toMatchObject({ stopped: 'discarded', rebuilt: 0 })
      expect(log.replaced).toEqual([])
      expect(log.kept).toEqual([])
    })

    it('discards an answer when the stamps stopped holding during the save', async () => {
      let holds = true
      const { steps, log } = fakeSteps({
        replace: async (digest, saved) => {
          holds = false
          return { ...saved, digest }
        },
        stampHolds: () => holds,
      })
      const result = await runUpdate(records(4), steps)
      expect(result).toMatchObject({ stopped: 'discarded', rebuilt: 0 })
      expect(log.kept).toEqual([])
    })
  })

  it('stands aside for a request that changes the library, and starts no step', async () => {
    const { steps, log } = fakeSteps({ waiting: () => 1 })
    const result = await runUpdate(records(4), steps)
    expect(result).toMatchObject({ stopped: 'paused', rebuilt: 0 })
    expect(log.originals).toEqual([])
  })

  it('stands aside between steps when a request arrives mid-run', async () => {
    let started = 0
    const { steps, log } = fakeSteps({
      original: async (saved) => {
        started++
        return { fileHash: 'h', activity: saved.digest as unknown as Activity }
      },
      waiting: () => (started >= 3 ? 1 : 0),
    })
    const result = await runUpdate(records(10), steps)
    expect(result.stopped).toBe('paused')
    expect(result.rebuilt).toBeGreaterThanOrEqual(3)
    expect(log.originals.length).toBeLessThan(10)
  })

  it('counts a step that takes longer than a step may as a failure', async () => {
    vi.useFakeTimers()
    const { steps } = fakeSteps({ original: () => new Promise<never>(() => undefined) })
    const running = runUpdate([record(1)], steps)
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS + 1)
    expect(await running).toMatchObject({ rebuilt: 0, failed: 1 })
  })

  it('asks for exactly one download and one save per rebuilt activity', async () => {
    const { steps, log } = fakeSteps()
    await runUpdate(records(9), steps)
    expect(log.originals).toHaveLength(9)
    expect(log.replaced).toHaveLength(9)
  })
})
