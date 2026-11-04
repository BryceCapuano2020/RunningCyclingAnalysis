import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'

/** Gates for the effort tests: a gate that did not show the best hard, and the ways a gate can be unable to judge. */
export const gate = (over: Partial<EffortGate> = {}): EffortGate => ({
  verdict: 'notHard',
  unchecked: null,
  share: 0.8,
  reference: 'trusted',
  referenceBpm: 190,
  referenceSource: 'data',
  referenceFrom: 'run',
  neededS: HEADLINE_DURATION_S,
  sessions: { hard: [], endurance: [] },
  ...over,
})

export const UNKNOWN = gate({
  verdict: 'unknown',
  share: null,
  unchecked: 'noBest',
  reference: null,
  referenceBpm: null,
})
export const NO_HEART_RATE = gate({
  verdict: 'unknown',
  share: null,
  unchecked: 'noHeartRate',
  reference: null,
})
export const THIN = gate({ verdict: 'unknown', unchecked: 'thin', reference: 'thin', share: null })
export const HARD = gate({ verdict: 'hard', share: 0.95 })
