import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MIXING_STEP } from '../../fitness/test/runSim'
import { digestActivity } from '../digestActivity'
import { REVISIONS } from '../revisions'
import { readRev6Fixture } from './mixingFixtures.node'
import { studyLibraries } from './mixingLibraries'
import { BOUNDS } from './mixingOutputs'
import { decide, findingsOf, mixed, studyLibrary } from './mixingStudy'
import type { Findings, Pairs } from './mixingStudy'

vi.setConfig({ testTimeout: 600_000 })

/*
 * The mixing study of D12 section 1.8. Libraries: two seasons of the sample athlete (runs and rides, a planted slip in
 * easy running), a hilly and a flat run library, and a library of steady runs with short steep descents (alone, and cut
 * to its newest 30 runs, which the strict fitness unit reads). Each is digested at revision 6 (the checked-in fixtures)
 * and at revision 7 (now), and read as a whole library under a table that makes revision 7 `mixable` with nothing held
 * back, with the newest k% on revision 7 and the rest on 6, and the oldest k% on 7, for k in 10, 25, 50, 75, 90.
 * Every output is compared with the library on revision 7 alone: best efforts, the weekly best 20 minutes, the
 * reference heart rates and the thresholds the zones are cut from, the run/ride lean, the fitness status and value,
 * the change test's verdicts against the period before (the default 12 weeks, so a revision boundary falls inside each
 * window and between them), and who holds each record.
 *
 * Bounds, a third of the floor in force (mixingOutputs.ts): best efforts and the lean 0.33%, a reference heart rate
 * 5/3 bpm, the fitness value 0.0133. A change verdict must agree for 99% of calls and never claim a change the library
 * on 7 alone does not. The fitness status must not change. The monitor sim (monitor.mixing.sim.test.ts) covers the
 * fitness value as a contiguous step.
 */
const byTime = <T extends { startMs: number; id: string }>(digests: T[]): T[] =>
  [...digests].sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1))

function pairsOf(name: string, activities: Parameters<typeof digestActivity>[0][]): Pairs {
  const six = readRev6Fixture(name)
  const seven = byTime(activities.map((activity) => digestActivity(activity)))
  expect(
    seven.map((d) => d.id),
    `${name}: the library is not the one the fixtures were made from`,
  ).toEqual(six.map((d) => d.id))
  return { six, seven }
}

function measure() {
  const libraries = studyLibraries()
  const results = libraries.map(({ name, activities }) =>
    studyLibrary(name, pairsOf(name, activities)),
  )
  // The descent library again, its newest 30 runs only (270 km): under the 300 km the grade fit needs, so the
  // strict fitness unit reads it and takes the whole grade credit.
  const descent = pairsOf('descent', libraries.find(({ name }) => name === 'descent')!.activities)
  results.push(
    studyLibrary('descent-small', {
      six: descent.six.slice(-30),
      seven: descent.seven.slice(-30),
    }),
  )
  const findings = findingsOf(results)
  return { results, findings, decision: decide(findings) }
}

