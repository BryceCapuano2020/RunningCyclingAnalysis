import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { weeklyMarks } from './input'
import { registryOf } from './registry'
import { replay } from './replay'
import { dummyVolumeDetector } from './test/dummyDetector'
import {
  episodesOf,
  evidenceReaches,
  expectFinds,
  expectRegistrySilence,
  expectSilence,
  expectToleratesNuisance,
  quietShare,
  replayDetector,
  replayRegistry,
} from './test/harness'
import { gridAthleteYears, nullLibraries, nullLibrary } from './test/plantedLibrary'
import { stubCandidate, stubDetector } from './test/stubs'
import type { Candidate, Detector, FindingInput } from './types'

const WEEK_MS = 7 * DAY_MS
/** Each case replays libraries week by week, a few seconds idle and more on a loaded runner. */
const TIMEOUT_MS = 180_000

const volumeStep = (size: number) => ({
  weeks: 44,
  perWeek: 4,
  noise: 0.02,
  effects: [{ type: 'volume-step' as const, atWeek: 20, size }],
})
const FINDS = { seeds: 20, lagWeeks: 14, size: { relativeTolerance: 0.35 } }

/**
 * A detector that can only know a library was planted by looking at its data: it speaks, with the
 * `effect` it is told to, when the weekly time of the last 4 weeks is 30% above that of the first 8.
 * With it the harness's checks of sign, size and evidence can each be failed on purpose.
 */
function sensor(
  id: string,
  over: Partial<Candidate> | ((input: FindingInput) => Partial<Candidate>),
): Detector {
  return stubDetector(id, {
    kind: 'pattern',
    says: (input) => {
      const weeks = input.tables.weeklyMoving.run.filter((w) => w.complete)
      const recent = weeks.slice(-4)
      const early = weeks.slice(0, 8)
      if (recent.length < 4 || early.length < 8) return []
      const mean = (xs: typeof weeks) => xs.reduce((s, w) => s + w.seconds, 0) / xs.length
      if (!(mean(recent) > 1.3 * mean(early))) return []
      return [stubCandidate(typeof over === 'function' ? over(input) : over, input)]
    },
  })
}

describe('the harness, with a dummy detector of weekly time', () => {
  it(
    'finds a planted volume step in at least 90% of 20 seeds within 14 weeks, of the right sign and size',
    () => {
      const report = expectFinds(dummyVolumeDetector, volumeStep(0.6), { ...FINDS, sign: 1 })
      expect(report.rate).toBeGreaterThanOrEqual(0.9)
      expect(report.noisyNulls).toEqual([])
    },
    TIMEOUT_MS,
  )

  it('finds a drop in time as a fall of the planted size', () => {
    expectFinds(dummyVolumeDetector, volumeStep(-0.5), { ...FINDS, seeds: 10, sign: -1 })
  })

  it('is silent on null libraries of every size, and under a seasonal swing', () => {
    const report = expectSilence(dummyVolumeDetector, nullLibraries({ perCell: 2 }), {
      perAthleteYear: 0.05,
      minAthleteYears: 20,
    })
    expect(report.athleteYears).toBeCloseTo(gridAthleteYears(2), 9)
    expectSilence(dummyVolumeDetector, nullLibraries({ perCell: 1, nuisances: ['seasonal'] }), {
      perAthleteYear: 0.05,
      minAthleteYears: 10,
    })
  })

  it('does not find what was not planted', () => {
    expect(() =>
      expectFinds(
        dummyVolumeDetector,
        {
          weeks: 44,
          perWeek: 4,
          noise: 0.02,
          effects: [{ type: 'efficiency-shift', atWeek: 20, size: 0.08 }],
        },
        { ...FINDS, seeds: 5, sign: 1 },
      ),
    ).toThrow(/missed in/)
  })
})

