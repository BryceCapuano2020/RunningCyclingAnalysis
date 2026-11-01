// The effort gate on synthetic libraries: hard training is let through, and the fit spread of the fits it lets through (harness: test/gateSim.ts).
import { describe, expect, it } from 'vitest'
import { ALLOWANCE_BASE, ALLOWANCE_PER_SHORTFALL, cpBand } from '../cp'
import { truthRideCp } from './test/arms'
import { truthCp } from './test/libraries'
import { HARD_BOUNDS, allowLongArms, count, draws, recordArms, train } from './test/gateSim'
import type { Arm } from './test/arms'

allowLongArms()

describe('hard training is let through', () => {
  const PASSING: Record<string, Arm> = {
    'hard (intervals weekly, a monthly test)': train('hard'),
    'hard but sparse (intervals every second week, one test)': train('hardSparse'),
    'hard, five weeks (12 to 29 days)': train('hard', {}, { weeks: 5 }),
    'hard with a day-to-day heart-rate offset': train('hard', {}, { dayOffsetBpm: 6 }),
    'hard riding': train('hard', {}, {}, 'ride'),
    'hard but sparse riding': train('hardSparse', {}, {}, 'ride'),
    'hard running and riding': {
      training: [
        { kind: 'hard', sport: 'run' },
        { kind: 'hard', sport: 'ride' },
      ],
    },
    'hard-heavy with the true maximum entered': train('hardHeavy', { entered: 1 }),
    'hard with the maximum entered 5% under the true one': train('hard', { entered: 0.95 }),
  }
  it.each(Object.entries(PASSING))('passes %s', (name, arm) => {
    // Recorded: 98 to 100 of 100.
    const { low } = count(name, arm, 'hard')
    expect(low, HARD_BOUNDS).toBeGreaterThan(0.9)
  })

  it('passes most hard-heavy athletes only when the age or the maximum is given', () => {
    // Intervals twice a week put the typical day at the maximum, which a tempo-only runner's also is. With the age known the
    // reference is checked against the age band and 77 of 100 pass; without it 99 of 100 are held as habitual, and entering the
    // maximum (previous test) passes 99.
    const noAge = count('hard-heavy', train('hardHeavy'), 'hard')
    const age = count('hard-heavy, age known', train('hardHeavy', { age: 'known' }), 'hard')
    expect(noAge.high).toBeLessThan(0.1)
    expect(age.low).toBeGreaterThan(0.65)
    expect(age.high).toBeLessThan(0.87)
  })
})

describe('the fit spread', () => {
  /** The gate-passing fits of the arms the allowance was fitted to. */
  function passing() {
    const arms: Arm[] = [
      train('hard'),
      train('hardSparse'),
      train('hardHeavy', { age: 'known' }),
      train('mixed'),
      train('testOnly', { age: 'known' }),
      train('hard', { age: 'known', athlete: { hrMax: [140, 165] } }),
      train('hard', {}, { weeks: 5 }),
      train('hard', {}, { dayOffsetBpm: 6 }),
      train('hardSparse', { athlete: { atCp: [0.8, 0.88] } }),
      train('hard', {}, {}, 'ride'),
      train('hardSparse', {}, {}, 'ride'),
    ]
    return arms.flatMap((arm, i) => {
      const sport = arm.training[0]!.sport
      return draws(`spread ${i}`, arm).flatMap((d) => {
        const fit = { run: d.result.runCp, ride: d.result.rideCp }[sport]
        const gate = d.result.effortGate[sport]
        if (fit === null || gate.verdict !== 'hard') return []
        const truth = { run: truthCp(d.athlete), ride: truthRideCp(d.athlete) }[sport]
        return [{ fit, share: gate.share, truth }]
      })
    })
  }

  it('holds the truth in about two fits of three, down by the regression error and up by the allowance', () => {
    const fits = passing()
    const held = fits.filter(({ fit, share, truth }) => {
      const { low, high } = cpBand(fit, share)
      return truth >= low && truth <= high
    }).length
    const share = held / fits.length
    // Recorded: 0.67 over about a thousand fits, in-sample: the allowance was fitted to these same fits, so this is the fit's
    // own coverage and no out-of-sample claim, and no interval is put on it.
    expect(fits.length).toBeGreaterThan(800)
    expect(share).toBeGreaterThan(0.62)
    expect(share).toBeLessThan(0.73)
  })

  it('has an allowance that the harness errors, regressed on the share, give back', () => {
    const fits = passing()
    const xs = fits.map(({ share }) => 1 - share!)
    const ys = fits.map(({ fit, truth }) => truth / fit.cp - 1)
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    const slope =
      xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) /
      xs.reduce((s, x) => s + (x - mx) ** 2, 0)
    const intercept = my - slope * mx
    // Recorded: 0.037 + 0.386 x (1 - share); the allowance is that and the 67th percentile of what is left (0.0074).
    expect(intercept + 0.0074).toBeGreaterThan(ALLOWANCE_BASE - 0.01)
    expect(intercept + 0.0074).toBeLessThan(ALLOWANCE_BASE + 0.01)
    expect(slope).toBeGreaterThan(ALLOWANCE_PER_SHORTFALL - 0.2)
    expect(slope).toBeLessThan(ALLOWANCE_PER_SHORTFALL + 0.2)
  })
})

recordArms()
