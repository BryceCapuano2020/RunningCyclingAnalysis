import type { UnevenFit } from '../cp'
import type { EffortGate } from '../effort'
import type { CriticalPowerOutcome } from '../cp'
import type { CriticalPowerFit, CriticalPowerRefusal } from '../types'

/** A sport's threshold as the analysis reports it, once the effort gate has had its say. */
export interface GatedThreshold {
  fit: CriticalPowerFit | null
  refusal: CriticalPowerRefusal | null
  uneven: UnevenFit | null
}

/**
 * The threshold a sport reports. A best that was not hard is a floor, not a capability, so a fit that passed its own
 * rules is withheld when the gate says the best 20 minutes was not hard ('effort'). The second fit is then the one on the
 * bests of 3 to 10 minutes, since it reads none of the efforts the verdict is about, and it is only ever the top of a range
 * that starts at the floor. A fit already refused keeps its refusal: that is the first thing missing. A gate that cannot
 * judge ('unknown', as without a heart rate) withholds nothing.
 */
export function gatedThreshold(
  gate: EffortGate,
  outcome: CriticalPowerOutcome,
  uneven: UnevenFit | null,
  shortBests: UnevenFit | null,
): GatedThreshold {
  if (gate.verdict !== 'notHard') return { fit: outcome.fit, refusal: outcome.refusal, uneven }
  return {
    fit: null,
    refusal: outcome.fit === null ? outcome.refusal : 'effort',
    uneven: shortBests,
  }
}
