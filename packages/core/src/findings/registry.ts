import type { Sport } from '../types'
import { perSport } from './constants'
import { DETECTORS } from './detectors'
import type { Detector } from './types'

/** The detectors to run for each sport, in the order they are listed. */
export type Registry = Record<Sport, readonly Detector[]>

/**
 * Sorts detectors into the sports they say they are for. Two with one id are an error, since the id
 * names their findings.
 */
export function registryOf(detectors: readonly Detector[]): Registry {
  const seen = new Set<string>()
  for (const detector of detectors) {
    if (seen.has(detector.id)) throw new Error(`Two findings detectors are called ${detector.id}`)
    seen.add(detector.id)
  }
  return perSport((sport) => detectors.filter((d) => d.sports.includes(sport)))
}

/** The detectors the app runs. */
export const REGISTRY: Registry = registryOf(DETECTORS)
