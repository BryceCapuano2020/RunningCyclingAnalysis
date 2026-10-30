import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '../constants'
import { fitCriticalPowerUnchecked } from '../cp'
import { combine } from '../digest/combine'
import { criticalPowerOutcome, wPrimeFloor } from '../cp'
import { digestActivity } from '../digest/digestActivity'
import { parseActivityFile } from '../import'
import { corpusReader } from './helpers'

const { bytes } = corpusReader(new URL('../../test-corpus/fitparse/', import.meta.url))

/** The analysis of one corpus file, at the given body mass. */
function analyse(name: string, massKg: number) {
  const parsed = parseActivityFile(bytes(name), name)
  if (!parsed.ok) throw new Error(parsed.reason)
  return combine(
    parsed.activities.map((activity) => digestActivity(activity)),
    {
      massKg,
      bikeMassKg: 9,
    },
  )
}

describe('critical-power refusals on real files', () => {
  it('keeps the threshold of Edge 810 at 60, 75 and 90 kg: its 9.75 kJ is far above the floor', () => {
    for (const massKg of [60, 75, 90]) {
      const result = analyse('Edge810-Vector-2013-08-16-15-35-10.fit', massKg)
      expect(result.rideCp, `${massKg} kg`).not.toBeNull()
      expect(result.rideCpRefusal, `${massKg} kg`).toBeNull()
    }
  })

  it('keeps the thresholds of the two real runs with the least work capacity, 8.0 and 7.1 kJ', () => {
    for (const name of ['developer-types-sample.fit', 'sample_mulitple_header.fit']) {
      const result = analyse(name, 75)
      // The fit's own rules keep it; whether the run was hard enough to report it is the effort gate's, tested apart.
      const outcome = criticalPowerOutcome(result.runCurve, { minWPrime: wPrimeFloor('run', 75) })
      expect(outcome.fit, name).not.toBeNull()
      expect(outcome.refusal, name).toBeNull()
    }
  })

  it('refuses the threshold of a run whose efforts stop at 7 minutes (2013-02-06-12-11-14.fit)', () => {
    const name = '2013-02-06-12-11-14.fit'
    const parsed = parseActivityFile(bytes(name), name)
    if (!parsed.ok) throw new Error(parsed.reason)
    const result = combine(
      parsed.activities.map((activity) => digestActivity(activity)),
      {
        massKg: 75,
        bikeMassKg: 9,
      },
    )
    expect(result.runCp).toBeNull()
    expect(result.runCpRefusal).toBe('missing')
  })
})

describe('how well the two-parameter curve describes real efforts (leave one out)', () => {
  /**
   * The fit of each corpus file's best curve with each effort left out in turn: the jackknife standard error of the
   * threshold, against the regression standard error the fit gives. Aggregates only; the files are public samples
   * of single sessions, so this measures how well a real curve is described by critical power and work capacity,
   * not whether its efforts were maximal (that is the effort gate's, and its allowance is calibrated on the synthetic harness).
   */
  function ratios(): number[] {
    const dir = new URL('../../test-corpus/fitparse/', import.meta.url)
    const out: number[] = []
    for (const name of readdirSync(fileURLToPath(dir)).filter((entry) => entry.endsWith('.fit'))) {
      const parsed = parseActivityFile(bytes(name), name)
      if (!parsed.ok) continue
      const result = combine(
        parsed.activities.map((activity) => digestActivity(activity)),
        { massKg: 75, bikeMassKg: 9 },
      )
      for (const curve of [result.runCurve, result.rideMetabolicCurve]) {
        const points = curve.filter(
          (p) =>
            p.durationS >= CP_FIT_MIN_S && p.durationS <= CP_FIT_MAX_S && Number.isFinite(p.value),
        )
        const fit = points.length < 5 ? null : fitCriticalPowerUnchecked(points)
        if (fit === null) continue
        const without = points.map((_, i) =>
          fitCriticalPowerUnchecked(points.filter((_, j) => j !== i)),
        )
        if (without.some((left) => left === null)) continue
        const cps = without.map((left) => left!.cp)
        const mean = cps.reduce((a, b) => a + b, 0) / cps.length
        const jackknife = Math.sqrt(
          ((cps.length - 1) / cps.length) * cps.reduce((sum, cp) => sum + (cp - mean) ** 2, 0),
        )
        out.push(jackknife / fit.cpSe)
      }
    }
    return out.sort((a, b) => a - b)
  }

  it('finds the jackknife error close to the regression error on the corpus curves: the curve is not what the floor is for', () => {
    const found = ratios()
    // Recorded: 9 curves, the jackknife error 0.7 to 1.4 times the regression error, median about 1.2. The files are single
    // sessions, so the floor on the fit spread comes from the efforts (the harness), not from this.
    expect(found.length).toBeGreaterThanOrEqual(8)
    expect(found[0]!).toBeGreaterThan(0.5)
    expect(found.at(-1)!).toBeLessThan(2.5)
    expect(found[found.length >> 1]!).toBeGreaterThan(1)
    expect(found[found.length >> 1]!).toBeLessThan(1.6)
  })
})
