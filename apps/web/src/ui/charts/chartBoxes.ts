/** A label's box reaches an em above its baseline and a quarter em below, as its ink does. */
export const ASCENT_EM = 1
export const DESCENT_EM = 0.25

/** A rectangle on the chart, in px. */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}
