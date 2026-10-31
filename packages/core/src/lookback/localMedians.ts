import { medianInPlace } from '../math'
import { slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { LOOKBACK } from './params'

const S = LOOKBACK.segment

/**
 * The median of the runs within `clipWeeks` weeks of each week, kept so a run is clipped against the weeks round it. The
 * weeks are asked for in order, so the runs in reach are kept sorted as the window moves along, a run entering at one end and
 * leaving at the other, not collected and selected again for every week; a week asked for out of order is worked out from
 * its own runs. Either way it is the median `medianInPlace` gives.
 */
export function localMedians(runs: readonly RunPoint[]): (week: number) => number {
  const cache = new Map<number, number>()
  const window: number[] = []
  let from = 0
  let to = 0
  let latest = Number.NEGATIVE_INFINITY
  /** The index at which `x` is, or would go, among the sorted values. */
  const place = (x: number): number => {
    let lo = 0
    let hi = window.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (window[mid]! < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const medianOfWindow = (): number => {
    const n = window.length
    if (n === 0) return 0
    const low = (n - 1) >> 1
    if (n % 2 === 1) return window[low]!
    return window[low]! + (window[low + 1]! - window[low]!) * 0.5
  }
  return (week) => {
    let median = cache.get(week)
    if (median === undefined) {
      const [lo, hi] = [(week - S.clipWeeks) * 7, (week + S.clipWeeks + 1) * 7]
      if (week < latest) {
        const near = slice(runs, lo, hi)
        median = near.length === 0 ? 0 : medianInPlace(Float64Array.from(near, (r) => r.x))
      } else {
        latest = week
        while (to < runs.length && runs[to]!.t < hi) {
          const x = runs[to]!.x
          window.splice(place(x), 0, x)
          to++
        }
        while (from < to && runs[from]!.t < lo) {
          window.splice(place(runs[from]!.x), 1)
          from++
        }
        median = medianOfWindow()
      }
      cache.set(week, median)
    }
    return median
  }
}
