import { DAY_MS } from '../../constants'
import { withBlocks } from '../../digest/test/sameHeartRateFixture'
import { mulberry32, normal } from '../../math'
import type { ActivityDigest, DigestSplit } from '../../types'

/** One whole kilometre: 5:00, flat, at 150 bpm unless told otherwise. `grade` is the credit (log of clock over grade-adjusted time). */
export function km(over: Partial<DigestSplit> & { grade?: number } = {}): DigestSplit {
  const { grade = 0, ...rest } = over
  const seconds = rest.seconds ?? 300
  return {
    distanceM: 1000,
    seconds,
    gradeAdjustedSeconds: seconds / Math.exp(grade),
    elevationGainM: 2,
    avgHeartRate: 150,
    ...rest,
  }
}

export interface RunSpec {
  id: string
  startMs: number
  km: DigestSplit[]
  over?: Partial<ActivityDigest>
}

/** A run digest with the given kilometre splits. */
export function runDigest({ id, startMs, km: splits, over }: RunSpec): ActivityDigest {
  return withBlocks('run', id, startMs, [], {
    hasHeartRate: true,
    indoor: false,
    flagCounts: {},
    splits: { km: splits, mile: [] },
    ...over,
  })
}

/** Monday 4 January 2021, midday UTC. */
export const START = Date.UTC(2021, 0, 4, 12)

/**
 * `runs` runs of `kms` kilometres, `perWeek` a week from START, each at its own pace and heart rate from
 * a seeded draw: pace within 1.5% of 5:00 and heart rate within 140 to 160, with `hilly` adding grade
 * credit that moves the clock pace by `passThrough` of itself, as a real hilly library does.
 */
export function steadyLibrary(
  runs: number,
  options: {
    perWeek?: number
    kms?: number
    hilly?: boolean
    passThrough?: number
    seed?: number
  } = {},
): ActivityDigest[] {
  const { perWeek = 3, kms = 8, hilly = false, passThrough = 0.3, seed = 1 } = options
  const random = mulberry32(seed)
  return Array.from({ length: runs }, (_, i) => {
    const week = Math.floor(i / perWeek)
    const splits = Array.from({ length: kms }, () => {
      const hr = 140 + 20 * random()
      const grade = hilly ? 0.12 * (random() - 0.5) : 0.001 * normal(random)
      // clock speed moves by -passThrough of the credit (a climb, positive credit, slows the clock)
      const lnClock =
        Math.log(1000 / 300) + 0.004 * (hr - 150) - passThrough * grade + 0.01 * normal(random)
      return km({
        seconds: 1000 / Math.exp(lnClock),
        avgHeartRate: Math.round(hr * 10) / 10,
        grade,
      })
    })
    return runDigest({
      id: `r${i}`,
      startMs: START + (week * 7 + (i % perWeek) * 2) * DAY_MS,
      km: splits,
    })
  })
}
