import { describe, expect, it } from 'vitest'
import { compareSports } from '../compare'
import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { flatSpeedToMetabolic, ridePowerToMetabolic, runMetabolicPower } from '../metabolic'
import type { CurvePoint } from '../types'

// Independent reference equations, not taken from the app: ACSM's Guidelines running and cycling
// forms, and Léger & Mercier's treadmill regression (see docs/validation/physiology.md for sources
// and verification status). ml/kg/min to W/kg uses the energy equivalent of O2 in J/ml, / 60 s/min.
const J_PER_ML_RER_1 = 20.9
const J_PER_ML_RER_082 = 20.1
const MASS_KG = 70
const FLAT_SPEEDS_MS = [3, 3.5, 4, 4.5, 5]
const GRADED_SPEEDS_MS = [2.5, 3, 3.5, 4, 4.5, 5, 5.5]

/** ACSM running: VO2 = 0.2 S + 0.9 S G + 3.5, S in m/min, G a fraction. Gross W/kg. */
function acsmRunWkg(speedMs: number, grade: number, jPerMl: number): number {
  const s = speedMs * 60
  return ((0.2 * s + 0.9 * s * grade + 3.5) * jPerMl) / 60
}

/** Léger & Mercier 1984: VO2 = 2.209 + 3.163 v, v in km/h, on the flat. Gross W/kg. */
function legerMercierRunWkg(speedMs: number, jPerMl: number): number {
  return ((2.209 + 3.163 * speedMs * 3.6) * jPerMl) / 60
}

/** ACSM leg cycling: VO2 = 1.8 W/mass (kg m/min) + 7, written as 7 + 10.8 W/kg. Gross W/kg. */
function acsmCycleWkg(powerWkg: number, jPerMl: number): number {
  return ((7 + 10.8 * powerWkg) * jPerMl) / 60
}

function point(durationS: number, value: number): CurvePoint {
  return { durationS, value, activityId: null, startIndex: -1 }
}

// Tolerances. Each is the bound in docs/research/headline-bias.md §7 where the model meets it.
// Where it does not, the bound is the observed span and the reason is given beside it. None is a
// claim of agreement beyond what is stated.
/** Flat running against ACSM: the research note's ±10%. */
const RUN_TOL = 0.1
/** Flat running against Léger & Mercier: the research note's ±5%. The model is +0.6 to +2.0%. */
const LM_TOL = 0.05
/**
 * +10% grade against ACSM. The research gives no bound. The model is +3.2%. A uniform scale would
 * give +6.3%, which is why the level correction is additive.
 */
const RUN_STEEP_UP_TOL = 0.05
/**
 * Cycling against ACSM at 2 to 5 W/kg. The research note asks for 5%, but constant efficiency reads
 * −6.6% at 2 W/kg and +9.4% at 5 W/kg (physiology.md §4.3). 15% bounds that known gap; it is not
 * agreement.
 */
const CYCLE_TOL = 0.15
/** 1 W/kg: no resting term on the cycling side, so it reads about 25% low (physiology.md §8.2). */
const CYCLE_LOW_TOL = 0.3

describe('resting term', () => {
  it('matches ACSM 3.5 ml/kg/min at 20.9 J/ml within 1%', () => {
    const acsm = acsmRunWkg(0, 0, J_PER_ML_RER_1)
    expect(Math.abs(RESTING_W_PER_KG / acsm - 1)).toBeLessThan(0.01)
  })
})

