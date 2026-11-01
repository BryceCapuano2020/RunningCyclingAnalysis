import { traceQualityOf } from '@rca/core/digest'
import { activityTraceOf } from '@rca/core/workbench'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity } from '@rca/core/types'
import { describe, expect, it } from 'vitest'
import { Workbench } from './workbench'
import type { TraceScope, WorkbenchStore } from './workbenchStore'
import { activityTraceBytes, WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES } from './workbenchStore'

/**
 * The end-to-end check of the deferred hold's bound: recordings as large as an entry may be, about six of
 * them, built and sized as an import builds them. It costs a second locally and many times that under
 * coverage, so it runs with the budgets, which have no coverage and a runner to themselves. The hold's
 * arithmetic is in workbenchDeferred.test.ts.
 */
describe('recordings deferred to the end of an import, at the size of the cache', () => {
  const scope: TraceScope = { kind: 'device' }

  it('holds no more than the cache can, dropping the oldest activities first', async () => {
    const written: string[] = []
    const store: WorkbenchStore = {
      get: async () => null,
      has: async () => false,
      list: async () => [],
      put: async (_scope, trace) => {
        written.push(trace.activityId)
        return 'stored'
      },
      remove: async () => true,
      clearScope: async () => true,
      deleteScope: async () => true,
      reopenScope: async () => true,
      isDeleted: async () => false,
      deviceEpoch: async () => 0,
    }
    const workbench = new Workbench(store)
    await workbench.watchDevice()

    const n = 380_000
    const first = sampleDataset().activities[0]!
    const big = (id: string, startMs: number): Activity => ({
      ...first,
      id,
      startMs,
      n,
      speed: new Float64Array(n),
      distance: new Float64Array(n),
      altitude: new Float64Array(n),
      heartRate: new Float64Array(n),
      power: new Float64Array(n),
      paused: new Uint8Array(n),
      unrecorded: undefined,
      laps: [],
    })
    const probe = big('probe', 0)
    // The trace the cache builds carries the masks of the quality assessment too.
    const bytes = activityTraceBytes(activityTraceOf(probe, traceQualityOf(probe)))
    expect(bytes).toBeLessThanOrEqual(WORKBENCH_ENTRY_BYTES)
    const fit = Math.floor(WORKBENCH_TOTAL_BYTES / bytes)

    // One more than fits, the oldest arriving last.
    for (let i = 0; i <= fit; i++) workbench.captureDeferred(big(`a${i}`, 10_000 - i), scope)
    await workbench.storeDeferred()

    expect(written).toHaveLength(fit)
    expect(written).not.toContain(`a${fit}`)
    expect(written[0]).toBe('a0')
  })
})
