import { NO_HISTORY } from '@rca/core/history'
import type {
  BestEffort,
  History,
  SportYearCurves,
  YearBests,
  YearCurve,
  YearCurves,
} from '@rca/core/history'
import { METRES_PER_MILE } from '@rca/core/units'

/** A synthetic runner's mile, 5 km and 10 km: the 5 km has no year 2023, and the 10 km one year. */
export const RUN_BESTS: BestEffort[] = [
  {
    length: METRES_PER_MILE,
    years: [
      [2021, 400, true],
      [2022, 380, true],
      [2023, 390, false],
    ],
  },
  {
    length: 5000,
    years: [
      [2021, 1500, true],
      [2022, 1450, false],
      [2024, 1440, true],
    ],
  },
  { length: 10_000, years: [[2022, 3100, true]] },
]

/** A synthetic rider's 5 and 20 minute power over two years, the 20 minute best of the second not confirmed hard. */
export const RIDE_BESTS: BestEffort[] = [
  {
    length: 300,
    years: [
      [2022, 300, true],
      [2023, 320, true],
    ],
  },
  {
    length: 1200,
    years: [
      [2022, 250, true],
      [2023, 265, false],
    ],
  },
]

export const BESTS: YearBests = { run: RUN_BESTS, ride: RIDE_BESTS }

const DURATIONS = [180, 300, 1200, 3600]

const curve = (year: number, values: (number | null)[], hard = true): YearCurve => ({
  year,
  values,
  hard,
})

/** A synthetic runner's flat speed (m/s) at 3, 5, 20 and 60 minutes in four years: the best is the second year. */
export const RUN_CURVES: SportYearCurves = {
  durations: DURATIONS,
  years: [
    curve(2020, [4.4, 4.2, 3.8, 3.4]),
    curve(2021, [4.8, 4.6, 4.2, 3.7]),
    curve(2022, [4.6, 4.4, 4.0, null]),
    curve(2023, [4.5, 4.3, 3.9, 3.5], false),
  ],
}

/** A synthetic rider's watts over the same durations in three years: the newest is the best. */
export const RIDE_CURVES: SportYearCurves = {
  durations: [60, 300, 1200, 3600],
  years: [
    curve(2021, [600, 330, 260, 220]),
    curve(2022, [620, 340, 270, 225]),
    curve(2023, [640, 360, 290, 240]),
  ],
}

export const CURVES: YearCurves = { run: RUN_CURVES, ride: RIDE_CURVES }

export const historyWithBests = (): History => ({ ...NO_HISTORY, bests: BESTS, yearCurves: CURVES })
