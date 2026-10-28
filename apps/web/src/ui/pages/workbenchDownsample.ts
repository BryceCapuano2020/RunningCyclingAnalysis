import { isTraceObservation } from '@rca/core/workbench'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'

/** Reduce an elapsed-time stream without joining separate recorded segments. */
export function downsampleActivityTrace(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
  limit: number,
) {
  const stream = trace.streams[metric]
  if (!stream) return []
  const from = Math.max(0, Math.floor(startS))
  const to = Math.min(stream.length, Math.ceil(endS))
  // Each bucket emits at most two contiguous runs plus boundary separators.
  // A more fragmented bucket is represented by a gap rather than a line that
  // could imply readings through one or more missing spans.
  const buckets = Math.max(1, Math.floor(limit / 7))
  const bucketSize = Math.max(1, Math.ceil((to - from) / buckets))
  const points: { timeS: number; value: number }[] = []
  for (let left = from; left < to; left += bucketSize) {
    const right = Math.min(to, left + bucketSize)
    const runs: {
      first: number
      last: number
      minIndex: number
      maxIndex: number
      min: number
      max: number
    }[] = []
    let run: (typeof runs)[number] | undefined
    let fragmented = false
    for (let i = left; i < right; i += 1) {
      if (!isTraceObservation(trace, metric, i)) {
        run = undefined
        continue
      }
      const value = stream[i]!
      if (!run) {
        if (runs.length === 2) {
          fragmented = true
          continue
        }
        run = { first: i, last: i, minIndex: i, maxIndex: i, min: value, max: value }
        runs.push(run)
      } else {
        run.last = i
        if (value < run.min) {
          run.min = value
          run.minIndex = i
        }
        if (value > run.max) {
          run.max = value
          run.maxIndex = i
        }
      }
    }
    if (fragmented || runs.length === 0) {
      points.push({ timeS: left + Math.floor((right - left) / 2), value: Number.NaN })
      continue
    }
    if (runs[0]!.first > left) points.push({ timeS: left, value: Number.NaN })
    runs.forEach((segment, index) => {
      const indexes = [...new Set([segment.minIndex, segment.maxIndex])].sort((a, b) => a - b)
      for (const sampleIndex of indexes)
        points.push({ timeS: sampleIndex, value: stream[sampleIndex] ?? Number.NaN })
      if (index < runs.length - 1) {
        points.push({
          timeS: segment.last + Math.floor((runs[index + 1]!.first - segment.last) / 2),
          value: Number.NaN,
        })
      }
    })
    if (runs.at(-1)!.last < right - 1) points.push({ timeS: right - 1, value: Number.NaN })
  }
  return points.slice(0, limit)
}