describe('what expectFinds refuses', () => {
  const planted = volumeStep(0.6)
  const options = { seeds: 3, lagWeeks: 14, sign: 1 as const, size: { relativeTolerance: 0.35 } }

  it('accepts a detector that speaks of the plant, with the sign, the size and the evidence', () => {
    const good = sensor('good', (i) => ({
      effect: 0.6,
      evidence: [{ type: 'week', endMs: i.asOfMs }],
    }))
    expect(expectFinds(good, planted, options).rate).toBe(1)
  })

  it('refuses one that speaks all the time: the paired library, with nothing planted, makes it speak too', () => {
    const always = stubDetector('always', { kind: 'pattern' })
    expect(() => expectFinds(always, planted, options)).toThrow(/paired null spoke in 1,2,3/)
    const report = (() => {
      try {
        return expectFinds(always, planted, { ...options, minRate: 0 })
      } catch {
        return null
      }
    })()
    expect(report!.found).toEqual([])
    expect(report!.noisyNulls).toEqual([1, 2, 3])
  })

  it('refuses the wrong sign, a size far from the planted one, and evidence that stays before the plant', () => {
    const at = (over: Partial<Candidate>) => sensor('s', () => over)
    expect(() => expectFinds(at({ effect: -0.6 }), planted, options)).toThrow(/missed in 1,2,3/)
    expect(() => expectFinds(at({ effect: 0.1 }), planted, options)).toThrow(/missed in 1,2,3/)
    expect(() => expectFinds(at({ effect: 2 }), planted, options)).toThrow(/missed in 1,2,3/)
    expect(() =>
      expectFinds(at({ effect: 0.6, evidence: [{ type: 'week', endMs: 0 }] }), planted, options),
    ).toThrow(/missed in 1,2,3/)
    // Each is passed when the check is asked not to look, or looks at the unit the detector uses.
    expectFinds(at({ effect: 0.6, evidence: [{ type: 'week', endMs: 0 }] }), planted, {
      ...options,
      evidence: false,
    })
    expectFinds(at({ effect: 6 }), planted, {
      ...options,
      size: { relativeTolerance: 0.1, expected: (t) => 10 * t.realised },
    })
  })

  it('counts nothing said before the onset, and gives the lag in evaluations from the onset week', () => {
    const late = (after: number) =>
      stubDetector('late', {
        says: (input) =>
          input.asOfMs > input.digests[0]!.startMs + after * WEEK_MS
            ? [stubCandidate({ evidence: [{ type: 'week', endMs: input.asOfMs }] }, input)]
            : [],
      })
    // Speaks from week 21 on in any library: the paired library speaks, so it finds nothing.
    expect(() => expectFinds(late(21), planted, { ...options, seeds: 2 })).toThrow(/paired null/)
  })
})

