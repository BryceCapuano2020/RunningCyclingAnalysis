import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { sameHeartRate } from '../digest/sameHeartRate'
import { driftTrend } from '../digest/driftTrend'
import { weekEndMs } from '../digest/trendPoints'
import type { ActivityDigest } from '../types'
import { median } from './stats'
import { bpmForEfficiency } from './test/plantedActivity'
import { gridAthleteYears, nullLibraries, nullLibrary, plantedLibrary } from './test/plantedLibrary'
import type { PlantedLibrary, PlantedSpec } from './test/plantedLibrary'

const WEEK_MS = 7 * DAY_MS
const BASE: PlantedSpec = { seed: 1, weeks: 40, perWeek: 4, noise: 0.02, effects: [] }
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

/** The digests of one kind of session ("easy run"), before and from the planted onset. */
function split(lib: PlantedLibrary, name: string) {
  const onset = lib.truths[0]!.onsetMs
  const kind = lib.digests.filter((d) => d.name === name)
  return {
    before: kind.filter((d) => d.startMs < onset),
    after: kind.filter((d) => d.startMs >= onset),
  }
}

/** Output at the reference heart rate, first and last reported week. */
function sameHrChange(lib: PlantedLibrary): number {
  const { run } = sameHeartRate(lib.digests, new Set(), {})
  const weeks = run.weeks.filter((w) => w.fit !== null)
  return weeks.at(-1)!.fit!.output / weeks[0]!.fit!.output - 1
}

