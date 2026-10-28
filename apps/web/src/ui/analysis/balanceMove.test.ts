import { describe, expect, it } from 'vitest'
import type { BalanceReading } from '../components/balanceScale'
import { balanceMoveItem } from './balanceMove'

/** An even balance in points, as the Balance page reads it: signed, running against cycling. */
function evenPoints(centre: number, low: number, high: number): BalanceReading {
  return { unit: 'points', lean: 'even', lead: { centre, low, high } }
}

describe('balanceMoveItem: an even balance', () => {
  it('names the balance as the subject of a moved best estimate, so no "Its" lacks an antecedent', () => {
    const item = balanceMoveItem(evenPoints(6, -5, 16), evenPoints(7, -5, 16), null)
    expect(item?.text).toBe("Your balance's best estimate moved from +6 to +7 points")
  })

  it('writes each range as the page does, "A to B", so the two never run together', () => {
    const item = balanceMoveItem(evenPoints(6, -5, 16), evenPoints(7, -4, 16), null)
    expect(item?.text).toBe(
      "Your balance's best estimate moved from +6 to +7 points, and the range was −5 to +16 points and is now −4 to +16 points",
    )
  })

  it('names the balance when only the range moved', () => {
    const item = balanceMoveItem(evenPoints(6, -5, 16), evenPoints(6, -4, 16), null)
    expect(item?.text).toBe("Your balance's range was −5 to +16 points and is now −4 to +16 points")
  })
})
