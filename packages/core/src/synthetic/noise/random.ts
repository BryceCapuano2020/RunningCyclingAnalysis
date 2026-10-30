import { normal } from '../../math'

/** Uniform draw in [lo, hi). */
export function between(rand: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rand()
}

/** Whole count from 0 to `max` inclusive. */
export function countUpTo(rand: () => number, max: number): number {
  return Math.floor(rand() * (max + 1))
}

/** Stationary AR(1) series with standard deviation `sd` and correlation time `corrS` samples. */
export function ar1(n: number, rand: () => number, sd: number, corrS: number): Float64Array {
  const out = new Float64Array(n)
  if (n === 0 || sd === 0) return out
  const rho = Math.exp(-1 / Math.max(corrS, 1e-9))
  const innovation = sd * Math.sqrt(1 - rho * rho)
  let x = sd * normal(rand)
  for (let i = 0; i < n; i++) {
    out[i] = x
    x = rho * x + innovation * normal(rand)
  }
  return out
}

/** Student t on 5 degrees of freedom, scaled to unit variance (the draw fitness/test/runSim.ts makes). */
export function studentT5(rand: () => number): number {
  const z = normal(rand)
  let chi = 0
  for (let i = 0; i < 5; i++) chi += normal(rand) ** 2
  return z / Math.sqrt(chi / 5) / Math.sqrt(5 / 3)
}

/** Smooth 1-D noise with one random value per `wavelength`, eased between them. */
export function valueNoise(rand: () => number, wavelength: number): (x: number) => number {
  const lattice: number[] = []
  const at = (k: number) => {
    while (lattice.length <= k) lattice.push(2 * rand() - 1)
    return lattice[k]!
  }
  return (x) => {
    const u = Math.max(0, x) / wavelength
    const k = Math.floor(u)
    const f = u - k
    const s = f * f * (3 - 2 * f)
    return at(k) * (1 - s) + at(k + 1) * s
  }
}
