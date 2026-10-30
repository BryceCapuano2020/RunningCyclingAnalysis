import { describe, expect, it, vi } from 'vitest'
import { DAY_MS, HEADLINE_DURATION_S } from '../constants'
import { effortLibrary } from './test/library'
import { evidenceOf, libraryOf, rates } from './test/scenario'
import type { Scenario } from './test/scenario'
import { verdictOfCall } from './types'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The change test on synthetic libraries through the real combine path: two periods of 12 weeks, the second at a planted
 * capability above the first. The noise is a real library's (`effortSd`): every effort lands round the capability with
 * a log sd (0.10 for a run's 20 minutes, 0.25 for a ride's 5 minutes), so equal-capability pairs of periods differ by a
 * median of 3.5 to 6% (a run, 20 min) and 10 to 15% (a ride, 5 min), the figures the audit found in a real library.
 * An earlier harness clipped hard efforts at the capability, which made its noise 6 to 17 times smaller and its
 * power several times better than the figures here. Values observed over 300 seeds are in the comments.
 */
const SEEDS = 200
const RUN: Omit<Scenario, 'planted' | 'perWeek'> = { sport: 'run', period: 12, effortSd: 0.1 }
const RIDE: Omit<Scenario, 'planted' | 'perWeek'> = { sport: 'ride', period: 12, effortSd: 0.25 }

describe('the noise of the harness is a real library’s', () => {
  it('puts equal-capability pairs a median of 3.5 to 6% apart for a run’s 20 minutes', () => {
    const r = rates({ ...RUN, perWeek: 3, planted: 0 }, HEADLINE_DURATION_S, SEEDS)
    expect(r.medianAbs).toBeGreaterThan(0.035)
    expect(r.medianAbs).toBeLessThan(0.06)
  })

  it('puts them 10 to 15% apart for a ride’s 5 minutes', () => {
    const r = rates({ ...RIDE, perWeek: 2, planted: 0 }, 300, SEEDS)
    expect(r.medianAbs).toBeGreaterThan(0.1)
    expect(r.medianAbs).toBeLessThan(0.15)
  })
})

describe('equal capability is called a change about 10% of the time or less', () => {
  // Observed: 3 to 8% together at the record level, 2 to 5% at the headline level, run and ride, 2 to 4 a week.
  it.each([
    ['a run, 2 a week', { ...RUN, perWeek: 2 }, HEADLINE_DURATION_S],
    ['a run, 4 a week', { ...RUN, perWeek: 4 }, HEADLINE_DURATION_S],
    ['a ride’s 5 minutes, 2 a week', { ...RIDE, perWeek: 2 }, 300],
    ['a ride’s 20 minutes, 4 a week', { ...RIDE, perWeek: 4 }, HEADLINE_DURATION_S],
  ] as const)('%s', (_name, spec, durationS) => {
    const r = rates({ ...spec, planted: 0 }, durationS, SEEDS)
    expect(r.higher + r.lower).toBeLessThan(0.12)
    expect(r.strong).toBeLessThan(0.07)
  })

  it('does so for irregular training, 3 a week on average', () => {
    const r = rates({ ...RUN, perWeek: 3.4, planted: 0 }, HEADLINE_DURATION_S, SEEDS)
    expect(r.higher + r.lower).toBeLessThan(0.12)
  })

  // Observed: 8% together for a capability that wanders 3% a week (correlation 0.9) over 12 weeks, 12% over 26 weeks.
  // The audit-era harness showed 28% here; that was its clipped efforts, not the test.
  it('stays near 10% through a wander of 3% in capability, which a pooled null cannot see as exchangeable', () => {
    const r = rates({ ...RUN, perWeek: 4, wander: 0.03, planted: 0 }, HEADLINE_DURATION_S, SEEDS)
    expect(r.higher + r.lower).toBeLessThan(0.14)
  })

  // Observed: 3 to 4% either way.
  it('does so when one period holds three times the efforts of the other', () => {
    for (const [before, now] of [
      [5, 1.5],
      [1.5, 5],
    ] as const) {
      let called = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const library = [
          ...effortLibrary({ sport: 'run', perWeek: before, weeks: 12, seed, effortSd: 0.1 }),
          ...effortLibrary({
            sport: 'run',
            perWeek: now,
            weeks: 12,
            seed: seed + 1000,
            effortSd: 0.1,
          }).map((d) => Object.assign({}, d, { startMs: d.startMs + 12 * 7 * DAY_MS })),
        ]
        const call = evidenceOf(library, 12).run.find((c) => c.durationS === HEADLINE_DURATION_S)!
        if (call.verdict === 'higher' || call.verdict === 'lower') called++
      }
      expect(called / SEEDS).toBeLessThan(0.12)
    }
  })
})

