import { DAY_MS } from '../constants'
import type {
  ThresholdFit,
  ThresholdStep,
  ThresholdTimeline,
} from '../digest/thresholdTimelineTypes'

/** A new threshold has to hold this long, in days, before the zones follow it: about two weeks. */
export const SETTLE_DAYS = 14

/** The standard error of a fit. A fit with none (two points, so no error to speak of) counts as infinitely uncertain, so it never moves a held threshold. */
const seOf = (fit: ThresholdFit): number =>
  Number.isFinite(fit.cpSe) ? fit.cpSe : Number.POSITIVE_INFINITY

/** Whether `fit` moved off `held` by more than its own standard error. */
const beyondError = (fit: ThresholdFit, held: ThresholdFit): boolean =>
  Math.abs(fit.cp - held.cp) > seOf(fit)

/** The day a step's window began to hold its efforts: a step is dated by the end of its first week. */
const startOf = (step: ThresholdStep): number => step.fromMs - 7 * DAY_MS

/**
 * Whether the candidate step at `i` stands as of `nowMs`: it has lasted SETTLE_DAYS before the next step changes anything
 * (the newest step has lasted until now, and steps after now are not yet facts), or the next step carries on in the same
 * direction past the held fit. A step that goes back where it came from is a hard effort passing through the window, not
 * the athlete changing. A hard effort that entered the window this week does not move today's zones.
 */
function stands(
  steps: readonly ThresholdStep[],
  i: number,
  fit: ThresholdFit,
  held: ThresholdFit,
  nowMs: number,
): boolean {
  const next = steps[i + 1]
  const known = next !== undefined && startOf(next) <= nowMs ? next : undefined
  if ((known === undefined ? nowMs : startOf(known)) - startOf(steps[i]!) >= SETTLE_DAYS * DAY_MS) {
    return true
  }
  if (known === undefined || known.fit === null) return false
  return (
    beyondError(known.fit, held) &&
    Math.sign(known.fit.cp - held.cp) === Math.sign(fit.cp - held.cp)
  )
}

/**
 * One sport's steps as the zones read them. The threshold is a fit over the trailing 26 weeks, so a hard effort entering
 * or leaving that window moves the fit in one step, and a zone edge would follow the window and not the athlete. The zones
 * hold the fit they had until a window's fit differs from it by more than its own standard error and stands (see
 * `stands`, about two weeks). A step the window gave no fit for stays without one, and one whose efforts outgrew the older fit
 * (its `lastFit` is -1) leaves no older fit to stand in for it. Each step with a fit says which window it was taken over
 * (`windowEndMs`): the step's own only where the step adopted the fit.
 */
function settledSteps(steps: readonly ThresholdStep[], nowMs: number): ThresholdStep[] {
  let held: ThresholdFit | null = null
  let heldAsOf: number | null = null
  // The end of the window the held fit was taken over: the week end of the step that adopted it.
  let heldEnd = 0
  let lastFit = -1
  return steps.map((step, i) => {
    const raw = step.fit
    if (raw === null) {
      // A step whose efforts outgrew the older fit has none to stand in for it (`lastFit` -1): the held fit does not either.
      if (step.lastFit < 0) lastFit = -1
      return { ...step, fit: null, lastFit }
    }
    const moved = held !== null && beyondError(raw, held)
    const adopt = held === null || (moved && stands(steps, i, raw, held, nowMs))
    if (adopt) {
      held = raw
      heldEnd = step.fromMs
    }
    // A window within error of the held fit confirms it, so its newest effort dates it; a spike does not.
    if (adopt || !moved) heldAsOf = step.asOfMs
    lastFit = i
    return { ...step, fit: held, asOfMs: heldAsOf, lastFit, windowEndMs: heldEnd }
  })
}

/**
 * The thresholds the zones are cut from: each sport's timeline settled (see `settledSteps`) as of `nowMs`. Plain data, as the
 * timeline is.
 */
export function settledThresholds(timeline: ThresholdTimeline, nowMs: number): ThresholdTimeline {
  return { run: settledSteps(timeline.run, nowMs), ride: settledSteps(timeline.ride, nowMs) }
}
