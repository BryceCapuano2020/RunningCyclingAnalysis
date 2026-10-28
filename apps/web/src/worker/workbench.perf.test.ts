import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityTrace } from '@rca/core/workbench'
import { describe, expect, it } from 'vitest'
import { Workbench } from './workbench'
import type { WorkbenchStore } from './workbenchStore'

/**
 * Every activity an import keeps is captured as a trace, one at a time, before the next is read. Apart
 * from storage, which a browser times, a capture of one of the sample's activities, about 77 minutes
 * each, takes about 25 microseconds locally, so 200 take about 5 ms. The budget is six times that, so a
 * check or copy added to each capture, or a read of the whole library to make room, fails it while a
 * loaded runner does not.
 */
const BUDGET_MS = 30
const CAPTURES = 200

/** A store that keeps nothing and refuses nothing, so only the capture itself is timed. */
const NOWHERE: WorkbenchStore = {
  get: async () => null,
  has: async () => false,
  put: async (_scope, _trace: ActivityTrace) => 'stored',
  remove: async () => true,
  clearScope: async () => true,
  deleteScope: async () => true,
  isDeleted: async () => false,
}

describe('workbench capture performance', () => {
  const activities = sampleDataset().activities

  it(`captures ${CAPTURES} activities in under ${BUDGET_MS} ms`, async () => {
    const workbench = new Workbench(NOWHERE)
    let fastest = Infinity
    let captured = 0
    for (let run = 0; run < 7; run++) {
      const start = performance.now()
      captured = 0
      for (let i = 0; i < CAPTURES; i++) {
        const trace = await workbench.capture(activities[i % activities.length]!, {
          kind: 'account',
          userId: 'perf',
        })
        if (trace !== null) captured++
      }
      fastest = Math.min(fastest, performance.now() - start)
    }
    // Keeping the count means none of the timed work can be skipped.
    expect(captured).toBe(CAPTURES)
    expect(fastest).toBeLessThan(BUDGET_MS)
  })
})
