import type { CriticalPowerFit } from '../types'

/**
 * The model error of a critical-power fit, as a share of the threshold. The regression error (`cpSe`) shrinks
 * with every added effort, but it assumes all of them lie on one curve; efforts a rider or runner did not quite give,
 * on different days, do not. Over synthetic libraries that follow hard training (effort/gate.sim.test.ts) the
 * fit's error is a few percent with a regression error of one or two, so a spread of the regression error alone
 * held the truth in a minority of libraries. This share is the smallest, in half percents, at which the spread
 * below holds the truth in two libraries of three; it matches the 5.2% standard error of estimate field fits show
 * against a laboratory threshold (Karsten et al. 2015, in docs/research/capability-from-field-data.md).
 */
export const MODEL_ERROR_FRACTION = 0.05

/**
 * Half the span of the threshold's fit spread, in the fit's unit: the regression error and the model error,
 * combined as independent errors are. The drawn "fit spread" is the fit either side of the threshold by this.
 */
export function cpSpread(fit: Pick<CriticalPowerFit, 'cp' | 'cpSe'>): number {
  return Math.hypot(fit.cpSe, MODEL_ERROR_FRACTION * fit.cp)
}
