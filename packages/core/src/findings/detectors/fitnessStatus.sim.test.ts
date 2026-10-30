import { describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '../../constants'
import { fitnessStatuses } from '../../fitness/compute'
import { expectFinds, expectSilence, expectToleratesNuisance } from '../test/harness'
import { nullLibraries, plantedLibrary } from '../test/plantedLibrary'
import type { NullGridOptions, Truth } from '../test/plantedLibrary'
import type { Detector } from '../types'
import { fitnessStatusDetector } from './fitnessStatus'

vi.setConfig({ testTimeout: 1_800_000 })

/**
 * The detector's acceptance grids, on the findings harness's digest-level libraries: three runs a week
 * (about 2.3 of them steady), run-to-run spread 3% with a slow wander (correlation 0.9) and heavy tails.
 * Planted sizes are efficiency at the same heart rate, of which the unit measures about 0.85 (the slope of
 * speed on heart rate is flatter than the physiological one when heart rate carries noise), and the wander
 * moves what is measured by a few per cent either way, so a size is held to within 60% of that.
 *
 * The harness is stricter than the research tests were in two ways, which is why the rates below sit under
 * the research's: a seed counts as missed when its paired library with nothing planted makes the detector
 * speak at all in the window (about a quarter of an alarm an athlete-year), and when an alarm before the
 * onset has already opened an episode, so that the drop is not a new one. fitness/monitor.sim.test.ts holds
 * the research's own bars on run-level series.
 */
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }
const WEEK = 7 * DAY_MS
const measured = (t: Truth) => 0.85 * Math.abs(Math.log(1 + t.realised))
const SIZE = { relativeTolerance: 0.6, expected: measured }
const planted = (size: number, perWeek = 3) => ({
  weeks: 130,
  perWeek,
  ...NOISE,
  effects: [{ type: 'efficiency-shift' as const, atWeek: 60, size }],
})

/** The detector keeping only one kind of finding, so a test can ask for "recovering" or "back" by name. */
const only = (subject: string): Detector => ({
  ...fitnessStatusDetector,
  run: (input, sport) =>
    fitnessStatusDetector.run(input, sport).filter((c) => c.subject === subject),
})
const detector = fitnessStatusDetector

describe('fitness status: early warning', () => {
  it('finds a drop of about 10% within 10 weeks, in 70% of seeds that also stay quiet unplanted', () => {
    expectFinds(detector, planted(-0.12), {
      seeds: 40,
      lagWeeks: 10,
      sign: -1,
      minRate: 0.75,
      size: SIZE,
    })
  })

  it('finds a drop of about 6% within 26 weeks, in 50%', () => {
    expectFinds(detector, planted(-0.075), {
      seeds: 40,
      lagWeeks: 26,
      sign: -1,
      minRate: 0.5,
      size: SIZE,
    })
  })

  it('finds a drop of about 10% within 20 weeks at one activity a week, in 60%', () => {
    expectFinds(detector, planted(-0.12, 1), {
      seeds: 40,
      lagWeeks: 20,
      sign: -1,
      minRate: 0.6,
      size: SIZE,
    })
  })

  it('finds a slide of 0.4% a week within 30 weeks, in 45%', () => {
    expectFinds(
      detector,
      { ...planted(0), effects: [{ type: 'efficiency-ramp', atWeek: 60, size: -0.004 }] },
      { seeds: 40, lagWeeks: 30, sign: -1, minRate: 0.45, size: { relativeTolerance: 0.8 } },
    )
  })
})

/**
 * The detector's confidence is its test statistic (a z of 3.3 or more held two weeks), so a false alarm
 * is as confident as a true one; what is bought is the rate, held to the budgets here. A strap change of
 * 6 bpm is a real 3 to 4% change in what the data show, so it may speak, and the text names no cause.
 */
const BUDGET = { minAthleteYears: 200, maxConfidence: 1 }

describe('fitness status: silence', () => {
  const grid = (nuisances: NullGridOptions['nuisances'] = []) =>
    nullLibraries({ perCell: 20, nuisances, ...NOISE })

  it('speaks under 0.2 findings an athlete-year when nothing changes', () => {
    expectSilence(detector, grid(), {
      perAthleteYear: detector.alarmBudget,
      minAthleteYears: 200,
    })
  })

  it('tolerates heart-rate spikes and missing heart rate', () => {
    expectToleratesNuisance(detector, grid(['hr-spikes']), { perAthleteYear: 0.2, ...BUDGET })
    expectToleratesNuisance(detector, grid(['missing-hr']), { perAthleteYear: 0.2, ...BUDGET })
  })

  it('stays under 0.5 through a strap change', () => {
    expectToleratesNuisance(detector, grid(['strap-change']), { perAthleteYear: 0.5, ...BUDGET })
  })

  it('stays under 0.65, over the 0.2 budget as a documented known gap, through a season of 3% swing', () => {
    expectToleratesNuisance(detector, grid(['seasonal']), { perAthleteYear: 0.65, ...BUDGET })
  })
})

