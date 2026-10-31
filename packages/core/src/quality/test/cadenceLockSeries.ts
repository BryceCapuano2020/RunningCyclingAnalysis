import { mulberry32, normal } from '../../math'

/**
 * Seeded heart-rate and cadence series for the cadence-lock tests and its sim. Quantised as the files are: a
 * run's cadence is strides doubled, so only even steps a minute; heart rate is whole bpm; a ride's cadence is
 * whole rpm. No real data.
 */

export interface Series {
  heartRate: Float64Array
  cadence: Float32Array
}

export interface SeriesSpec {
  n: number
  /** Where the heart rate hovers, bpm. */
  hr: number
  /** Where the cadence hovers: steps a minute for a run, rpm for a ride. */
  cadence: number
  /** Half-width of the cadence jitter, in the cadence's unit. */
  jitter: number
  /** Doubled strides (even steps only) when true. */
  even: boolean
}

export const RUN_SERIES = { even: true, jitter: 3 } as const
export const RIDE_SERIES = { even: false, jitter: 2 } as const

/** An honest athlete: heart rate an AR(1) around its centre (smooth, lagging), cadence jittering around its own. */
export function honestSeries(spec: SeriesSpec, seed: number): Series {
  const rand = mulberry32(seed)
  const heartRate = new Float64Array(spec.n)
  const cadence = new Float32Array(spec.n)
  let drift = 0
  for (let i = 0; i < spec.n; i++) {
    drift = 0.97 * drift + 0.8 * normal(rand)
    heartRate[i] = Math.round(spec.hr + drift)
    const raw = spec.cadence + (rand() * 2 - 1) * spec.jitter
    cadence[i] = spec.even ? 2 * Math.round(raw / 2) : Math.round(raw)
  }
  return { heartRate, cadence }
}

/** Makes the heart rate repeat the cadence over [start, start + length), plus `noise` whole bpm either way. */
export function plantLock(
  series: Series,
  start: number,
  length: number,
  seed: number,
  noise = 0,
): void {
  const rand = mulberry32(seed)
  const end = Math.min(series.heartRate.length, start + length)
  for (let i = start; i < end; i++) {
    series.heartRate[i] = series.cadence[i]! + Math.round((rand() * 2 - 1) * noise)
  }
}
