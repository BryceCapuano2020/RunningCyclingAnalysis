import { describe, expect, it } from 'vitest'
import { seedLiftSets } from '../test/liftRows.ts'
import { stateWorld } from '../test/stateKit.ts'
import { readInputs } from './inputs.ts'

describe('the lift sets read for the results', () => {
  it('come back in key order across more than one page, none twice and none missed', async () => {
    const w = await stateWorld()
    // Past two pages at 5,000 rows each.
    await seedLiftSets(w.env.DB, w.userId, 10_003)
    const inputs = await readInputs(w.env.DB, w.userId)
    const sets = inputs!.liftSets
    expect(sets).toHaveLength(10_003)
    const keys = sets.map(
      (s) => `${s.date}|${s.exercise}|${s.equipment}|${String(s.setOrder).padStart(6, '0')}`,
    )
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual([...keys].sort())
    expect(inputs!.liftRevision).toBe(1)
  })
})
