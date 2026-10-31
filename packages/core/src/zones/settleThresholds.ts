import { DAY_MS } from '../constants'
import type { ThresholdStep, ThresholdTimeline } from '../digest/thresholdTimelineTypes'
import type { CriticalPowerFit, Sport } from '../types'

/** A new threshold has to hold this long, in days, before the zones follow it, unless it is beyond doubt. */
export const SETTLE_DAYS = 14

/** The per-sport fits of the whole library: null where the library's own fit is refused. */
export type LibraryFits = Record<Sport, CriticalPowerFit | null>

/** The standard error of a fit, or 0 when it has none to speak of. */
const seOf = (fit: CriticalPowerFit): number => (Number.isFinite(fit.cpSe) ? fit.cpSe : 0)

/** Whether `fit` moved off `held` by more than its own standard error. */
const beyondError = (fit: CriticalPowerFit, held: CriticalPowerFit): boolean =>
  Math.abs(fit.cp - held.cp) > seOf(fit)

/**
 * Whether the candidate step at `i` stands: it lasts SETTLE_DAYS before the next step changes anything, or the next
 * step carries on in the same direction past the held fit. A step that goes back where it came from is a hard effort
 * passing through the window, not the athlete changing.
 */
function stands(
  steps: readonly ThresholdStep[],
  i: number,
  fit: CriticalPowerFit,
  held: CriticalPowerFit,
): boolean {
  const next = steps[i + 1]
  if (next === undefined) return true
  if (next.fromMs - steps[i]!.fromMs >= SETTLE_DAYS * DAY_MS) return true
  if (next.fit === null) return false
  return (
    beyondError(next.fit, held) && Math.sign(next.fit.cp - held.cp) === Math.sign(fit.cp - held.cp)
  )
}

/**
 * One sport's steps as the zones read them. A threshold window is short and a hard effort entering or leaving it
 * moves the fit in one step, so a zone edge would follow the window and not the athlete. The zones hold the fit they
 * had until a window's fit differs from it by more than its own standard error and stands (see `stands`); the newest
 * fit is always taken, as the library's own figure. A step the window gave no fit for stays without one. Where the whole
 * library's fit is refused (`library` null) no step has a fit: a window cannot be trusted where the library cannot.
 */
function settledSteps(
  steps: readonly ThresholdStep[],
  library: CriticalPowerFit | null,
): ThresholdStep[] {
  const newestFit = steps.findLastIndex((step) => step.fit !== null)
  let held: CriticalPowerFit | null = null
  let heldAsOf: number | null = null
  let lastFit = -1
  return steps.map((step, i) => {
    const raw = library === null ? null : step.fit
    if (raw === null) return { ...step, fit: null, lastFit }
    const moved = held !== null && beyondError(raw, held)
    const adopt = held === null || i >= newestFit || (moved && stands(steps, i, raw, held))
    if (adopt) held = raw
    // A window within error of the held fit confirms it, so its newest effort dates it; a spike does not.
    if (adopt || !moved) heldAsOf = step.asOfMs
    lastFit = i
    return { ...step, fit: held, asOfMs: heldAsOf, lastFit }
  })
}

/**
 * The thresholds the zones are cut from: each sport's timeline settled (see `settledSteps`) and switched off where the
 * library's own fit is refused. Plain data, as the timeline is.
 */
export function settledThresholds(
  timeline: ThresholdTimeline,
  library: LibraryFits,
): ThresholdTimeline {
  return {
    run: settledSteps(timeline.run, library.run),
    ride: settledSteps(timeline.ride, library.ride),
  }
}
