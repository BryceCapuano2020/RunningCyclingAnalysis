import { NO_HISTORY } from '@rca/core/history'
import type { BestEffort, History, YearBests } from '@rca/core/history'
import { METRES_PER_MILE } from '@rca/core/units'

/** A synthetic runner's mile, 5 km and 10 km: the 5 km has no year 2023, and the 10 km one year. */
export const RUN_BESTS: BestEffort[] = [
  {
    length: METRES_PER_MILE,
    years: [
      [2021, 400, true, false],
      [2022, 380, true, false],
      [2023, 390, false, false],
    ],
  },
  {
    length: 5000,
    years: [
      [2021, 1500, true, false],
      [2022, 1450, false, false],
      [2024, 1440, true, false],
    ],
  },
  { length: 10_000, years: [[2022, 3100, true, false]] },
]

/** A synthetic rider's 5 and 20 minute power over two years, the 20 minute best of the second not all-out. */
export const RIDE_BESTS: BestEffort[] = [
  {
    length: 300,
    years: [
      [2022, 300, true, false],
      [2023, 320, true, false],
    ],
  },
  {
    length: 1200,
    years: [
      [2022, 250, true, false],
      [2023, 265, false, false],
    ],
  },
]

export const BESTS: YearBests = { run: RUN_BESTS, ride: RIDE_BESTS }

export const historyWithBests = (): History => ({ ...NO_HISTORY, bests: BESTS })
