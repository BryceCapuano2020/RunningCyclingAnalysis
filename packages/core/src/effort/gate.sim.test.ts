import { describe, expect, it, vi } from 'vitest'
import { combine } from '../digest/combine'
import { digestActivity } from '../digest/digestActivity'
import { typicalDayOf } from '../digest/referenceMax'
import { MODEL_ERROR_FRACTION } from '../cp'
import { HABITUAL_PEAK_RATIO } from './gate'
import { athleteFor, libraryOf, truthCp } from './test/libraries'
import type { LibraryKind } from './test/libraries'
import type { AnalysisResult } from '../digest/combine'

vi.setConfig({ testTimeout: 600_000 })

/**
 * The effort gate on synthetic libraries: 40 athletes (threshold, work capacity, maximum heart rate and its slope
 * varied) for each kind of training, twelve weeks of runs, drawn by the generator and read through the whole analysis.
 * The numbers below were recorded on this harness and are asserted with room (docs/design/effort-gate.md has the table).
 */
const ATHLETES = 40
const SETTINGS = { massKg: 75, bikeMassKg: 9 }

interface Row {
  verdicts: Record<string, number>
  readings: Record<string, number>
  /** Typical-day share of the maximum, sorted. */
  typical: number[]
  /** Fit error against the truth in the analysis's unit, share of the truth, for fits the gate let through. */
  errors: number[]
  /** The regression error as a share of the truth, for the same fits. */
  ses: number[]
}

const rows = new Map<LibraryKind, Row>()

function run(kind: LibraryKind): Row {
  const held = rows.get(kind)
  if (held !== undefined) return held
  const row: Row = { verdicts: {}, readings: {}, typical: [], errors: [], ses: [] }
  for (let seed = 1; seed <= ATHLETES; seed++) {
    const athlete = athleteFor(seed)
    const digests = libraryOf(kind, athlete, seed).map((a) => digestActivity(a))
    const result: AnalysisResult = combine(digests, SETTINGS)
    const gate = result.effortGate.run
    row.verdicts[gate.verdict] = (row.verdicts[gate.verdict] ?? 0) + 1
    row.readings[String(gate.reference)] = (row.readings[String(gate.reference)] ?? 0) + 1
    const day = typicalDayOf(digests, Math.max(...digests.map((d) => d.startMs)))
    if (day !== null) row.typical.push(day.share)
    if (result.runCp !== null) {
      const truth = truthCp(athlete)
      row.errors.push((result.runCp.cp - truth) / truth)
      row.ses.push(result.runCp.cpSe / truth)
    }
  }
  row.typical.sort((a, b) => a - b)
  rows.set(kind, row)
  return row
}

const share = (row: Row, verdict: string) => (row.verdicts[verdict] ?? 0) / ATHLETES
const quantile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(p * values.length))]!

