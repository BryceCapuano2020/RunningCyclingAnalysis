import type { PersonaSpec } from './library'
import { buildLibrary } from './library'
import { unitSpread } from './unitSpread'

/**
 * The same-heart-rate unit spread of a configuration, pooled (root mean square) over libraries of
 * `weeks` weeks for seeds 1 to `seeds`. Libraries too sparse to give a series are left out.
 */
export function pooledUnitSpread(spec: PersonaSpec, seeds: number, weeks: number): number {
  const variances: number[] = []
  for (let seed = 1; seed <= seeds; seed++) {
    const found = unitSpread(buildLibrary(spec, seed, weeks))
    if (found) variances.push(found.sd ** 2)
  }
  return Math.sqrt(variances.reduce((s, v) => s + v, 0) / Math.max(1, variances.length))
}
