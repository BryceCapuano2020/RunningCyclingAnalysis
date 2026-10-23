import { describe, expect, it } from 'vitest'
import { compareSports } from '../compare'
import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { flatSpeedToMetabolic, ridePowerToMetabolic, runMetabolicPower } from '../metabolic'
import type { CurvePoint } from '../types'

// Independent reference equations, not taken from the app. Each is ACSM's Guidelines form
// (see docs/validation/physiology.md for sources and verification status). ml/kg/min to W/kg
// uses the energy equivalent of O2 in J/ml, divided by 60 s/min.
const J_PER_ML_RER_1 = 20.9
const J_PER_ML_RER_082 = 20.1
const MASS_KG = 70
const SPEEDS_MS = [2.5, 3, 3.5, 4, 4.5, 5, 5.5]
const GRADES = [-0.05, 0, 0.05, 0.1]

/** ACSM running: VO2 = 0.2 S + 0.9 S G + 3.5, S in m/min, G a fraction. Gross W/kg. */
function acsmRunWkg(speedMs: number, grade: number, jPerMl: number): number {
  const s = speedMs * 60
  return ((0.2 * s + 0.9 * s * grade + 3.5) * jPerMl) / 60
}

/** ACSM leg cycling: VO2 = 1.8 W/mass (kg m/min) + 7, written as 7 + 10.8 W/kg. Gross W/kg. */
function acsmCycleWkg(powerWkg: number, jPerMl: number): number {
  return ((7 + 10.8 * powerWkg) * jPerMl) / 60
}

function point(durationS: number, value: number): CurvePoint {
  return { durationS, value, activityId: null, startIndex: -1 }
}

/** Justified tolerances, relative to ACSM at 20.9 J/ml. See the doc for each derivation. */
const RUN_TOL = 0.15 // Minetti slope 3.6 J/kg/m vs ACSM 0.2 ml/kg/m = 4.18 J/kg/m: about 13%
const RUN_STEEP_UP_TOL = 0.05 // +10%: Minetti and ACSM agree to about 1.5%
const CYCLE_TOL = 0.15 // 2 to 5 W/kg: the energy-equivalent band spans about 4%, and the rest is model gap
const CYCLE_LOW_TOL = 0.3 // 1 W/kg: the app's cycling side has no resting term, so it reads about 25% low

describe('resting term', () => {
  it('matches ACSM 3.5 ml/kg/min at 20.9 J/ml within 1%', () => {
    const acsm = acsmRunWkg(0, 0, J_PER_ML_RER_1)
    expect(Math.abs(RESTING_W_PER_KG / acsm - 1)).toBeLessThan(0.01)
  })
})

describe('flat running against ACSM', () => {
  it('pins the flat running gap within the running tolerance at 2.5 to 5.5 m/s (known discrepancy, see physiology.md)', () => {
    for (const v of SPEEDS_MS) {
      const app = flatSpeedToMetabolic(v)
      for (const j of [J_PER_ML_RER_1, J_PER_ML_RER_082]) {
        const rel = app / acsmRunWkg(v, 0, j) - 1
        expect(Math.abs(rel), `${v} m/s at ${j} J/ml`).toBeLessThanOrEqual(RUN_TOL)
      }
    }
  })

  it('implies a running economy scale inside the app prior (0.82 to 1.18)', () => {
    // The ACSM-implied scale is about 1.16. It sits in the prior's upper tail, not its centre.
    for (const v of [3, 4, 5]) {
      const appSlope = flatSpeedToMetabolic(v) - RESTING_W_PER_KG
      const refSlope = acsmRunWkg(v, 0, J_PER_ML_RER_1) - RESTING_W_PER_KG
      const scale = refSlope / appSlope
      expect(scale, `${v} m/s`).toBeGreaterThanOrEqual(PRIORS.runEconomyScale.min)
      expect(scale, `${v} m/s`).toBeLessThanOrEqual(PRIORS.runEconomyScale.max)
    }
  })
})

describe('graded running against ACSM', () => {
  for (const grade of GRADES) {
    // Only +10% agrees with ACSM (to 1.5%). The other grades pin a gap, as physiology.md §4.2 shows.
    const name =
      grade === 0.1
        ? 'agrees at 10% grade'
        : `pins the gap at ${grade * 100}% grade (known discrepancy, see physiology.md)`
    it(name, () => {
      const tol = grade === 0.1 ? RUN_STEEP_UP_TOL : RUN_TOL
      const speeds = Float64Array.from(SPEEDS_MS)
      const grades = new Float64Array(speeds.length).fill(grade)
      const app = runMetabolicPower(speeds, grades)
      SPEEDS_MS.forEach((v, i) => {
        const rel = app[i]! / acsmRunWkg(v, grade, J_PER_ML_RER_1) - 1
        expect(Math.abs(rel), `${v} m/s`).toBeLessThanOrEqual(tol)
      })
    })
  }
})

describe('cycling against ACSM', () => {
  it('pins the cycling gap within the cycling tolerance at 2 to 5 W/kg (known discrepancy, see physiology.md)', () => {
    for (const p of [2, 3, 4, 5]) {
      const app = ridePowerToMetabolic(p * MASS_KG, MASS_KG, PRIORS.grossEfficiency.mean)
      for (const j of [J_PER_ML_RER_1, J_PER_ML_RER_082]) {
        const rel = app / acsmCycleWkg(p, j) - 1
        expect(Math.abs(rel), `${p} W/kg at ${j} J/ml`).toBeLessThanOrEqual(CYCLE_TOL)
      }
    }
  })

  it('reads low at 1 W/kg, the known gap from omitting resting energy', () => {
    const app = ridePowerToMetabolic(MASS_KG, MASS_KG, PRIORS.grossEfficiency.mean)
    const rel = app / acsmCycleWkg(1, J_PER_ML_RER_1) - 1
    expect(Math.abs(rel)).toBeLessThanOrEqual(CYCLE_LOW_TOL)
  })
})

describe('matched-effort running to cycling ratio', () => {
  // Matched effort: the cycling power that ACSM says costs the same gross W/kg as running at v.
  // The reference ratio is therefore 1 by construction. The app's 90% prior range (p05 to p95)
  // currently excludes 1 at 3 to 5 m/s. This pins that disagreement so a model change shows up.
  for (const v of [3, 4, 5]) {
    it(`pins the app ratio at ${v} m/s, which sits below the reference 1`, () => {
      const refRun = acsmRunWkg(v, 0, J_PER_ML_RER_1)
      const matchedWkg = ((refRun * 60) / J_PER_ML_RER_1 - 7) / 10.8
      const c = compareSports(
        [point(1200, flatSpeedToMetabolic(v))],
        [point(1200, matchedWkg * MASS_KG)],
        MASS_KG,
        null,
      )
      const ratio = c.prior[0]!.ratio
      expect(ratio.p50).toBeGreaterThanOrEqual(0.75)
      expect(ratio.p50).toBeLessThanOrEqual(0.9)
      expect(ratio.p95).toBeLessThan(1)
    })
  }
})
