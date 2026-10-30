import type { Sport } from '../types'
import { FINDINGS, perSport } from './constants'
import { DETECTORS } from './detectors'
import type { Detector } from './types'

/** The detectors to run for each sport, in the order they are listed. */
export type Registry = Record<Sport, readonly Detector[]>

/**
 * Sorts detectors into the sports they say they are for. Two with one id are an error, since the id
 * names their findings, and so is a set whose false-alarm shares add to more than the family budget: without that
 * limit every detector added speaks more false findings, however strict its own bar.
 */
export function registryOf(detectors: readonly Detector[]): Registry {
  const seen = new Set<string>()
  for (const detector of detectors) {
    if (seen.has(detector.id)) throw new Error(`Two findings detectors are called ${detector.id}`)
    seen.add(detector.id)
  }
  const spent = detectors.reduce((sum, detector) => sum + detector.alarmBudget, 0)
  if (spent > FINDINGS.familyBudgetPerYear + 1e-9) {
    throw new Error(
      `The findings detectors ask for ${spent} false findings an athlete-year, over the family budget of ${FINDINGS.familyBudgetPerYear}`,
    )
  }
  return perSport((sport) => detectors.filter((d) => d.sports.includes(sport)))
}

/** The detectors the app runs. */
export const REGISTRY: Registry = registryOf(DETECTORS)
