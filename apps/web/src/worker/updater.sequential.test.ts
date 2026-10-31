import type { ActivityRecord } from '@rca/contract'
import { digestActivity, MODEL_REVISION } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import { runUpdate, updateCandidates } from './updater'
import type { UpdateSteps } from './updater'
import { BREAKER_FAILURES } from './updaterConfig'

// One lane, so the order steps end in is the order they start in and the counts are exact.
vi.mock('./updaterConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./updaterConfig')>()),
  UPDATE_PARALLELISM: 1,
}))

const sample = sampleDataset().activities[0]
if (sample === undefined) throw new Error('The sample has no activities')
const BASE = digestActivity(sample)

function record(n: number): ActivityRecord {
  return {
    id: `rec${n}`,
    digest: { ...BASE, id: `a${n}`, startMs: BASE.startMs + n * 86_400_000, modelRevision: 1 },
    fileName: 'a.fit',
    hasFile: true,
    fileSize: 1,
    createdAt: 1,
  }
}
const candidates = (count: number) =>
  updateCandidates(
    Array.from({ length: count }, (_, i) => record(i)),
    new Set(),
  )

/** Steps whose download fails for the ids given and finds no match for the unmatched ones. */
function fakeSteps(failing: ReadonlySet<string>, unmatched: ReadonlySet<string> = new Set()) {
  const originals: string[] = []
  const steps: UpdateSteps = {
    original: async (saved) => {
      originals.push(saved.id)
      if (failing.has(saved.id)) throw new ApiRequestError(500, 'server_error', 'down')
      if (unmatched.has(saved.id)) return { fileHash: 'h', activity: undefined }
      return { fileHash: 'h', activity: saved.digest as unknown as Activity }
    },
    digest: (activity) => ({
      ...(activity as unknown as ActivityDigest),
      modelRevision: MODEL_REVISION,
    }),
    replace: async (digest, saved) => ({ ...saved, digest }),
    keep: () => undefined,
    stampHolds: () => true,
    waiting: () => 0,
    sleep: async () => undefined,
    note: () => undefined,
  }
  return { steps, originals }
}

describe('the update breaker, one activity at a time', () => {
  it('stops at the fifth failure in a row and tries nothing after it', async () => {
    const { steps, originals } = fakeSteps(new Set(candidates(30).map(({ id }) => id)))
    const result = await runUpdate(candidates(30), steps)
    expect(result).toMatchObject({ stopped: 'breaker', failed: BREAKER_FAILURES, rebuilt: 0 })
    expect(originals).toHaveLength(BREAKER_FAILURES)
  })

  it('counts a success as a reset, and an original that does not match as neither', async () => {
    // Newest first: rec9 unmatched, rec8 to rec5 fail, rec4 succeeds, rec3 to rec0 fail.
    const failing = new Set(['rec8', 'rec7', 'rec6', 'rec5', 'rec3', 'rec2', 'rec1', 'rec0'])
    const { steps } = fakeSteps(failing, new Set(['rec9']))
    const result = await runUpdate(candidates(10), steps)
    expect(result).toMatchObject({ rebuilt: 1, failed: 8, stopped: null })
    expect(result.unmatched.map(({ id }) => id)).toEqual(['rec9'])
  })

  it('does not reset on an unmatched original in the middle of a run of failures', async () => {
    // rec9 to rec6 fail, rec5 is unmatched, rec4 fails: the fifth failure in a row.
    const { steps } = fakeSteps(
      new Set(['rec9', 'rec8', 'rec7', 'rec6', 'rec4']),
      new Set(['rec5']),
    )
    const result = await runUpdate(candidates(10), steps)
    expect(result).toMatchObject({ stopped: 'breaker', failed: 5 })
  })

  it('counts the activity that met a daily limit and every one after it as limited', async () => {
    const { steps, originals } = fakeSteps(new Set())
    const original: UpdateSteps['original'] = async (saved) => {
      originals.push(saved.id)
      if (saved.id === 'rec5') throw new ApiRequestError(429, 'daily_limit', 'limit')
      return { fileHash: 'h', activity: saved.digest as unknown as Activity }
    }
    const result = await runUpdate(candidates(8), { ...steps, original })
    // Newest first: rec7 and rec6 are rebuilt, rec5 meets the limit, rec4 to rec0 are not tried.
    expect(result).toMatchObject({ rebuilt: 2, limited: 6, limitKind: 'daily', stopped: null })
    expect(originals).toEqual(['rec7', 'rec6', 'rec5'])
  })
})
