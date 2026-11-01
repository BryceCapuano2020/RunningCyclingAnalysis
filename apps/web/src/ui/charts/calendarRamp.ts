/** The steps of the ramp above none: a cell with training is one of these five tints, by its hours a week. */
export const RAMP_STEPS = 5

/** Clean ceilings, hours a week, so the legend's top end is a number an athlete would say. */
const CEILINGS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100]
/** The share of trained cells that the darkest tint begins below: past it every cell is the darkest, so one huge week does not wash the rest out. */
const CEILING_QUANTILE = 0.9

const EDGE = 1e-9

export interface CalendarRamp {
  /** Hours a week at which the darkest tint begins: the legend's top end. */
  ceiling: number
  /** 0 for no training, else 1 to RAMP_STEPS: the tint of a cell of this many hours a week. */
  stepOf: (rate: number) => number
}

/** The ramp for a set of cells' hours a week: five equal steps up to a clean ceiling near the 90th percentile. */
export function rampOf(rates: readonly number[]): CalendarRamp {
  const trained = rates.filter((rate) => rate > 0).sort((a, b) => a - b)
  const high = trained[Math.max(0, Math.ceil(trained.length * CEILING_QUANTILE) - 1)] ?? 0
  const ceiling = CEILINGS.find((clean) => clean >= high) ?? Math.ceil(high / 10) * 10
  return {
    ceiling,
    // The small allowance keeps a cell exactly on a step's edge (a rate of 4 on a ceiling of 5) in the lower step.
    stepOf: (rate) =>
      rate > 0
        ? Math.max(1, Math.min(RAMP_STEPS, Math.ceil((rate / ceiling) * RAMP_STEPS - EDGE)))
        : 0,
  }
}