describe('plantedLibrary', () => {
  it('is the same for the same spec, and an effect only touches what it plants', () => {
    const a = plantedLibrary(BASE)
    expect(plantedLibrary(BASE).digests).toEqual(a.digests)
    const shifted = plantedLibrary({
      ...BASE,
      effects: [{ type: 'efficiency-shift', atWeek: 20, size: 0.05 }],
    })
    const before = a.digests.filter((d) => d.startMs < shifted.truths[0]!.onsetMs)
    expect(shifted.digests.slice(0, before.length)).toEqual(before)
    expect(shifted.digests).toHaveLength(a.digests.length)
    expect(shifted.truths[0]!.plantedIds).toHaveLength(a.digests.length - before.length)
  })

  it('has the shape of a digest the findings read: blocks, splits, distributions, durability, drift', () => {
    const run = plantedLibrary(BASE).digests
    const long = run.find((d) => d.name === 'long run')!
    expect(run[0]!.name).toBe('easy run')
    expect(run[0]!.hrBlocks).toHaveLength(5)
    expect(run[0]!.splits!.km.length).toBeGreaterThan(5)
    expect(run[0]!.distributions!.heartRate!.counts.length).toBeGreaterThan(10)
    expect(long.durability!.length).toBeGreaterThan(0)
    expect(long.drift!.secondRatio).toBeLessThan(long.drift!.firstRatio)
    expect(run.every((d) => d.avgHeartRate! > 100 && d.avgHeartRate! < 190)).toBe(true)
    const seconds = run[0]!.distributions!.heartRate!.counts.reduce((s, v) => s + v, 0)
    expect(Math.abs(seconds - run[0]!.movingS!)).toBeLessThan(10)
  })

  it('has hard and long sessions however few a week, and the same mix of kinds', () => {
    for (const perWeek of [1, 2, 3, 4, 8]) {
      const lib = plantedLibrary({ ...BASE, perWeek, weeks: 24 })
      const kinds = new Set(lib.digests.map((d) => d.name))
      expect(kinds, `${perWeek} a week`).toEqual(new Set(['easy run', 'hard run', 'long run']))
      const long = lib.digests.filter((d) => d.name === 'long run').length / lib.digests.length
      expect(long).toBeCloseTo(0.25, 1)
    }
    // Long runs are the only ones long enough for drift and durability after an hour.
    const one = plantedLibrary({ ...BASE, perWeek: 1, weeks: 52 })
    expect(driftTrend(one.digests, 'run').length).toBeGreaterThanOrEqual(13)
  })

  describe('pins the size it plants', () => {
    it('efficiency-shift: the same-heart-rate fit moves by the size, to a fifth of a point without noise', () => {
      const lib = plantedLibrary({
        ...BASE,
        noise: 0,
        effects: [{ type: 'efficiency-shift', atWeek: 20, size: 0.06 }],
      })
      expect(lib.truths[0]!.realised).toBe(0.06)
      expect(sameHrChange(lib)).toBeCloseTo(0.06, 2)
      expect(Math.abs(sameHrChange(lib) - 0.06)).toBeLessThan(0.002)
      const noisy = plantedLibrary({
        ...BASE,
        effects: [{ type: 'efficiency-shift', atWeek: 20, size: 0.06 }],
      })
      expect(Math.abs(sameHrChange(noisy) - 0.06)).toBeLessThan(0.015)
    })

    it('efficiency-shift: heart rate at a pace falls by bpmForEfficiency, in both sports', () => {
      for (const sport of ['run', 'ride'] as const) {
        const lib = plantedLibrary({
          ...BASE,
          sports: [sport],
          noise: 0,
          effects: [{ type: 'efficiency-shift', atWeek: 20, size: 0.05 }],
        })
        const easy = split(lib, `easy ${sport}`)
        const expected = bpmForEfficiency(sport, 'easy', 0.05)
        expect(expected).toBeGreaterThan(sport === 'run' ? 3 : 1.5)
        expect(
          mean(easy.before.map((d) => d.avgHeartRate!)) -
            mean(easy.after.map((d) => d.avgHeartRate!)),
        ).toBeGreaterThan(expected - 0.6)
        expect(
          mean(easy.before.map((d) => d.avgHeartRate!)) -
            mean(easy.after.map((d) => d.avgHeartRate!)),
        ).toBeLessThan(expected + 0.6)
      }
      expect(bpmForEfficiency('run', 'easy', 0.01)).toBeCloseTo(1.3366, 3)
      expect(bpmForEfficiency('ride', 'easy', 0.01)).toBeCloseTo(0.7426, 3)
    })

    it('efficiency-ramp: grows by the size each week, and its realised size is the height at the end', () => {
      const lib = plantedLibrary({
        ...BASE,
        weeks: 50,
        noise: 0,
        effects: [{ type: 'efficiency-ramp', atWeek: 10, size: 0.005 }],
      })
      expect(lib.truths[0]!.realised).toBeCloseTo(0.2, 12)
      const { run } = sameHeartRate(lib.digests, new Set(), {})
      const at = (week: number) =>
        run.weeks.find((w) => w.endMs === weekEndMs(lib.firstMs + week * WEEK_MS))!.fit!.output
      // 8 weeks of ramp is 4%, read through a 28-day window that smooths it, to a fifth of a point.
      expect(at(40) / at(32) - 1).toBeGreaterThan(0.035)
      expect(at(40) / at(32) - 1).toBeLessThan(0.055)
      // Ramps add: one up and a steeper one down make a tent, a reversal.
      const tent = plantedLibrary({
        ...BASE,
        weeks: 60,
        noise: 0,
        effects: [
          { type: 'efficiency-ramp', atWeek: 10, size: 0.005 },
          { type: 'efficiency-ramp', atWeek: 35, size: -0.01 },
        ],
      })
      const tentAt = (week: number) =>
        sameHeartRate(tent.digests, new Set(), {}).run.weeks.find(
          (w) => w.endMs === weekEndMs(tent.firstMs + week * WEEK_MS),
        )!.fit!.output
      // Up for 25 weeks, then down twice as steeply: the top is at week 35.
      expect(tentAt(34)).toBeGreaterThan(tentAt(20))
      expect(tentAt(34)).toBeGreaterThan(tentAt(55))
      expect(tentAt(55)).toBeLessThan(tentAt(45))
    })

    it('volume-step: every kind of session is longer by the size', () => {
      const lib = plantedLibrary({
        ...BASE,
        effects: [{ type: 'volume-step', atWeek: 20, size: 0.5 }],
      })
      expect(lib.truths[0]!.realised).toBe(0.5)
      for (const name of ['easy run', 'hard run', 'long run']) {
        const { before, after } = split(lib, name)
        const ratio = mean(after.map((d) => d.movingS!)) / mean(before.map((d) => d.movingS!))
        expect(Math.abs(ratio - 1.5), name).toBeLessThan(0.07)
      }
    })

    it('break: no activity in the weeks, exactly, and the onset is when it ends', () => {
      const lib = plantedLibrary({ ...BASE, effects: [{ type: 'break', atWeek: 10, size: 3 }] })
      const weeks = new Set(lib.digests.map((d) => Math.floor((d.startMs - lib.firstMs) / WEEK_MS)))
      expect([10, 11, 12].some((w) => weeks.has(w))).toBe(false)
      expect([9, 13].every((w) => weeks.has(w))).toBe(true)
      expect(lib.digests).toHaveLength(plantedLibrary(BASE).digests.length - 12)
      expect(lib.truths[0]!.onsetMs).toBe(lib.firstMs + 13 * WEEK_MS)
      expect(lib.truths[0]!.realised).toBe(3)
    })

    it('hr-coverage: about the share from the week on lose heart rate, and the truth says how many', () => {
      const lib = plantedLibrary({
        ...BASE,
        effects: [{ type: 'hr-coverage', atWeek: 20, size: 0.5 }],
      })
      const after = lib.digests.filter((d) => d.startMs >= lib.truths[0]!.onsetMs)
      const share = after.filter((d) => !d.hasHeartRate).length / after.length
      expect(lib.truths[0]!.realised).toBe(share)
      expect(Math.abs(share - 0.5)).toBeLessThan(0.1)
      expect(
        lib.digests.filter((d) => d.startMs < lib.truths[0]!.onsetMs).every((d) => d.hasHeartRate),
      ).toBe(true)
      expect(
        after
          .filter((d) => !d.hasHeartRate)
          .every((d) => d.hrBlocks.length === 0 && d.avgHeartRate === null),
      ).toBe(true)
    })

    it('easy-hr-creep: the easy sessions are run the planted bpm harder, and only the easy ones', () => {
      const lib = plantedLibrary({
        ...BASE,
        effects: [{ type: 'easy-hr-creep', atWeek: 20, size: 8 }],
      })
      const rise = (name: string) => {
        const { before, after } = split(lib, name)
        return mean(after.map((d) => d.avgHeartRate!)) - mean(before.map((d) => d.avgHeartRate!))
      }
      expect(Math.abs(rise('easy run') - 8)).toBeLessThan(1)
      expect(Math.abs(rise('hard run'))).toBeLessThan(1.5)
      expect(Math.abs(rise('long run'))).toBeLessThan(1.5)
    })

    it('decoupling-change: long efforts lose the planted points more, from the week on', () => {
      const lib = plantedLibrary({
        ...BASE,
        effects: [{ type: 'decoupling-change', atWeek: 20, size: 0.03 }],
      })
      const onset = lib.truths[0]!.onsetMs
      const points = driftTrend(lib.digests, 'run')
      const before = points.filter((p) => p.startMs < onset).map((p) => p.decouplingPct)
      const after = points.filter((p) => p.startMs >= onset).map((p) => p.decouplingPct)
      expect(Math.abs(mean(after) - mean(before) - 3)).toBeLessThan(1)
      expect(Math.abs(mean(before) - 4)).toBeLessThan(1)
    })

    it('late-retention-change: the share of fresh output kept after an hour is lower by the planted points', () => {
      const lib = plantedLibrary({
        ...BASE,
        effects: [{ type: 'late-retention-change', atWeek: 20, size: -0.08 }],
      })
      const retention = (list: ActivityDigest[]) =>
        mean(
          list.flatMap((d) => {
            const fresh = d.curve.find((p) => p.durationS === 300)!.value
            const late = d.durability!.find((p) => p.afterS === 3600 && p.durationS === 300)
            return late === undefined ? [] : [late.value / fresh]
          }),
        )
      const { before, after } = split(lib, 'long run')
      expect(Math.abs(retention(after) - retention(before) + 0.08)).toBeLessThan(0.02)
    })

    it.each([1, 2, 4, 8])(
      'sport-share-shift: moves the share of sessions by the size at %d a week, without changing the kinds',
      (perWeek) => {
        const lib = plantedLibrary({
          ...BASE,
          perWeek,
          weeks: 60,
          sports: ['run', 'ride'],
          effects: [{ type: 'sport-share-shift', atWeek: 30, size: 0.25 }],
        })
        const onset = lib.truths[0]!.onsetMs
        const share = (after: boolean) => {
          const group = lib.digests.filter((d) => d.startMs >= onset === after)
          return group.filter((d) => d.sport === 'run').length / group.length
        }
        expect(Math.abs(share(false) - 0.5)).toBeLessThan(0.04)
        expect(Math.abs(share(true) - 0.75)).toBeLessThan(0.04)
        expect(lib.truths[0]!.realised).toBeCloseTo(share(true) - share(false), 12)
        expect(Math.abs(lib.truths[0]!.realised - 0.25)).toBeLessThan(0.06)
        // A sport's kinds do not depend on how many of the sessions it gets.
        const kinds = (sport: string, after: boolean) => {
          const mine = lib.digests.filter((d) => d.sport === sport && d.startMs >= onset === after)
          return ['easy', 'hard', 'long'].map(
            (k) => mine.filter((d) => d.name === `${k} ${sport}`).length / mine.length,
          )
        }
        for (const sport of ['run', 'ride']) {
          for (const [i, k] of kinds(sport, false).entries()) {
            expect(Math.abs(k - kinds(sport, true)[i]!), `${sport} ${i}`).toBeLessThan(0.12)
          }
        }
        expect(
          lib.digests.every((d) => (d.sport === 'ride' ? d.powerSource === 'measured' : true)),
        ).toBe(true)
      },
    )
  })

  it('wanders from week to week when asked, and has heavy tails when asked', () => {
    // The level of each ride, read back from its blocks (watts over the model's watts at that heart rate).
    const level = (lib: PlantedLibrary) =>
      lib.digests.map((d) => mean(d.hrBlocks.map((b) => b.value / (180 + 2 * (b.heartRate - 145)))))
    const weekly = (xs: number[]) =>
      Array.from({ length: xs.length / 4 }, (_, w) => mean(xs.slice(4 * w, 4 * w + 4)))
    const lag1 = (xs: number[]) => {
      const m = mean(xs)
      let num = 0
      let den = 0
      for (const [i, x] of xs.entries()) {
        den += (x - m) ** 2
        if (i > 0) num += (x - m) * (xs[i - 1]! - m)
      }
      return num / den
    }
    const kurtosis = (xs: number[]) => {
      const m = mean(xs)
      const v = mean(xs.map((x) => (x - m) ** 2))
      return mean(xs.map((x) => (x - m) ** 4)) / v ** 2
    }
    const ride = { ...BASE, weeks: 200, sports: ['ride' as const] }
    const plain = level(plantedLibrary(ride))
    const wandering = level(plantedLibrary({ ...ride, noiseModel: { autocorrelation: 0.8 } }))
    const heavy = level(plantedLibrary({ ...ride, noiseModel: { heavyTails: true } }))
    expect(Math.abs(lag1(weekly(plain)))).toBeLessThan(0.15)
    expect(lag1(weekly(wandering))).toBeGreaterThan(0.45)
    expect(kurtosis(plain)).toBeLessThan(4)
    expect(kurtosis(heavy)).toBeGreaterThan(6)
  })
})

