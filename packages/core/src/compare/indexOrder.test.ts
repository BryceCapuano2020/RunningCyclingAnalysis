import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { comparatorOrder, indexOrder } from './indexOrder'

/** Values of every kind the sort meets: both signs, ties, both zeros, infinities and subnormals. */
function varied(n: number, seed: number): Float64Array {
  const random = mulberry32(seed)
  const special = [0, -0, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, 1, -1, 1e300]
  return Float64Array.from({ length: n }, () => {
    const pick = random()
    if (pick < 0.15) return special[Math.floor(random() * special.length)]!
    if (pick < 0.4) return Math.floor(random() * 20) - 10
    return (random() - 0.5) * 10 ** Math.floor(random() * 12 - 6)
  })
}

describe('indexOrder', () => {
  it('is the order the comparison sort gives, for either direction and every size', () => {
    for (const n of [0, 1, 2, 3, 17, 255, 1000, 4000]) {
      const values = varied(n, n + 1)
      for (const descending of [false, true]) {
        expect(indexOrder(values, n, descending)).toEqual(comparatorOrder(values, n, descending))
      }
    }
  })

  it('orders more values than it keeps working arrays for, and the sizes after them', () => {
    for (const n of [70_000, 300, 70_000, 5000]) {
      const values = varied(n, n)
      expect(indexOrder(values, n, n === 300)).toEqual(comparatorOrder(values, n, n === 300))
    }
  })

  it('keeps equal values, and zeros of either sign, in index order', () => {
    const values = [0, -0, 2, 0, -0, 2]
    expect(indexOrder(values, values.length, false)).toEqual([0, 1, 3, 4, 2, 5])
    expect(indexOrder(values, values.length, true)).toEqual([2, 5, 0, 1, 3, 4])
  })

  it('orders only the first n values', () => {
    expect(indexOrder([3, 1, 2, -5], 3, false)).toEqual([1, 2, 0])
  })

  it('sorts by comparison when a value is not a number, as it did', () => {
    const values = [3, Number.NaN, 1, 2, Number.NaN, 0]
    for (const descending of [false, true]) {
      expect(indexOrder(values, values.length, descending)).toEqual(
        comparatorOrder(values, values.length, descending),
      )
    }
  })

  it('reads typed arrays and plain arrays alike', () => {
    const values = varied(300, 9)
    expect(indexOrder(Array.from(values), 300, false)).toEqual(indexOrder(values, 300, false))
  })
})