describe('flat running against ACSM and Léger & Mercier', () => {
  it('agrees with ACSM within 10% at 3 to 5 m/s, at both energy equivalents', () => {
    for (const v of FLAT_SPEEDS_MS) {
      const app = flatSpeedToMetabolic(v)
      for (const j of [J_PER_ML_RER_1, J_PER_ML_RER_082]) {
        const rel = app / acsmRunWkg(v, 0, j) - 1
        expect(Math.abs(rel), `${v} m/s at ${j} J/ml`).toBeLessThanOrEqual(RUN_TOL)
      }
    }
  })

  it('agrees with Léger & Mercier within 5% at 3 to 5 m/s', () => {
    for (const v of FLAT_SPEEDS_MS) {
      const rel = flatSpeedToMetabolic(v) / legerMercierRunWkg(v, J_PER_ML_RER_1) - 1
      expect(Math.abs(rel), `${v} m/s`).toBeLessThanOrEqual(LM_TOL)
    }
  })

  it('keeps the documented residual: 4 to 10% below ACSM, not zero', () => {
    // The app's flat cost is 3.9 J/kg/m. ACSM's 0.2 ml/kg/m slope is 4.18, so a residual remains:
    // one level correction cannot match ACSM and Léger & Mercier (3.97) together. See
    // physiology.md §4.1 and §6.1.
    for (const v of FLAT_SPEEDS_MS) {
      const rel = flatSpeedToMetabolic(v) / acsmRunWkg(v, 0, J_PER_ML_RER_1) - 1
      expect(rel, `${v} m/s`).toBeLessThan(-0.04)
      expect(rel, `${v} m/s`).toBeGreaterThan(-0.1)
    }
  })

  it('implies a running economy scale inside the app prior', () => {
    // The ACSM-implied scale is about 1.07 against the 3.9 J/kg/m flat cost, inside the prior.
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
  // The research gives no graded bound, so the flat tolerance applies. Only −5% is a downhill point
  // with a reference. −10% and −20% are unvalidated (physiology.md §10.6).
  for (const grade of [-0.05, 0, 0.05]) {
    it(`agrees within 10% at ${grade * 100}% grade`, () => {
      const speeds = Float64Array.from(GRADED_SPEEDS_MS)
      const grades = new Float64Array(speeds.length).fill(grade)
      const app = runMetabolicPower(speeds, grades)
      GRADED_SPEEDS_MS.forEach((v, i) => {
        const rel = app[i]! / acsmRunWkg(v, grade, J_PER_ML_RER_1) - 1
        expect(Math.abs(rel), `${v} m/s`).toBeLessThanOrEqual(RUN_TOL)
      })
    })
  }

  it('agrees within 5% at 10% grade', () => {
    const speeds = Float64Array.from(GRADED_SPEEDS_MS)
    const grades = new Float64Array(speeds.length).fill(0.1)
    const app = runMetabolicPower(speeds, grades)
    GRADED_SPEEDS_MS.forEach((v, i) => {
      const rel = app[i]! / acsmRunWkg(v, 0.1, J_PER_ML_RER_1) - 1
      expect(Math.abs(rel), `${v} m/s`).toBeLessThanOrEqual(RUN_STEEP_UP_TOL)
    })
  })
})

describe('cycling against ACSM', () => {
  it('stays within 15% of ACSM at 2 to 5 W/kg, at both energy equivalents', () => {
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
  // The reference ratio is therefore 1 by construction. The app's 90% prior range is p05 to p95.
  const matchedRatio = (v: number) => {
    const matchedWkg = ((acsmRunWkg(v, 0, J_PER_ML_RER_1) * 60) / J_PER_ML_RER_1 - 7) / 10.8
    const c = compareSports(
      [point(1200, flatSpeedToMetabolic(v))],
      [point(1200, matchedWkg * MASS_KG)],
      MASS_KG,
      null,
    )
    return c.prior[0]!.ratio
  }

  for (const v of [3, 4]) {
    it(`contains the reference 1 inside the 90% range at ${v} m/s`, () => {
      const ratio = matchedRatio(v)
      expect(ratio.p05).toBeLessThanOrEqual(1)
      expect(ratio.p95).toBeGreaterThanOrEqual(1)
    })
  }

  it('documents the gap at 5 m/s: the 90% range stops just short of 1', () => {
    // Constant gross efficiency reads cycling about 10% high at 5 W/kg (physiology.md §4.3), so the
    // matched cycling cost is too high and the range sits just below 1. The power-dependent
    // efficiency slope in headline-bias.md §5(b) would close it. It is not implemented, so this
    // asserts the gap. Revisit this test when that slope lands.
    const { p95 } = matchedRatio(5)
    expect(p95).toBeGreaterThan(0.95)
    expect(p95).toBeLessThan(1)
  })

  it('pins the median residual at 0.80 to 0.95 for 3 to 5 m/s', () => {
    // This is a pin on the current residual, not an agreement test. It fails when the median moves
    // out of this band, so revisit it with any change to the running level or cycling efficiency.
    for (const v of [3, 4, 5]) {
      const { p50 } = matchedRatio(v)
      expect(p50, `${v} m/s`).toBeGreaterThanOrEqual(0.8)
      expect(p50, `${v} m/s`).toBeLessThanOrEqual(0.95)
    }
  })
})
