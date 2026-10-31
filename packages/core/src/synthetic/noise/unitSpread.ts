import { digestActivity } from '../../digest/digestActivity'
import { runSeries } from '../../fitness/unit'
import type { Library } from './library'

/**
 * The spread of the same-heart-rate unit about the weekly level the athlete was at, as the app
 * reads it: every activity is digested and the steady runs are reduced to one value each. The
 * truth the unit is compared with is the weekly level only; the run-to-run draw and everything the
 * devices add are what a real library shows as spread. Log units; null when fewer than 8 runs make the series.
 */
const MIN_POINTS = 8

export function unitSpread(library: Library): { sd: number; points: number } | null {
  const truth = new Map(library.entries.map((e) => [e.activity.id, e.weeklyLevel]))
  const digests = library.entries.map((e) => digestActivity(e.activity))
  const { points } = runSeries(digests, 'run', new Set())
  if (points.length < MIN_POINTS) return null
  const residuals = points.map((p) => p.x - truth.get(p.id)!)
  const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length
  const variance = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / (residuals.length - 1)
  return { sd: Math.sqrt(variance), points: points.length }
}