describe('the gate by kind of training', () => {
  it('holds easy and tempo-only libraries every time: the reference is low, or where the typical day lives', () => {
    // Recorded: easy 40 of 40 notHard (all low); tempo-only 40 of 40 (about two in three habitual, the rest low).
    expect(share(run('easy'), 'notHard')).toBe(1)
    expect(share(run('tempo'), 'notHard')).toBe(1)
    expect(run('tempo').readings.habitual).toBeGreaterThan(ATHLETES / 2)
  })

  it('lets hard and test libraries through, and a test day not quite all-out is held now and then', () => {
    // Recorded: hard 40 of 40, hard but sparse 40 of 40, a single test day 38 of 40 (a test at 94% of critical power
    // can sit under the hard line).
    expect(share(run('hard'), 'hard')).toBe(1)
    expect(share(run('hardSparse'), 'hard')).toBe(1)
    expect(share(run('testOnly'), 'hard')).toBeGreaterThanOrEqual(0.9)
  })

  it('keeps the reference of a hard library under the habitual line, and easy ones over it, by a margin', () => {
    // Recorded typical-day share of the maximum (5th to 95th): hard 0.79 to 0.85, hard but sparse 0.75 to 0.81,
    // easy-only 0.93 to 0.96, tempo-only 0.97 to 0.99. Tempo with easy days between is 0.85 to 0.89, like a hard library.
    expect(quantile(run('hard').typical, 0.95)).toBeLessThan(HABITUAL_PEAK_RATIO - 0.02)
    expect(quantile(run('easy').typical, 0.05)).toBeGreaterThan(HABITUAL_PEAK_RATIO + 0.02)
    expect(quantile(run('tempo').typical, 0.05)).toBeGreaterThan(HABITUAL_PEAK_RATIO + 0.02)
  })

  it('holds a library whose hard days are too few to set a reference (two races), as it holds an easy one', () => {
    // Races every fourth week: the reference needs three days to agree, so a library with two (7 of 40 here)
    // leaves it at the easy level and is held.
    expect(share(run('raceMix'), 'notHard')).toBeGreaterThan(0.1)
    expect(share(run('raceMix'), 'notHard')).toBeLessThan(0.3)
  })

  it('does not see through a tempo-and-intervals library: the residual the design states', () => {
    // Recorded: 37 of 40 pass with a fit about 13% under the truth (weekly tempo with easy days passes 25 of 40,
    // its fit refused for shape). Heart rate cannot tell a tempo 20 minutes (88% of
    // critical power) from an all-out one within the athletes' spread; the age band (D6) is what narrows it.
    const mixed = run('mixed')
    expect(share(mixed, 'hard')).toBeGreaterThan(0.8)
    expect(quantile(mixed.errors, 0.5)).toBeLessThan(-0.1)
  })
})

describe('rides', () => {
  /** A ride-only library of one kind, over the same athletes: how many gates say each verdict. */
  function rides(kind: LibraryKind): Record<string, number> {
    const verdicts: Record<string, number> = {}
    for (let seed = 1; seed <= 20; seed++) {
      const digests = libraryOf(kind, athleteFor(seed), seed, 'ride').map((a) => digestActivity(a))
      const { verdict } = combine(digests, SETTINGS).effortGate.ride
      verdicts[verdict] = (verdicts[verdict] ?? 0) + 1
    }
    return verdicts
  }

  it('holds easy-only and tempo-only ride libraries and lets hard ones through, as runs are', () => {
    // Recorded over 20 athletes: easy 20 notHard, tempo 20 notHard, hard 20 hard, a single test day 19 hard.
    expect(rides('easy')).toEqual({ notHard: 20 })
    expect(rides('tempo')).toEqual({ notHard: 20 })
    expect(rides('hard')).toEqual({ hard: 20 })
    expect(rides('testOnly').hard).toBeGreaterThanOrEqual(18)
  })
})

describe('the fit spread floor', () => {
  /** Share of libraries (hard, hard but sparse, one test day) whose spread holds the truth, for a given floor. */
  function coverage(floor: number): number {
    let held = 0
    let total = 0
    for (const kind of ['hard', 'hardSparse', 'testOnly'] as const) {
      const { errors, ses } = run(kind)
      errors.forEach((error, i) => {
        total++
        if (Math.abs(error) <= Math.hypot(ses[i]!, floor)) held++
      })
    }
    return held / total
  }

  it('is far from holding the truth in two libraries of three with the regression error alone', () => {
    // Recorded: 0.00 (the fit is a few percent under the truth, its regression error one or two).
    expect(coverage(0)).toBeLessThan(0.3)
  })

  it('is the smallest floor, in half percents, that holds it in two of three, and the shipped one is that', () => {
    let floor = 0
    while (coverage(floor) < 2 / 3) floor += 0.005
    // Recorded over 118 libraries: 0.70 at 0.05, 0.58 at 0.045, 0.50 at 0.04, 0.85 at 0.06.
    expect(floor).toBeCloseTo(MODEL_ERROR_FRACTION, 6)
  })
})
