import { describe, expect, it } from 'vitest'
import { curvePoint } from './fixtures'
import { durationRows } from './curveRows'

describe('durationRows', () => {
  it('has one row per duration of at least a minute, shortest first, across every curve', () => {
    const rows = durationRows([
      [curvePoint(1200, 4, 'a'), curvePoint(30, 9, 'a')],
      [curvePoint(60, 5, 'b'), curvePoint(1200, 3, 'b')],
    ])
    expect(rows.map((row) => row.durationS)).toEqual([60, 1200])
  })

  it('gives each curve’s point at that duration, and nothing where a curve has none', () => {
    const [first, second] = durationRows([[curvePoint(60, 5, 'a')], [curvePoint(1200, 3, 'b')]])
    expect(first?.points.map((point) => point?.value)).toEqual([5, undefined])
    expect(second?.points.map((point) => point?.value)).toEqual([undefined, 3])
  })

  it('is empty for no curves', () => {
    expect(durationRows([])).toEqual([])
  })
})
