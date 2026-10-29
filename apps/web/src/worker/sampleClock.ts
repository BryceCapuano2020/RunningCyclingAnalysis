import { generateSampleActivity, samplePlan } from '@rca/core/synthetic'
import type { SampleClock } from '@rca/core/synthetic'
import type { Activity } from '@rca/core/types'

/**
 * The clock the sample athlete is drawn with: the present, in the device's own zone, so the season ends
 * yesterday and its starts read as the visitor's own morning and evening hours.
 */
export function deviceClock(): SampleClock {
  return { nowMs: Date.now(), utcOffsetMinutes: (ms) => -new Date(ms).getTimezoneOffset() }
}

/** One sample activity, generated again for its recording, or undefined for an id the season does not hold. */
export function sampleActivityById(clock: SampleClock, id: string): Activity | undefined {
  const entry = samplePlan(clock).find((candidate) => candidate.spec.id === id)
  return entry === undefined ? undefined : generateSampleActivity(entry)
}
