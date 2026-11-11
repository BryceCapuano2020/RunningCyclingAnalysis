import { describe, expect, it } from 'vitest'
import { recordingGapsOf } from './recordingGaps'
import { steadyTrace } from './test/workbenchFixtures'

describe('recordingGapsOf', () => {
  it('counts each unrecorded stretch once and adds up its seconds', () => {
    const trace = steadyTrace(60)
    trace.unrecorded.fill(1, 10, 25)
    trace.unrecorded.fill(1, 40, 43)
    expect(recordingGapsOf(trace)).toEqual({ count: 2, seconds: 18 })
  })

  it('is null for a trace recorded throughout', () => {
    expect(recordingGapsOf(steadyTrace(60))).toBeNull()
  })
})
