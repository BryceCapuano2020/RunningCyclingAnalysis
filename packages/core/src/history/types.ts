import type { EstimatedRideGate } from '../digest/estimatedRide'
import type { EffortReference } from '../effort'
import type { ActivityDigest, AthleteSettings } from '../types'

/** What a part may read besides the digests, which are the look-back's inputs. */
export interface HistoryInput {
  settings: AthleteSettings
  /** Whose heart rate or power is set aside. */
  setAside: ReadonlySet<string>
  /** The wall clock, cut to the day by the caller so the memory still hits. */
  nowMs: number
  gate: EstimatedRideGate | null | undefined
  /** The reference heart rates an effort is judged hard against (the effort gate's own). */
  effortReference: EffortReference
}

/**
 * One chart's data, built from the analysed digests (hidden copies, walking-pace runs and labelled activities are out)
 * in canonical order. The answer is remembered for the same digests and for inputs `same` calls equal.
 */
export interface HistoryPart<T> {
  /** The answer for a library with nothing in it. */
  empty: T
  build: (digests: ActivityDigest[], input: HistoryInput) => T
  /** Whether two inputs give the same answer for the same digests. */
  same: (a: HistoryInput, b: HistoryInput) => boolean
}

/** For a part that reads the digests alone. */
export const readsDigestsOnly = (): boolean => true
