import { normal } from '../../math'
import type { SyntheticAthlete } from '../athlete'
import type { LevelNoise } from './types'

const WEEKS_PER_YEAR = 52
const SEASON_PHASE_WEEKS = 10
const HEAT_WEEKS = 3
const HEAT_PER_YEAR = 1.5

/**
 * The athlete's log level for each week: wander (AR(1)), season, heat blocks and a strap step. The
 * draws come in the order fitness/test/runSim.ts makes them (wander, heat, strap), so a sim that
 * adopts this has the same values for the same seed.
 */
export function weeklyLevel(level: LevelNoise, weeks: number, random: () => number): Float64Array {
  const out = new Float64Array(weeks)
  const rho = level.wanderRho
  let a = 0
  for (let w = 0; w < weeks; w++) {
    a = rho * a + Math.sqrt(1 - rho * rho) * normal(random)
    out[w] = level.wanderSd * a
  }
  const heat = new Set<number>()
  if (level.heatDrop) {
    for (let i = 0; i < Math.ceil((weeks / WEEKS_PER_YEAR) * HEAT_PER_YEAR); i++) {
      const w0 = Math.floor(random() * (weeks - HEAT_WEEKS))
      for (let k = 0; k < HEAT_WEEKS; k++) heat.add(w0 + k)
    }
  }
  const strapAt = level.strapStep ? Math.floor(weeks * (0.3 + 0.4 * random())) : -1
  const strapSign = random() < 0.5 ? -1 : 1
  for (let w = 0; w < weeks; w++) {
    if (level.seasonAmp) {
      out[w]! +=
        level.seasonAmp * Math.sin((2 * Math.PI * (w + SEASON_PHASE_WEEKS)) / WEEKS_PER_YEAR)
    }
    if (heat.has(w)) out[w]! -= level.heatDrop
    if (strapAt >= 0 && w >= strapAt) out[w]! += strapSign * level.strapStep
  }
  return out
}

/**
 * The athlete at a log level: running economy and riding efficiency scale together, so pace at a
 * given heart rate and power at a given heart rate both move by `exp(offset)`.
 */
export function athleteAtLevel(athlete: SyntheticAthlete, offset: number): SyntheticAthlete {
  return {
    ...athlete,
    runEconomyScale: athlete.runEconomyScale * Math.exp(-offset),
    grossEfficiency: athlete.grossEfficiency * Math.exp(offset),
  }
}
