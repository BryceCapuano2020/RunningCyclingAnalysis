import { describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '../constants'
import { rates } from './test/scenario'

vi.setConfig({ testTimeout: 600_000 })

/**
 * The change test on synthetic libraries through the real combine path: two periods of 12 weeks, the second at a
 * planted capability above the first. A ride and a run are judged at 20 minutes. `spread` is how near the capability
 * a hard effort lands (a log sd; an athlete's own best-of-window noise grows with it) and half the efforts are hard.
 * Values observed over 200 seeds are in the comments, and the bounds sit outside them with room for another draw.
 */
const SEEDS = 200
const at20 = (scenario: Parameters<typeof rates>[0]) => rates(scenario, HEADLINE_DURATION_S, SEEDS)

describe('equal capability is called a change about 10% of the time or less', () => {
  // Observed over 400 seeds: 4-8% in all, 6-8% at most, either way together.
  it.each([
    ['a run, 2 a week, tight efforts', { sport: 'run', perWeek: 2, spread: 0.02 }],
    ['a run, 4 a week, loose efforts', { sport: 'run', perWeek: 4, spread: 0.08 }],
    ['a ride, 2 a week, loose efforts', { sport: 'ride', perWeek: 2, spread: 0.08 }],
    ['a ride, 4 a week, tight efforts', { sport: 'ride', perWeek: 4, spread: 0.02 }],
    ['irregular training, 3 a week on average', { sport: 'run', perWeek: 3.4, spread: 0.05 }],
  ] as const)('%s', (_name, spec) => {
    const r = at20({ ...spec, period: 12, planted: 0 })
    expect(r.higher + r.lower).toBeLessThan(0.12)
  })

  // Capability that drifts by 3% a week (correlation 0.9) is a change in the athlete between two periods, but not one
  // the pooled null sees as exchangeable: it is called about 28% of the time. Documented, not hidden: the wander is
  // the athlete's, and a best-effort rule cannot tell it from a gain.
  it('calls a wandering capability a change in about a quarter of pairs, as documented', () => {
    const r = at20({ sport: 'run', perWeek: 4, spread: 0.04, wander: 0.03, period: 12, planted: 0 })
    expect(r.higher + r.lower).toBeGreaterThan(0.15)
    expect(r.higher + r.lower).toBeLessThan(0.4)
  })
})

describe('a planted change is found at the rate its noise allows', () => {
  // Observed at 4 a week: 5% found in 88-99% (loose to tight efforts), 10% in 99-100%.
  it('finds 5% and 10% in an athlete who trains 4 a week', () => {
    const five = at20({ sport: 'run', perWeek: 4, spread: 0.05, period: 12, planted: 0.05 })
    const ten = at20({ sport: 'run', perWeek: 4, spread: 0.05, period: 12, planted: 0.1 })
    expect(five.higher).toBeGreaterThan(0.8)
    expect(ten.higher).toBeGreaterThan(0.95)
    expect(five.lower).toBeLessThan(0.02)
  })

  // Observed at 2 a week: 5% in 36-76% by spread, 10% in 69-89%.
  it('finds 10% in most athletes who train twice a week, and 5% in about half', () => {
    const five = at20({ sport: 'ride', perWeek: 2, spread: 0.05, period: 12, planted: 0.05 })
    const ten = at20({ sport: 'ride', perWeek: 2, spread: 0.05, period: 12, planted: 0.1 })
    expect(ten.higher).toBeGreaterThan(0.65)
    expect(five.higher).toBeGreaterThan(0.3)
    expect(five.higher).toBeLessThan(ten.higher)
  })

  it('calls no change where the efforts are too few, rather than guessing', () => {
    const r = at20({ sport: 'run', perWeek: 1, spread: 0.05, period: 12, planted: 0.1 })
    // One a week leaves under four efforts at 20 minutes on a side in over half of the libraries.
    expect(r.untested).toBeGreaterThan(0.4)
    expect(r.higher + r.lower).toBeLessThan(0.3)
  })
})
