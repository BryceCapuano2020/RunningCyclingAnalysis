/**
 * The own-data check on the synthetic lifters at the drawn centre (docs/design/e1rm.md, sections 7 and
 * 10): the check must hold, since the estimator's own prior produced the lifters.
 */
import { describe, expect, it } from 'vitest'
import { checkVerdict, ownDataCheck } from './ownDataCheck'
import { simulate } from './test/lifters'
import { population } from './test/scenarios'
import { SCENARIO_NAMES } from './test/score'

describe('own-data check on held-out synthetic lifters, curve centre drawn', () => {
  it('pools to a coverage in line with section 7 and holds', () => {
    let events = 0
    let inRange = 0
    let above = 0
    let below = 0
    for (const name of SCENARIO_NAMES) {
      for (const spec of population(name, 20, -1, 1)) {
        const c = ownDataCheck(simulate(spec).sets)
        events += c.events
        inRange += c.inRange
        above += c.above
        below += c.below
      }
    }
    console.log(`own-data check: ${events} events, in ${inRange}, above ${above}, below ${below}`)
    expect(events).toBeGreaterThanOrEqual(30)
    expect(inRange / events).toBeGreaterThanOrEqual(0.8)
    expect(inRange / events).toBeLessThanOrEqual(0.92)
    expect(checkVerdict(events, inRange, above, below)).toBe('holds')
  })
})
