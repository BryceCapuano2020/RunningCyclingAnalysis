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
      minRate: 0.7,
      size: SIZE,
    })
  })

  it('finds a drop of about 6% within 26 weeks, in 45%', () => {
    expectFinds(detector, planted(-0.075), {
      seeds: 40,
      lagWeeks: 26,
      sign: -1,
      minRate: 0.45,
      size: SIZE,
    })
  })

  it('finds a drop of about 10% within 20 weeks at one activity a week, in 55%', () => {
    expectFinds(detector, planted(-0.12, 1), {
      seeds: 40,
      lagWeeks: 20,
      sign: -1,
      minRate: 0.55,
      size: SIZE,
    })
  })

  it('finds a slide of 0.4% a week within 30 weeks, in 40%', () => {
    expectFinds(
      detector,
      { ...planted(0), effects: [{ type: 'efficiency-ramp', atWeek: 60, size: -0.004 }] },
      { seeds: 40, lagWeeks: 30, sign: -1, minRate: 0.4, size: { relativeTolerance: 0.8 } },
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

  it('speaks under 0.4 findings an athlete-year when nothing changes', () => {
    expectSilence(detector, grid(), { perAthleteYear: 0.4, minAthleteYears: 200 })
  })

  it('tolerates heart-rate spikes and missing heart rate', () => {
    expectToleratesNuisance(detector, grid(['hr-spikes']), { perAthleteYear: 0.4, ...BUDGET })
    expectToleratesNuisance(detector, grid(['missing-hr']), { perAthleteYear: 0.4, ...BUDGET })
  })

  it('stays under 0.6 through a strap change', () => {
    expectToleratesNuisance(detector, grid(['strap-change']), { perAthleteYear: 0.6, ...BUDGET })
  })

  it('stays under 0.8, over the 0.4 budget and documented, through a season of 3% swing', () => {
    expectToleratesNuisance(detector, grid(['seasonal']), { perAthleteYear: 0.8, ...BUDGET })
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

  it('says recovering within 12 weeks of the return, in 60%', () => {
    expectFinds(only('recovering'), dip, {
      seeds: 40,
      lagWeeks: 12,
      sign: 1,
      minRate: 0.6,
      truth: 1,
      size: ANY_SIZE,
    })
  })

  it('says back within 40 weeks of the return, in 65%', () => {
    expectFinds(only('back'), dip, {
      seeds: 40,
      lagWeeks: 40,
      sign: 1,
      minRate: 0.65,
      truth: 1,
      size: ANY_SIZE,
    })
  })

  it('rarely says back (the research saw up to 1 in 10) or, in under 55% in the first year, recovering when the level stays down', () => {
    const seeds = 40
    let backs = 0
    let recoveries = 0
    for (let seed = 1; seed <= seeds; seed++) {
      const library = plantedLibrary({ seed, ...planted(-0.12), weeks: 170 })
      const onset = library.truths[0]!.onsetMs
      const states = new Set<string>()
      for (let week = 6; week <= 58; week++) {
        const asOfMs = onset + week * WEEK
        const status = fitnessStatuses(
          library.digests.filter((d) => d.startMs <= asOfMs),
          new Set(),
          { asOfMs },
        ).run
        states.add(status.state)
      }
      if (states.has('back')) backs++
      if (states.has('recovering')) recoveries++
    }
    expect(backs / seeds).toBeLessThanOrEqual(0.1)
    // This is the weakest claim of the monitor: with the harness's wander of about 2.5% (a little over the research's 2%)
    // and no sensor noise, 18 of 40 libraries (45%) are called recovering at some point in the year after a loss that
    // stays. The run-level grids show 30%; the research measured 28% over 2.4 years.
    expect(recoveries / seeds).toBeLessThan(0.55)
  })
})
