export interface BrushRange {
  startS: number
  endS: number
}

export type Part = 'start' | 'end' | 'move' | 'new'

export interface Drag {
  part: Part
  /** The second under the pointer when it went down. */
  anchorS: number
  origin: BrushRange
  x: number
  moved: boolean
}

export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value))

/**
 * The range under a drag. An end never passes the other, a pan keeps its length, and a new brush runs from
 * where it began to where the pointer is. Each is at least one second.
 */
export function draggedRange(
  part: Part,
  origin: BrushRange,
  anchorS: number,
  secondS: number,
  max: number,
): BrushRange {
  const at = Math.round(secondS)
  if (part === 'start') return { startS: clamp(at, 0, origin.endS - 1), endS: origin.endS }
  if (part === 'end') return { startS: origin.startS, endS: clamp(at, origin.startS + 1, max) }
  if (part === 'move') {
    const length = origin.endS - origin.startS
    const startS = clamp(Math.round(origin.startS + secondS - anchorS), 0, max - length)
    return { startS, endS: startS + length }
  }
  const [from, to] = [clamp(anchorS, 0, max), clamp(at, 0, max)].sort((a, b) => a - b)
  const startS = Math.min(from!, max - 1)
  return { startS, endS: Math.max(to!, startS + 1) }
}
