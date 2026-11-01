import type { ActivityTrace } from '@rca/core/workbench'
import { describe, expect, it } from 'vitest'
import { DeferredTraces } from './workbenchDeferred'
import type { DeferredTrace } from './workbenchDeferred'
import { WORKBENCH_TOTAL_BYTES } from './workbenchStore'

const item = (startMs: number, bytes: number): DeferredTrace => ({
  scope: { kind: 'device' },
  trace: { activityId: `at-${startMs}` } as ActivityTrace,
  bytes,
  startMs,
})

describe('the recordings held until the end of an import', () => {
  it('lets the oldest go once the sizes held pass the cache, and hands back the newest first', () => {
    const each = WORKBENCH_TOTAL_BYTES / 4
    const held = new DeferredTraces()
    // Five that are a quarter of the cache each, the oldest arriving last.
    for (let i = 0; i < 5; i++) held.hold(`k${i}`, item(10_000 - i, each))

    expect(held.has('k4')).toBe(false)
    expect(held.takeAll().map((x) => x.startMs)).toEqual([10_000, 9_999, 9_998, 9_997])
    expect([...held.values()]).toEqual([])
  })

  it('counts a recording held again once, at its new size', () => {
    const held = new DeferredTraces()
    held.hold('a', item(1, WORKBENCH_TOTAL_BYTES))
    held.hold('a', item(1, 10))
    held.hold('b', item(2, WORKBENCH_TOTAL_BYTES - 10))
    expect(held.has('a')).toBe(true)
    expect(held.has('b')).toBe(true)
  })
})
