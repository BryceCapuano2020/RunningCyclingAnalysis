import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { fastestMs } from '../test/timing'
import { comparatorOrder, indexOrder } from './indexOrder'

/**
 * A combine orders its 4,000 prior draws 26 times. The radix order takes about a quarter of the time of
 * the comparison it replaces, and the comparison is timed here beside it, so the check holds on any
 * runner: the radix order must take under two thirds of the comparison's time.
 */
const DRAWS = 4000
const MAX_SHARE = 2 / 3

describe('index order performance', () => {
  const random = mulberry32(11)
  const values = Float64Array.from({ length: DRAWS }, () => 50 + random() * 250)

  it(`orders ${DRAWS} draws in under ${Math.round(MAX_SHARE * 100)}% of the comparison's time`, () => {
    let order: number[] = []
    const radix = fastestMs(() => {
      order = indexOrder(values, DRAWS, false)
    }, 30)
    const comparison = fastestMs(() => {
      order = comparatorOrder(values, DRAWS, false)
    }, 30)
    // Keeping the order means none of the timed work can be skipped.
    expect(order).toHaveLength(DRAWS)
    expect(radix).toBeLessThan(comparison * MAX_SHARE)
  })
})
