import { describe, expect, it } from 'vitest'
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