describe('nullLibrary nuisances', () => {
  const spec = { seed: 3, weeks: 52, perWeek: 4 }
  const half = 26 * WEEK_MS

  it('shifts the strap by 6 bpm and the meter by 4% in the middle, and the zones to a lower reference', () => {
    const strap = nullLibrary({ ...spec, weeks: 156, nuisances: ['strap-change'] })
    const hr = (lib: PlantedLibrary, late: boolean) =>
      mean(
        lib.digests
          .filter((d) => d.startMs >= lib.firstMs + 78 * WEEK_MS === late && d.name === 'easy run')
          .map((d) => d.avgHeartRate!),
      )
    expect(Math.abs(hr(strap, true) - hr(strap, false) - 6)).toBeLessThan(0.6)

    const meter = nullLibrary({ ...spec, sports: ['ride'], nuisances: ['meter-change'] })
    const power = (late: boolean) =>
      mean(
        meter.digests
          .filter((d) => d.startMs > meter.firstMs + half === late)
          .map((d) => d.hrBlocks[2]!.value / (180 + 2 * (d.hrBlocks[2]!.heartRate - 145))),
      )
    expect(Math.abs(power(true) / power(false) - 1.04)).toBeLessThan(0.012)

    const zones = nullLibrary({ ...spec, nuisances: ['zone-change'] })
    const refs = new Set(zones.zones.activities.map((a) => a.zoneReferenceBpm))
    expect([...refs].sort()).toEqual([165, 175])
    expect(new Set(nullLibrary(spec).zones.activities.map((a) => a.zoneReferenceBpm)).size).toBe(1)
  })

  it('adds spikes, duplicates and missing heart rate at their rates, and a seasonal swing', () => {
    const plain = nullLibrary({ ...spec, weeks: 104 })
    const big = { ...spec, weeks: 104 }
    const dup = nullLibrary({ ...big, nuisances: ['duplicates'] })
    const duplicates = dup.digests.filter((d) => d.id.endsWith('-dup')).length
    expect(Math.abs(duplicates / plain.digests.length - 0.05)).toBeLessThan(0.025)
    const missing = nullLibrary({ ...big, nuisances: ['missing-hr'] })
    expect(
      Math.abs(
        missing.digests.filter((d) => !d.hasHeartRate).length / missing.digests.length - 0.3,
      ),
    ).toBeLessThan(0.06)
    const spikes = nullLibrary({ ...big, nuisances: ['hr-spikes'] })
    const spiked = spikes.digests.filter(
      (d, i) => d.avgHeartRate! > plain.digests[i]!.avgHeartRate! + 8,
    ).length
    expect(Math.abs(spiked / plain.digests.length - 0.05)).toBeLessThan(0.03)
    const seasonal = nullLibrary({ ...spec, nuisances: ['seasonal'] })
    const fits = sameHeartRate(seasonal.digests, new Set(), {})
      .run.weeks.filter((w) => w.fit)
      .map((w) => w.fit!.output)
    expect(Math.max(...fits) / Math.min(...fits)).toBeGreaterThan(1.04)
  })
})

