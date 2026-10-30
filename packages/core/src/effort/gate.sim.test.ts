import { describe, expect, it, vi } from 'vitest'
import { ALLOWANCE_BASE, ALLOWANCE_PER_SHORTFALL, cpBand } from '../cp'
import type { Draw, Arm } from './test/arms'
import { runArm, truthRideCp, wilson } from './test/arms'
import { truthCp } from './test/libraries'
import type { LibraryKind, LibraryOptions } from './test/libraries'
import type { Sport } from '../types'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The effort gate on synthetic libraries: 100 athletes an arm (critical power, work capacity, maximum heart rate and its
 * slope varied), twelve weeks of runs unless the arm says otherwise, drawn by the generator and read through the whole analysis.
 * An arm says who the athletes are, what they train, and whether the settings give the year of birth or an entered maximum.
 * Every claim is a Wilson 95% bound on a count out of 100; the recorded counts are in docs/design/effort-gate.md. The harness
 * is synthetic: heart rate follows power in a straight line, so what it says of hard and tempo efforts is about this model.
 */
const N = 100

const train = (
  kind: LibraryKind,
  over: Partial<Arm> = {},
  options: LibraryOptions = {},
  sport: Sport = 'run',
): Arm => ({ training: [{ kind, sport, options }], ...over })

/** Realistic easy running: 70% to 80% of maximum heart rate, with strides on three days in ten. */
const REAL_EASY: LibraryOptions = { easyShare: [0.7, 0.8], strides: 0.3 }

const cache = new Map<string, Draw[]>()
const sports = new Map<string, Sport>()
function draws(name: string, arm: Arm): Draw[] {
  const held = cache.get(name)
  if (held !== undefined) return held
  const found = runArm(arm, N)
  cache.set(name, found)
  sports.set(name, arm.training[0]!.sport)
  return found
}

/** How many of an arm's athletes the gate calls `verdict`, with the Wilson bound on the share. */
function count(name: string, arm: Arm, verdict: string) {
  const sport = arm.training[0]!.sport
  const n = draws(name, arm).filter((d) => d.result.effortGate[sport].verdict === verdict).length
  const [low, high] = wilson(n, N)
  return { n, low, high }
}

const HARD_BOUNDS = 'lower 95% bound on the share let through'

describe('what must be held is held', () => {
  const HELD: Record<string, Arm> = {
    'easy only': train('easy'),
    'tempo only': train('tempo'),
    'easy only, age known': train('easy', { age: 'known' }),
    'realistic easy running (70% to 80% of maximum, strides)': train('easy', {}, REAL_EASY),
    'realistic easy running, age known': train('easy', { age: 'known' }, REAL_EASY),
    'five weeks of easy running (12 to 29 days)': train('easy', {}, { weeks: 5 }),
    'easy riding': train('easy', {}, {}, 'ride'),
    'easy running and easy riding': {
      training: [
        { kind: 'easy', sport: 'run' },
        { kind: 'easy', sport: 'ride' },
      ],
    },
    'easy running beside hard riding': {
      training: [
        { kind: 'easy', sport: 'run' },
        { kind: 'hard', sport: 'ride' },
      ],
    },
    'easy running with the true maximum entered': train('easy', { entered: 1 }),
  }
  it.each(Object.entries(HELD))('lets almost none of %s through as hard', (name, arm) => {
    // Recorded: 0 of 100 for every arm but realistic easy running (2 of 100), the offset arm (5) and easy riding (5).
    const { high } = count(name, arm, 'hard')
    expect(high, HARD_BOUNDS).toBeLessThan(0.13)
  })

  it('holds a tempo-only library with the age known 93 times in a hundred, and says so', () => {
    // Without the age it holds all; with it a reference of 150 bpm or more that is not within 10 bpm of the predicted
    // maximum is still read as habitual, and the rest (7 in 100) are trusted. That is the residual the entered maximum closes.
    const { low, high } = count('tempo only, age known', train('tempo', { age: 'known' }), 'hard')
    expect(high).toBeLessThan(0.17)
    expect(low).toBeLessThan(0.07)
  })
})

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

