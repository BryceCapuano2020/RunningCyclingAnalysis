import type { EpisodeView, WeekRecord } from './machine'
import { episodeStep } from './episode'
import type { Episode, EpisodeLevel } from './episode'
import { FITNESS } from './params'
import type { RunPoint } from './windows'

const E = FITNESS.episode

/** Whether the gain (`delta` is negated, so a rise is negative) stands `improvedTol` above the reference at the lower bound. */
function clearsTolerance(delta: number, level: EpisodeLevel, ep: Episode): boolean {
  const se = Math.sqrt(
    level.se ** 2 + (E.medianFactor * ep.sigma) ** 2 / ep.referenceRuns + FITNESS.monitor.tau ** 2,
  )
  return -delta - E.boundZ * se >= E.improvedTol
}

/**
 * One weekly step of an open rise. A rise is followed as a slip of the negated series (`runs` here are negated, as is
 * the episode's reference), so the slip machinery's own phases carry over: still moving is `improving`, a plateau above
 * the reference is `improved`, and a level that falls back toward the reference, or a rise that is no longer clear, ends
 * the episode without being told. A rise that has settled is shown for `improvedHoldWeeks` and then closes, so the
 * reference is read afresh from the new level.
 *
 * Returns the week's record, and `ended` when the episode is over. Numbers in the record are turned back to the
 * page's units (higher is faster).
 */
export function riseStep(
  runs: readonly RunPoint[],
  day: number,
  w: number,
  ep: Episode,
  previous: WeekRecord | undefined,
): { record: Partial<WeekRecord> & Pick<WeekRecord, 'state'>; ended: boolean } {
  const step = episodeStep(runs, day, w, ep)
  if (step.state === 'thin') return { record: { state: 'thin' }, ended: false }
  // Settled above the reference, and the gain clears its tolerance at the bound a return is held to; short of that it is still a rise.
  const settled =
    step.state === 'holding' && step.low && clearsTolerance(step.delta, step.level!, ep)
  const state =
    step.state === 'slipping' || (step.state === 'holding' && step.low && !settled)
      ? 'improving'
      : settled
        ? 'improved'
        : null
  const aged = state === 'improved' && w - (ep.phaseAt ?? w) >= E.improvedHoldWeeks
  if (state === null || aged) {
    // The day the rise began, as a slip's close says: the status then compares only the runs since it, not the weeks before.
    const closes = ep.onsetDay ?? (ep.startedWeek + 1) * 7
    return { record: { state: 'holding', delta: -step.delta, closes }, ended: true }
  }
  const fresh = state === 'improved' ? previous?.state !== 'improved' : step.fresh
  const view: EpisodeView = {
    reference: -ep.reference,
    referenceRuns: ep.referenceRuns,
    onsetDay: ep.onsetDay,
    level: { ...step.level!, m: -step.level!.m },
    trough: null,
  }
  return {
    record: {
      state,
      fresh,
      // A settled rise enters with the statistic that declared it; a rise that began again, with its own.
      z: state === 'improved' ? ep.riseZ : -step.z,
      delta: -step.delta,
      episode: view,
    },
    ended: false,
  }
}
