/** The tints above none: a cell with training is one of these five, by its hours a week. */
export const RAMP_STEPS = 5

/** Clean step widths, hours a week, so each edge of the key is a number an athlete would say. */
const STEP_HOURS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20]
/** Past the list a step is a multiple of this. */
const BEYOND_STEP = 5
/** The share of trained cells that the darkest tint begins above: one huge week does not wash the rest out. */
const TOP_QUANTILE = 0.9
const EDGE = 1e-9

export interface CalendarRamp {
  /** Where one tint ends and the next begins, hours a week, lowest first: four edges for five tints. */
  edges: number[]
  /** 0 for no training, else 1 to RAMP_STEPS: the tint of a cell of this many hours a week. */
  stepOf: (rate: number) => number
}

/**
 * The ramp for a set of cells' hours a week: five steps of one clean width, the first up to that width and the last
 * above four of them. The width is the smallest whose five steps reach the 90th percentile of the weeks with training.
 */
export function rampOf(rates: readonly number[]): CalendarRamp {
  const trained = rates.filter((rate) => rate > 0).sort((a, b) => a - b)
  const high = trained[Math.max(0, Math.ceil(trained.length * TOP_QUANTILE) - 1)] ?? 0
  const width =
    STEP_HOURS.find((clean) => clean * RAMP_STEPS >= high) ??
    Math.ceil(high / RAMP_STEPS / BEYOND_STEP) * BEYOND_STEP
  return {
    edges: Array.from({ length: RAMP_STEPS - 1 }, (_, i) => (i + 1) * width),
    // The small allowance keeps a cell exactly on an edge in the lower tint, as the key says: "up to".
    stepOf: (rate) =>
      rate > 0 ? Math.max(1, Math.min(RAMP_STEPS, Math.ceil(rate / width - EDGE))) : 0,
  }
}