describe('what the gate cannot do, recorded', () => {
  it('does not see through tempo and intervals every week: 96 pass with a fit about 13% under the truth', () => {
    const arm = train('mixed')
    const { low } = count('mixed', arm, 'hard')
    expect(low).toBeGreaterThan(0.85)
    const errors = draws('mixed', arm)
      .flatMap((d) => (d.error === null ? [] : [d.error]))
      .sort((a, b) => a - b)
    expect(errors[errors.length >> 1]!).toBeLessThan(-0.1)
  })

  it('holds weekly tempo with easy days between in about a third of athletes, and the fit is refused for shape', () => {
    const arm = train('tempoEasy')
    const { n } = count('tempoEasy', arm, 'hard')
    expect(n).toBeGreaterThan(55)
    expect(n).toBeLessThan(85)
    expect(draws('tempoEasy', arm).every((d) => d.result.runCp === null)).toBe(true)
  })

  it('cannot judge a single test day, or two weeks, without the age: nothing is withheld and the screens say so', () => {
    for (const [name, arm] of [
      ['one test day', train('testOnly')],
      ['two weeks of hard training', train('hard', {}, { weeks: 2 })],
    ] as const) {
      const found = draws(name, arm)
      expect(
        found.every((d) => d.result.effortGate.run.verdict === 'unknown'),
        name,
      ).toBe(true)
      expect(
        found.every((d) => d.result.effortGate.run.unchecked === 'thin'),
        name,
      ).toBe(true)
      expect(
        found.every((d) => d.result.runCp !== null || d.result.runCpRefusal !== 'effort'),
        name,
      ).toBe(true)
    }
  })

  it('lets some realistic easy runners through when their days differ by a heart-rate offset', () => {
    // A hot day or a poor night lifts the whole day's heart rate by several beats, so the days of an easy library spread and
    // its typical day sits further under the maximum. About one in eight read as trusted, and the best 20 minutes then reads hard.
    const { n, high } = count(
      'easy with an offset',
      train('easy', {}, { ...REAL_EASY, dayOffsetBpm: 6 }),
      'hard',
    )
    expect(n).toBeGreaterThan(0)
    expect(high).toBeLessThan(0.25)
  })

  it('judges a test day against the age-predicted maximum when the age is known: about two in three pass', () => {
    const { n } = count('one test day, age known', train('testOnly', { age: 'known' }), 'hard')
    expect(n).toBeGreaterThan(55)
    expect(n).toBeLessThan(82)
  })

  it('holds athletes whose maximum is under 150 bpm when the age is not given, and fewer when it is', () => {
    const lowMax = { athlete: { hrMax: [140, 165] as const } }
    const noAge = count('low maximum', train('hard', lowMax), 'hard')
    const age = count('low maximum, age known', train('hard', { ...lowMax, age: 'known' }), 'hard')
    // Recorded: 54 and 72 of 100 pass. The rest read `low`; entering the maximum passes them.
    expect(noAge.n).toBeLessThan(age.n)
    expect(noAge.high).toBeLessThan(0.65)
  })

  it('reads a beginner whose heart rate at critical power is 80% to 88% of maximum as not hard: a limit of the heart-rate line', () => {
    // Recorded: 19 of 100 pass. The line is 90% of the reference; in this model a beginner's all-out 20 minutes sits under it.
    const { n } = count('beginners', train('hard', { athlete: { atCp: [0.8, 0.88] } }), 'hard')
    expect(n).toBeLessThan(35)
  })

  it('holds about one athlete in six who raced three times on easy running: the reference rule needs three days to agree', () => {
    // Easy running with a race every fourth week is three race days (weeks 4, 8 and 12). The reference (referenceMax.ts) takes
    // the highest value three days reached within 3 bpm of each other among the top days; three races rarely agree that
    // closely, so for 17 athletes in 100 the first three days that do are easy ones and the reference reads the easy level, low.
    // By maximum heart rate the held and the passed are alike (mean 183 and 181 bpm; the held range from 168 up), so it is not the
    // maximum: it is the agreement rule, which is the reference's (C1) and not the gate's. The race days' heart rate is not set aside.
    const found = draws('races', train('raceMix'))
    const held = found.filter((d) => d.result.effortGate.run.verdict === 'notHard')
    const passed = found.filter((d) => d.result.effortGate.run.verdict === 'hard')
    expect(held.length).toBeGreaterThan(8)
    expect(held.length).toBeLessThan(30)
    expect(held.every((d) => d.result.effortGate.run.reference === 'low')).toBe(true)
    expect(found.every((d) => d.result.heartRateSetAside.length === 0)).toBe(true)
    const mean = (list: Draw[]) => list.reduce((s, d) => s + d.athlete.hrMax, 0) / list.length
    expect(Math.abs(mean(held) - mean(passed))).toBeLessThan(8)
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
    // Recorded: 0.67 over about a thousand fits (a Wilson bound of 0.64 to 0.70).
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

describe('the table in docs/design/effort-gate.md', () => {
  const recording = (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env.RECORD
  it.skipIf(recording === undefined)('prints the verdicts of every arm run above', () => {
    const lines = [...cache.entries()].map(([name, found]) => {
      const sport = sports.get(name) ?? 'run'
      const verdicts: Record<string, number> = {}
      const readings: Record<string, number> = {}
      for (const d of found) {
        const gate = d.result.effortGate[sport]
        verdicts[gate.verdict] = (verdicts[gate.verdict] ?? 0) + 1
        readings[String(gate.reference)] = (readings[String(gate.reference)] ?? 0) + 1
      }
      return `${name}: ${JSON.stringify(verdicts)} ${JSON.stringify(readings)}`
    })
    console.log(`RECORDED\n${lines.join('\n')}`)
  })
})
