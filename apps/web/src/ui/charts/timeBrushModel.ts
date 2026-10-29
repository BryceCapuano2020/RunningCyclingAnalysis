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
  // An end moves by how far the pointer has moved since it took hold, not to where the pointer is: a handle
  // grabbed off its centre does not jump.
  const moved = secondS - anchorS
  if (part === 'start') {
    return {
      startS: clamp(Math.round(origin.startS + moved), 0, origin.endS - 1),
      endS: origin.endS,
    }
  }
  if (part === 'end') {
    return {
      startS: origin.startS,
      endS: clamp(Math.round(origin.endS + moved), origin.startS + 1, max),
    }
  }
  if (part === 'move') {
    const length = origin.endS - origin.startS
    const startS = clamp(Math.round(origin.startS + secondS - anchorS), 0, max - length)
    return { startS, endS: startS + length }
  }
  const [from, to] = [clamp(Math.round(anchorS), 0, max), clamp(at, 0, max)].sort((a, b) => a - b)
  const startS = Math.min(from!, max - 1)
  return { startS, endS: Math.max(to!, startS + 1) }
}

/** A handle's hit area, in px: a finger's. */
export const HANDLE_HIT_PX = 44

/**
 * Where each handle's hit area sits against its edge. Apart by a finger's width or more they are centred on
 * their edges; closer than that they slide outward, the start's to the left and the end's to the right, just
 * far enough that the two areas never overlap, and at no gap only touch. Both stay grabbable for a short window in a long activity, where the grips themselves are
 * nearly one.
 */
export function handleOffsets(gapPx: number): { start: number; end: number } {
  const slide = Math.min(HANDLE_HIT_PX / 2, Math.max(0, (HANDLE_HIT_PX - gapPx) / 2))
  return { start: 0 - slide, end: slide }
}
