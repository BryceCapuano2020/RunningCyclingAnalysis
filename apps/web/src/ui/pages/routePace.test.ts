import { describe, expect, it } from 'vitest'
import type { RouteShape } from '@rca/core/route/routeShape'
import { routeSegmentPace } from './routePace'
import { steadyTrace } from './workbenchFixtures'

/** A straight line east of ten equal segments. */
const LINE: RouteShape = {
  points: Array.from({ length: 11 }, (_, i): [number, number] => [i / 10, 0]),
  aspect: 1000,
}

/** A trace that covers the first half of the distance at 2 m/s and the second half at 4 m/s. */
function twoSpeeds() {
  const trace = steadyTrace(300)
  let metres = 0
  trace.distance = Float64Array.from({ length: 300 }, (_, i) => {
    const here = metres
    metres += i < 200 ? 2 : 4
    return here
  })
  return trace
}

describe('routeSegmentPace', () => {
  it('colours a faster stretch higher than a slower one, along the path', () => {
    const shares = routeSegmentPace(LINE, twoSpeeds())!
    expect(shares).toHaveLength(10)
    // 400 m at 2 m/s then 400 m at 4 m/s: the path's halves are the distance's halves.
    expect(Math.max(...shares.slice(0, 4))).toBeLessThan(Math.min(...shares.slice(6)))
    expect(shares[0]).toBeCloseTo(0, 5)
    expect(shares.at(-1)).toBeCloseTo(1, 5)
  })

  it('does not count a stop as slow running: the moving seconds are what it divides by', () => {
    const trace = twoSpeeds()
    // A long pause in the slow half: no distance, and no moving time.
    trace.paused.fill(1, 50, 150)
    for (let i = 50; i < 150; i += 1) trace.distance[i] = trace.distance[50]!
    for (let i = 150; i < 300; i += 1) trace.distance[i] = trace.distance[i]! - 200
    const shares = routeSegmentPace(LINE, trace)!
    expect(shares[0]).toBe(shares[1])
  })

  it('has no colouring without a trace, a distance, or enough of an outline', () => {
    expect(routeSegmentPace(LINE, null)).toBeNull()
    expect(routeSegmentPace(null, twoSpeeds())).toBeNull()
    const none = steadyTrace(60)
    none.distance = new Float64Array(60).fill(Number.NaN)
    expect(routeSegmentPace(LINE, none)).toBeNull()
    expect(
      routeSegmentPace(
        {
          points: [
            [0, 0],
            [1, 1],
          ],
          aspect: 1,
        },
        twoSpeeds(),
      ),
    ).toBeNull()
  })

  it('says every stretch is middling when the activity held one pace', () => {
    const shares = routeSegmentPace(LINE, steadyTrace(300))!
    expect(new Set(shares)).toEqual(new Set([0.5]))
  })
})