describe('the surfaces that surface several claims at once hold a false-call budget', () => {
  // Observed over 300 libraries: any of 5, 20 and 60 min at the record level 18%; the headline of a run's or a ride's
  // 20 minutes 7.3% (4.0% for the run alone). The record rows keep 5% a tail; the headline surfaces use 2.5%.
  it('calls the Balance strip’s or a curve’s headline in under 10% of libraries where nothing changed', () => {
    let any = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const run = evidenceOf(libraryOf({ ...RUN, perWeek: 4, planted: 0 }, seed), 12).run
      const ride = evidenceOf(libraryOf({ ...RIDE, perWeek: 3, planted: 0 }, seed), 12).ride
      const called = (calls: typeof run) => {
        const verdict = verdictOfCall(
          calls.find((c) => c.durationS === HEADLINE_DURATION_S),
          'headline',
        )
        return verdict === 'higher' || verdict === 'lower'
      }
      if (called(run) || called(ride)) any++
    }
    expect(any / SEEDS).toBeLessThan(0.1)
  })

  it('is stricter at the headline than at a record row, by design', () => {
    const r = rates({ ...RUN, perWeek: 4, planted: 0 }, HEADLINE_DURATION_S, SEEDS)
    expect(r.strong).toBeLessThan(r.higher + r.lower)
  })
})

describe('a planted change is found at the rate its noise allows', () => {
  // Observed at real noise, record level (headline level in brackets): a run, 4 a week, +5% 17% (11%), +10% 42% (34%);
  // a run, 2 a week, +5% 8%, +10% 28% (19%); a ride’s 5 minutes, 2 a week, +10% 13% (7%).
  it('finds a 10% gain in a run’s 20 minutes in about two athletes in five at 4 a week, and 5% in about one in six', () => {
    const five = rates({ ...RUN, perWeek: 4, planted: 0.05 }, HEADLINE_DURATION_S, SEEDS)
    const ten = rates({ ...RUN, perWeek: 4, planted: 0.1 }, HEADLINE_DURATION_S, SEEDS)
    expect(ten.higher).toBeGreaterThan(0.3)
    expect(ten.higher).toBeLessThan(0.6)
    expect(five.higher).toBeGreaterThan(0.08)
    expect(five.higher).toBeLessThan(ten.higher)
    expect(ten.strong).toBeLessThan(ten.higher)
    expect(ten.lower).toBeLessThan(0.02)
  })

  it('finds less in a ride’s 5 minutes, where an effort varies by a quarter', () => {
    const ten = rates({ ...RIDE, perWeek: 2, planted: 0.1 }, 300, SEEDS)
    expect(ten.higher).toBeGreaterThan(0.05)
    expect(ten.higher).toBeLessThan(0.3)
  })

  it('calls no change where the efforts are too few, rather than guessing', () => {
    const r = rates({ ...RUN, perWeek: 1, planted: 0.1 }, HEADLINE_DURATION_S, SEEDS)
    expect(r.untested).toBeGreaterThan(0.2)
    expect(r.higher + r.lower).toBeLessThan(0.3)
  })
})

describe('a swing in how often the athlete went hard is a known gap until the hard-effort gate', () => {
  // Observed with efforts clipped at the capability (hard share 0.2 against 0.8, capability equal): 27% called higher.
  // The change test reads efforts through the reading rule the curves use, and a hard-effort rule is plugged in there.
  it('reads a period of mostly easy efforts against one of mostly hard ones as a gain', () => {
    let higher = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const easy = effortLibrary({
        sport: 'run',
        perWeek: 4,
        weeks: 12,
        seed,
        hardShare: 0.2,
        spread: 0.05,
      })
      const hard = effortLibrary({
        sport: 'run',
        perWeek: 4,
        weeks: 12,
        seed: seed + 500,
        hardShare: 0.8,
        spread: 0.05,
      }).map((d) => Object.assign({}, d, { startMs: d.startMs + 12 * 7 * DAY_MS }))
      const call = evidenceOf([...easy, ...hard], 12).run.find(
        (c) => c.durationS === HEADLINE_DURATION_S,
      )!
      if (call.verdict === 'higher') higher++
    }
    expect(higher / SEEDS).toBeGreaterThan(0.15)
  })
})
