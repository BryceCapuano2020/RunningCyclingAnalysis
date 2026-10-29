/** A rectangle on the chart, in px. */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Whether a box comes within pad px of any piece. A box that only touches a piece at pad 0 does not. */
export function meetsBoxes(box: Box, pieces: readonly Box[], pad: number): boolean {
  return pieces.some(
    (piece) =>
      piece.left - pad < box.right &&
      piece.right + pad > box.left &&
      piece.top - pad < box.bottom &&
      piece.bottom + pad > box.top,
  )
}