describe('nullLibraries', () => {
  it('makes perCell libraries at each size of the grid, each with a seed of its own', () => {
    const libs = nullLibraries({ perCell: 2 })
    expect(libs).toHaveLength(18)
    const seeds = libs.map((l) => l.spec.seed)
    expect(new Set(seeds).size).toBe(18)
    expect(libs.reduce((total, l) => total + l.spec.weeks, 0) / 52).toBeCloseTo(
      gridAthleteYears(2),
      9,
    )
    expect(gridAthleteYears(1)).toBeCloseTo((3 * (26 + 52 + 104)) / 52, 12)
  })

  it('does not nest a short library in a long one: the same week of two sizes draws different noise', () => {
    const [short, long] = nullLibraries({ perCell: 1 }).filter(
      (l) => l.spec.perWeek === 4 && l.spec.weeks >= 26,
    )
    expect(short!.spec.seed).not.toBe(long!.spec.seed)
    expect(short!.digests[0]!.avgHeartRate).not.toBe(long!.digests[0]!.avgHeartRate)
    expect(median(short!.digests.slice(0, 12).map((d) => d.avgHeartRate!))).not.toBe(
      median(long!.digests.slice(0, 12).map((d) => d.avgHeartRate!)),
    )
  })

  it('carries the noise model and nuisances to every library', () => {
    const libs = nullLibraries({
      perCell: 1,
      nuisances: ['seasonal'],
      noiseModel: { heavyTails: true },
    })
    expect(
      libs.every((l) => l.spec.nuisances?.[0] === 'seasonal' && l.spec.noiseModel?.heavyTails),
    ).toBe(true)
  })
})
