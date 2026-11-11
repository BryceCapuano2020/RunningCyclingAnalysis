import type { ActivityTrace } from '@rca/core/workbench'

/** The stretches the device did not record, a GPS or sensor gap: how many, and their seconds in all. */
export interface RecordingGaps {
  count: number
  seconds: number
}

/**
 * The recording gaps in a trace, which the timeline draws only as a break in the line, so the activity's notes can name
 * them. Null when there are none.
 */
export function recordingGapsOf(trace: ActivityTrace): RecordingGaps | null {
  let count = 0
  let seconds = 0
  let inside = false
  for (const second of trace.unrecorded) {
    if (second === 1) {
      seconds += 1
      if (!inside) count += 1
    }
    inside = second === 1
  }
  return count === 0 ? null : { count, seconds }
}