describe('the mixing study', () => {
  const study = measure()

  it('finds the consumers that revision 7 moves: best efforts, the weekly bests, the change test and the records', () => {
    const { findings } = study
    // Revision 7 values a steep descent at more than revision 6 did (descentCost), so a mixed library's long best
    // efforts, which a descent can set, read lower than the same library on revision 7: 2.2% on the hilly library.
    expect(findings.best).toBeGreaterThan(BOUNDS.best)
    expect(findings.trend).toBeGreaterThan(BOUNDS.best)
    expect(findings.verdictsAwayFromNone).toBeGreaterThan(0)
    expect(findings.holdersAgreement).toBeLessThan(0.99)
    expect(findings.within).toMatchObject({
      combine: false,
      trend: false,
      change: false,
      records: false,
    })
  })

  it('finds the zones, the thresholds, the lean and the fitness status unmoved by the revision', () => {
    const { findings } = study
    expect(findings.referenceHrBpm).toBeLessThanOrEqual(BOUNDS.zoneBpm)
    expect(findings.threshold).toBeLessThanOrEqual(BOUNDS.best)
    expect(findings.lean).toBeLessThanOrEqual(BOUNDS.best)
    expect(findings.fitnessStateChanges).toBe(0)
    expect(findings.fitness).toBeLessThanOrEqual(BOUNDS.fitness)
    // And far under the step the monitor is shown to tolerate (monitor.mixing.sim.test.ts).
    expect(findings.fitness).toBeLessThan(MIXING_STEP)
    expect(findings.within).toMatchObject({ zones: true, fitness: true })
  })

  it('has revision 7 `exclusive`, by the rule of 1.8: a consumer other than fitness is out of bound', () => {
    expect(study.decision).toEqual({ kind: 'exclusive', holdsBack: [] })
  })

  it('agrees with the table: the declared kind, holdsBack and moved readers are the study’s', () => {
    const declared = REVISIONS.at(-1)!
    expect(declared.revision).toBe(7)
    expect(declared.kind).toBe(study.decision.kind)
    expect(declared.holdsBack ?? []).toEqual(study.decision.holdsBack)
    // Every consumer the study found out of bound is named as moved.
    const named: Record<string, string[]> = {
      combine: ['combine'],
      trend: ['trend'],
      change: ['change'],
      records: ['records'],
    }
    for (const [consumer, ok] of Object.entries(study.findings.within)) {
      if (ok) continue
      for (const name of named[consumer] ?? []) expect(declared.affects, consumer).toContain(name)
    }
  })

  it('writes its findings where RCA_MIXING_REPORT says, for the PR', () => {
    const report = process.env.RCA_MIXING_REPORT
    if (report !== undefined) writeFileSync(report, JSON.stringify(study, null, 1))
    expect(study.results.map((result) => result.name)).toEqual([
      'season-a',
      'season-b',
      'hilly',
      'flat',
      'descent',
      'descent-small',
    ])
  })
})

describe('the rule of 1.8', () => {
  const quiet: Findings = {
    best: 0,
    trend: 0,
    referenceHrBpm: 0,
    threshold: 0,
    lean: 0,
    fitness: 0,
    fitnessStateChanges: 0,
    creditOffset: 0,
    creditOffsetStrict: 0,
    verdictAgreement: 1,
    verdictsAwayFromNone: 0,
    holdersAgreement: 1,
    within: { combine: true, trend: true, zones: true, fitness: true, change: true, records: true },
  }
  const failing = (...consumers: (keyof Findings['within'])[]): Findings => ({
    ...quiet,
    within: {
      ...quiet.within,
      ...Object.fromEntries(consumers.map((consumer) => [consumer, false])),
    },
  })

  it('is mixable when every output is within its bound', () => {
    expect(decide(quiet)).toEqual({ kind: 'mixable', holdsBack: [] })
  })

  it('is mixable holding fitness back when fitness alone fails', () => {
    expect(decide(failing('fitness'))).toEqual({ kind: 'mixable', holdsBack: ['fitness'] })
  })

  it.each(['combine', 'trend', 'zones', 'change', 'records'] as const)(
    'is exclusive when %s fails',
    (consumer) => {
      expect(decide(failing(consumer))).toEqual({ kind: 'exclusive', holdsBack: [] })
      expect(decide(failing('fitness', consumer))).toEqual({ kind: 'exclusive', holdsBack: [] })
    },
  )
})

describe('the partitions', () => {
  const six = [1, 2, 3, 4].map((n) => ({ id: `a${n}`, startMs: n, modelRevision: 6 }))
  const seven = [1, 2, 3, 4].map((n) => ({ id: `a${n}`, startMs: n, modelRevision: 7 }))
  const pairs = { six, seven } as unknown as Pairs
  const revisions = (side: 'newest' | 'oldest', k: number) =>
    mixed(pairs, side, k).map((digest) => digest.modelRevision)

  it('puts the newest k% on revision 7 and the rest on 6', () => {
    expect(revisions('newest', 50)).toEqual([6, 6, 7, 7])
    expect(revisions('newest', 25)).toEqual([6, 6, 6, 7])
  })

  it('puts the oldest k% on revision 7 and the rest on 6', () => {
    expect(revisions('oldest', 50)).toEqual([7, 7, 6, 6])
    expect(revisions('oldest', 75)).toEqual([7, 7, 7, 6])
  })
})