describe('fitness status: recovery', () => {
  const dip = {
    weeks: 170,
    perWeek: 3,
    ...NOISE,
    effects: [
      { type: 'efficiency-shift' as const, atWeek: 60, size: -0.12 },
      { type: 'efficiency-shift' as const, atWeek: 100, size: 0.12 / 0.88 },
    ],
  }
  const ANY_SIZE = { relativeTolerance: 5 }

  it('says recovering within 12 weeks of an abrupt return, in 90%', () => {
    expectFinds(only('recovering'), dip, {
      seeds: 40,
      lagWeeks: 12,
      sign: 1,
      minRate: 0.9,
      truth: 1,
      size: ANY_SIZE,
    })
  })

  it('says recovering within 40 weeks of a return spread over a month, in 90%', () => {
    const gradual = {
      ...dip,
      effects: [
        dip.effects[0]!,
        ...[0, 7, 14, 21].map((k) => ({
          type: 'efficiency-shift' as const,
          atWeek: 100 + k,
          size: 0.0316,
        })),
      ],
    }
    expectFinds(only('recovering'), gradual, {
      seeds: 40,
      lagWeeks: 40,
      sign: 1,
      minRate: 0.9,
      truth: 1,
      size: ANY_SIZE,
    })
  })

  it('says back within 40 weeks of the return, in 70%', () => {
    expectFinds(only('back'), dip, {
      seeds: 40,
      lagWeeks: 40,
      sign: 1,
      minRate: 0.7,
      truth: 1,
      size: ANY_SIZE,
    })
  })

  it('rarely says back or recovering when the level stays down: 15% within a year, 25% within 2.5 years', () => {
    const seeds = 40
    const inYear = { back: 0, recovering: 0 }
    const overall = { back: 0, recovering: 0 }
    for (let seed = 1; seed <= seeds; seed++) {
      const library = plantedLibrary({ seed, ...planted(-0.12), weeks: 190 })
      const onset = library.truths[0]!.onsetMs
      const seen = { year: new Set<string>(), all: new Set<string>() }
      for (let week = 6; week <= 130; week++) {
        const asOfMs = onset + week * WEEK
        const { state } = fitnessStatuses(
          library.digests.filter((d) => d.startMs <= asOfMs),
          new Set(),
          { asOfMs },
        ).run
        seen.all.add(state)
        if (week <= 58) seen.year.add(state)
      }
      for (const kind of ['back', 'recovering'] as const) {
        if (seen.year.has(kind)) inYear[kind]++
        if (seen.all.has(kind)) overall[kind]++
      }
    }
    // Observed over 40 libraries: back 1 in a year and 1 over 2.5 years; recovering 5 in a year (12.5%), 9 over 2.5 years (22.5%).
    expect(inYear.back / seeds).toBeLessThanOrEqual(0.05)
    expect(overall.back / seeds).toBeLessThanOrEqual(0.1)
    expect(inYear.recovering / seeds).toBeLessThanOrEqual(0.15)
    expect(overall.recovering / seeds).toBeLessThanOrEqual(0.25)
  })
})

describe('fitness status: improving', () => {
  const rise = (size: number, seed: number) =>
    plantedLibrary({
      seed,
      weeks: 120,
      perWeek: 3,
      ...NOISE,
      effects: [{ type: 'efficiency-shift', atWeek: 70, size }],
    })

  /** The status week by week from `from` to `to` weeks after the library began. */
  const states = (library: ReturnType<typeof rise>, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => {
      const asOfMs = library.firstMs + (from + i) * WEEK + 6 * DAY_MS
      return fitnessStatuses(
        library.digests.filter((d) => d.startMs <= asOfMs),
        new Set(),
        { asOfMs },
      ).run.state
    })

  it('is said falsely less than once in four athlete-years (observed 8 in 83 years, 0.10)', () => {
    let episodes = 0
    let years = 0
    for (const library of nullLibraries({ perCell: 8, ...NOISE })) {
      const weeks = Math.round((library.lastMs - library.firstMs) / WEEK)
      years += weeks / 52
      let before = ''
      for (const state of states(library, 10, weeks)) {
        if (state === 'improving' && before !== 'improving') episodes++
        before = state
      }
    }
    expect(years).toBeGreaterThan(70)
    expect(episodes / years).toBeLessThanOrEqual(0.25)
  })

  it('is said within 10 weeks of a real rise of 12% in 75% of libraries (observed 25 of 30), without a slip', () => {
    let said = 0
    const seeds = 30
    let slipped = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const library = rise(0.12, seed)
      const after = states(library, 70, 80)
      if (after.includes('improving')) said++
      if (after.includes('slipping')) slipped++
    }
    expect(said / seeds).toBeGreaterThanOrEqual(0.75)
    expect(slipped).toBeLessThanOrEqual(2)
  })

  it('is never said after a dip is back and its episode has closed, while the dip is in the weeks compared with', () => {
    let reachedBack = 0
    let improving = 0
    for (let seed = 1; seed <= 30; seed++) {
      const library = plantedLibrary({
        seed,
        weeks: 190,
        perWeek: 3,
        ...NOISE,
        effects: [
          { type: 'efficiency-shift', atWeek: 60, size: -0.12 },
          { type: 'efficiency-shift', atWeek: 100, size: 0.12 / 0.88 },
        ],
      })
      const after = states(library, 100, 175)
      const back = after.indexOf('back')
      if (back < 0) continue
      reachedBack++
      // From the first back on, 36 weeks and more: the episode closes after 12 weeks, the dip leaves the window after 44.
      if (after.slice(back).includes('improving')) improving++
    }
    // Observed: 27 of 30 libraries reach back inside the window, and none say improving afterwards (20 of the 27 did before
    // the closed episode was remembered).
    expect(reachedBack).toBeGreaterThanOrEqual(15)
    expect(improving).toBe(0)
  })
})
