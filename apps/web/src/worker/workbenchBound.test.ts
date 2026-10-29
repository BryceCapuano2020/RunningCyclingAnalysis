import { activityTraceOf } from '@rca/core/workbench'
import { describe, expect, it } from 'vitest'
import { sampleDataset } from '@rca/core/synthetic'
import { activityTraceBytes, parseBoundedTrace, WORKBENCH_ENTRY_BYTES } from './workbenchSchema'

describe('the bound on a stored trace counts the masks and the pace speed', () => {
  const activity = sampleDataset().activities[0]!
  const n = activity.n
  const flagged = new Uint8Array(n).fill(1)

  it('adds the left-out masks and the zone speed to a trace size', () => {
    const plain = activityTraceOf(activity)
    const withMasks = {
      ...plain,
      unusable: { heartRate: flagged },
      zoneSpeed: new Float32Array(n),
    }
    expect(activityTraceBytes(withMasks)).toBe(activityTraceBytes(plain) + n + 4 * n)
  })

  it('refuses a mask that takes a trace over the entry limit, and keeps one inside it', () => {
    const plain = activityTraceOf(activity)
    expect(parseBoundedTrace({ ...plain, unusable: { heartRate: flagged } })).not.toBeNull()
    const huge = new Uint8Array(WORKBENCH_ENTRY_BYTES)
    expect(parseBoundedTrace({ ...plain, unusable: { heartRate: huge } })).toBeNull()
    expect(parseBoundedTrace({ ...plain, unusable: 'x' })).toBeNull()
  })
})
