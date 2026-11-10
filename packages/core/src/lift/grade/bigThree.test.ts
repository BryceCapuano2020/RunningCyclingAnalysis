import { describe, expect, it } from 'vitest'
import type { LiftEstimate } from '../estimate'
import { bigThreeTotal } from './bigThree'

/** Only the point is read; the rest of an estimate is not. */
const at = (point: number) => ({ point }) as LiftEstimate
const entry = (lift: 'squat' | 'bench' | 'deadlift', point: number) => ({
  lift,
  estimate: at(point),
})

describe('bigThreeTotal', () => {
  it('sums the three, parts in the order squat, bench, deadlift', () => {
    const out = bigThreeTotal([entry('deadlift', 140), entry('squat', 100), entry('bench', 70.5)])
    expect(out).toMatchObject({ kind: 'total', kg: 310.5 })
    expect(out.parts.map((part) => part.lift)).toEqual(['squat', 'bench', 'deadlift'])
  })

  it('is the heaviest one, with every part that exists, when one or two have an estimate', () => {
    expect(bigThreeTotal([entry('bench', 70)])).toMatchObject({
      kind: 'best',
      lift: 'bench',
      kg: 70,
    })
    const two = bigThreeTotal([entry('squat', 100), entry('bench', 70)])
    expect(two).toMatchObject({ kind: 'best', lift: 'squat', kg: 100 })
    expect(two.parts).toHaveLength(2)
  })

  it('has nothing for no lift', () => {
    expect(bigThreeTotal([])).toEqual({ kind: 'none', parts: [] })
  })

  it('keeps the heaviest estimate where a lift has two', () => {
    const out = bigThreeTotal([entry('deadlift', 120), entry('deadlift', 160)])
    expect(out).toMatchObject({ kind: 'best', lift: 'deadlift', kg: 160 })
    expect(out.parts).toHaveLength(1)
  })
})