describe('the harness checks itself', () => {
  const always = stubDetector('always', { kind: 'pattern', minHistoryWeeks: 4 })
  const library = nullLibrary({ seed: 1, weeks: 52, perWeek: 2 })
  const budget = { perAthleteYear: 0.05, minAthleteYears: 1 }

  it('fails a detector that speaks in a library where nothing changes', () => {
    expect(() => expectSilence(always, [library], budget)).toThrow(/findings in/)
    const report = expectSilence(always, [library], { ...budget, perAthleteYear: 5 })
    expect(report.episodes).toHaveLength(1)
    expect(report.rate).toBeCloseTo(1, 6)
  })

  it('fails a sweep too small to show what its budget says', () => {
    expect(() =>
      expectSilence(dummyVolumeDetector, [library], { ...budget, minAthleteYears: 2 }),
    ).toThrow(/athlete-years tested/)
    expectSilence(dummyVolumeDetector, [library], { ...budget, minAthleteYears: 1 })
  })

  it('fails a whole registry that speaks more than half a finding in a year, whatever each detector does', () => {
    const libs = nullLibraries({ perCell: 1 })
    expectRegistrySilence(registryOf([dummyVolumeDetector]), libs, { minAthleteYears: 10 })
    const noisy = registryOf([dummyVolumeDetector, always])
    expect(() => expectRegistrySilence(noisy, libs, { minAthleteYears: 10 })).toThrow(/findings in/)
    expect(() => expectRegistrySilence(noisy, libs, { minAthleteYears: 100 })).toThrow(
      /athlete-years tested/,
    )
    // Each library makes the always-speaking detector speak once: 9 in 3.5 years of 26, 52 and 104 weeks.
    expectRegistrySilence(noisy, libs, { minAthleteYears: 10, perAthleteYear: 1 })
  })

  it('fails a detector whose wording or numbers are dropped, rather than counting it quiet', () => {
    const rude = stubDetector('rude', {
      says: (input) => [stubCandidate({ headline: 'Your limiter is the hills.' }, input)],
    })
    expect(() => expectSilence(rude, [library], { ...budget, perAthleteYear: 5 })).toThrow()
    const future = stubDetector('future', {
      says: (input) => [stubCandidate({ asOfMs: input.asOfMs + 1 }, input)],
    })
    expect(() => expectSilence(future, [library], { ...budget, perAthleteYear: 5 })).toThrow()
  })

  it('under a nuisance, lets a finding speak only without a likely explanation and under the confidence cap', () => {
    const libs = nullLibraries({ perCell: 1, nuisances: ['strap-change'] })
    const nuisance = { perAthleteYear: 5, minAthleteYears: 10 }
    const capped = stubDetector('capped', {
      kind: 'pattern',
      says: (input) => [
        stubCandidate(
          {
            support: {
              sign: { kind: 'agree', share: 1 },
              n: 10,
              nNeeded: 10,
              robust: true,
              cap: 0.84,
            },
          },
          input,
        ),
      ],
    })
    expectToleratesNuisance(capped, libs, nuisance)
    expect(() => expectToleratesNuisance(always, libs, nuisance)).toThrow(/too sure/)
    expectToleratesNuisance(always, libs, { ...nuisance, maxConfidence: 1 })
    const explaining = stubDetector('explaining', {
      says: (input) => [
        stubCandidate(
          {
            support: {
              sign: { kind: 'agree', share: 1 },
              n: 10,
              nNeeded: 10,
              robust: true,
              cap: 0.84,
            },
            likelyCause: { text: 'weekly time rose first.', signals: ['volume'] },
          },
          input,
        ),
      ],
    })
    expect(() => expectToleratesNuisance(explaining, libs, nuisance)).toThrow(/explains/)
  })

  it('counts a run of weeks as one finding, a return as another only if it moved by half, and finds the quiet weeks', () => {
    const marks = weeklyMarks(library.digests)
    const gappy = (effects: (index: number) => number) =>
      registryOf([
        stubDetector('gappy', {
          says: (input) => {
            const index = marks.indexOf(input.asOfMs)
            return index % 10 < 6 ? [stubCandidate({ effect: effects(index) }, input)] : []
          },
        }),
      ])
    const steady = replay(library, marks.slice(0, 30), { registry: gappy(() => 0.05) })
    expect(episodesOf(steady.marks)).toHaveLength(1)
    expect(quietShare(steady.marks)).toBeCloseTo(29 / 30, 12)
    const moved = replay(library, marks.slice(0, 30), {
      registry: gappy((i) => (i < 10 ? 0.05 : 0.2)),
    })
    expect(episodesOf(moved.marks)).toHaveLength(2)
    const nearly = replay(library, marks.slice(0, 30), {
      registry: gappy((i) => (i < 10 ? 0.05 : 0.06)),
    })
    expect(episodesOf(nearly.marks)).toHaveLength(1)
    expect(quietShare([])).toBe(1)
  })

  it('replays one library with many detectors from the same tables', () => {
    const seen = new Set<FindingInput>()
    const watcher = stubDetector('watcher', { says: (input) => (seen.add(input), []) })
    const first = replayDetector(watcher, library, {})
    const count = seen.size
    expect(count).toBe(first.marks.length)
    replayDetector(watcher, library, {})
    replayRegistry(registryOf([watcher, always]), library, {})
    expect(seen.size).toBe(count)
    expect(
      replayDetector(always, library, { fromMs: library.firstMs + 40 * WEEK_MS }).marks.length,
    ).toBeLessThan(14)
  })

  it('reads evidence as reaching the planted activities by activity, week or stretch', () => {
    const truth = {
      effect: { type: 'break' as const, atWeek: 1, size: 1 },
      onsetMs: 1000,
      plantedIds: ['a'],
      realised: 1,
    }
    expect(evidenceReaches([{ type: 'activity', id: 'a' }], truth)).toBe(true)
    expect(evidenceReaches([{ type: 'activity', id: 'b' }], truth)).toBe(false)
    expect(evidenceReaches([{ type: 'week', endMs: 1000 }], truth)).toBe(true)
    expect(evidenceReaches([{ type: 'week', endMs: 999 }], truth)).toBe(false)
    expect(evidenceReaches([{ type: 'span', span: { fromMs: 0, toMs: 1500 } }], truth)).toBe(true)
  })
})
