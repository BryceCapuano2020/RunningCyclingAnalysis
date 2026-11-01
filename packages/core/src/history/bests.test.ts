import { describe, expect, it } from 'vitest'
import { METRES_PER_KM, METRES_PER_MILE } from '../units/convert'
import { HALF_MARATHON_M, MARATHON_M } from '../constants'
import { historyOf } from './compute'
import { EASY_BPM, HARD_BPM, INPUT, UNJUDGED, at, rideDigest, runDigest } from './test/digests'

const bestsOf = (digests: Parameters<typeof historyOf>[0], input = INPUT) =>
  historyOf(digests, input).bests

const FIVE_K = 5 * METRES_PER_KM

describe('run bests by year', () => {
  it('is the least time over each distance in each year, oldest year first, and leaves out a distance never run', () => {
    const { run } = bestsOf([
      runDigest('a', at(2022), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: 1500 }] }),
      runDigest('b', at(2021), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: 1600 }] }),
      runDigest(
        'c',
        at(2022, 9),
        {},
        {
          distanceBests: [
            { distanceM: FIVE_K, seconds: 1480 },
            { distanceM: 10 * METRES_PER_KM, seconds: 3200 },
          ],
        },
      ),
    ])
    expect(run.map((effort) => effort.length)).toEqual([FIVE_K, 10 * METRES_PER_KM])
    expect(run[0]!.years.map(([year, seconds]) => [year, seconds])).toEqual([
      [2021, 1600],
      [2022, 1480],
    ])
    expect(run[1]!.years.map(([year]) => year)).toEqual([2022])
  })

  it('charts the mile, 5 km, 10 km, half marathon and marathon, and not the kilometre', () => {
    const distances = [
      METRES_PER_KM,
      METRES_PER_MILE,
      FIVE_K,
      10 * METRES_PER_KM,
      HALF_MARATHON_M,
      MARATHON_M,
    ]
    const { run } = bestsOf([
      runDigest(
        'a',
        at(2022),
        {},
        { distanceBests: distances.map((distanceM) => ({ distanceM, seconds: distanceM / 3 })) },
      ),
    ])
    expect(run.map((effort) => effort.length)).toEqual(distances.slice(1))
  })

  it('gives a tie to the earlier run and keeps a time the digest could not read out', () => {
    const { run } = bestsOf([
      runDigest(
        'late',
        at(2022, 8),
        {},
        { distanceBests: [{ distanceM: FIVE_K, seconds: 1100 }], maxHeartRate: EASY_BPM },
      ),
      runDigest(
        'early',
        at(2022, 2),
        {},
        { distanceBests: [{ distanceM: FIVE_K, seconds: 1100 }], maxHeartRate: HARD_BPM },
      ),
      runDigest('lost', at(2022, 3), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: NaN }] }),
    ])
    // The earlier run holds it, and it was hard.
    expect(run[0]!.years).toEqual([[2022, 1100, true, false]])
  })

  it('leaves out an indoor run, which holds no best', () => {
    const { run } = bestsOf([
      runDigest(
        'belt',
        at(2022),
        {},
        { indoor: true, distanceBests: [{ distanceM: FIVE_K, seconds: 900 }] },
      ),
      runDigest('road', at(2022, 7), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: 1500 }] }),
    ])
    expect(run[0]!.years.map(([, seconds]) => seconds)).toEqual([1500])
    expect(
      bestsOf([
        runDigest(
          'belt',
          at(2022),
          {},
          { indoor: true, distanceBests: [{ distanceM: FIVE_K, seconds: 900 }] },
        ),
      ]).run,
    ).toEqual([])
  })

  it('counts a run on the athlete’s own day, so New Year’s Eve at night is the next year’s', () => {
    const { run } = bestsOf([
      {
        ...runDigest(
          'a',
          Date.UTC(2021, 11, 31, 23),
          {},
          { distanceBests: [{ distanceM: FIVE_K, seconds: 1500 }] },
        ),
        localDayShift: 1,
      },
    ])
    expect(run[0]!.years[0]![0]).toBe(2022)
  })

  it('draws a best hollow unless heart rate shows it was hard', () => {
    const five = (id: string, year: number, fields: Parameters<typeof runDigest>[3]) =>
      runDigest(
        id,
        at(year),
        {},
        { distanceBests: [{ distanceM: FIVE_K, seconds: 1100 }], ...fields },
      )
    const hardOf = (digests: Parameters<typeof historyOf>[0], input = INPUT) =>
      bestsOf(digests, input).run[0]!.years.map(([, , hard]) => hard)
    const library = [
      five('hard', 2020, { maxHeartRate: HARD_BPM }),
      five('easy', 2021, { maxHeartRate: EASY_BPM }),
      five('none', 2022, { maxHeartRate: null }),
    ]
    expect(hardOf(library)).toEqual([true, false, false])
    // A peak held for a few seconds is a spike, not a hard effort.
    expect(hardOf([five('spike', 2020, { maxHeartRate: HARD_BPM, secondsAtPeak: 20 })])).toEqual([
      false,
    ])
    // The same peak, its heart rate set aside: not judged, so hollow.
    expect(hardOf(library, { ...INPUT, setAside: new Set(['hard']) })).toEqual([
      false,
      false,
      false,
    ])
    // No reference to judge by: nothing is shown hard, and nothing is withheld.
    expect(hardOf(library, UNJUDGED)).toEqual([false, false, false])
    expect(bestsOf(library, UNJUDGED).run[0]!.years).toHaveLength(3)
  })

  it('judges a long best by the whole run’s average heart rate', () => {
    const half = (average: number) =>
      bestsOf([
        runDigest(
          'a',
          at(2022),
          {},
          {
            distanceBests: [{ distanceM: HALF_MARATHON_M, seconds: 6000 }],
            maxHeartRate: HARD_BPM,
            avgHeartRate: average,
          },
        ),
      ]).run[0]!.years[0]![2]
    expect(half(170)).toBe(true)
    expect(half(120)).toBe(false)
  })
})

describe('ride bests by year', () => {
  it('is the year’s best power at 5, 20 and 60 minutes, from its best curve', () => {
    const { ride } = bestsOf([
      rideDigest('a', at(2020), { 300: 300, 1200: 250, 3600: 220 }),
      rideDigest('b', at(2020, 9), { 300: 280, 1200: 260 }),
      rideDigest('c', at(2022), { 300: 310, 1200: 255, 3600: 215 }),
    ])
    expect(ride.map((effort) => effort.length)).toEqual([300, 1200, 3600])
    const pick = (length: number) =>
      ride.find((effort) => effort.length === length)!.years.map(([year, watts]) => [year, watts])
    expect(pick(300)).toEqual([
      [2020, 300],
      [2022, 310],
    ])
    expect(pick(1200)).toEqual([
      [2020, 260],
      [2022, 255],
    ])
    expect(pick(3600)).toEqual([
      [2020, 220],
      [2022, 215],
    ])
  })

  it('leaves out a ride whose power is set aside, until the athlete keeps it', () => {
    const library = [
      rideDigest('real', at(2021), { 300: 280, 1200: 250, 3600: 220 }),
      rideDigest('glitch', at(2021, 8), { 300: 2400, 1200: 2000, 3600: 1900 }),
    ]
    const at20 = (input = INPUT) =>
      bestsOf(library, input).ride.find((effort) => effort.length === 1200)!.years[0]![1]
    expect(at20()).toBe(250)
    expect(at20({ ...INPUT, settings: { ...INPUT.settings, keepPower: ['glitch'] } })).toBe(2000)
  })

  it('draws a ride’s best hollow unless heart rate shows it was hard', () => {
    const hardOf = (maxHeartRate: number | null, input = INPUT) =>
      bestsOf([rideDigest('a', at(2021), { 1200: 250 }, { maxHeartRate })], input).ride[0]!
        .years[0]![2]
    expect(hardOf(HARD_BPM)).toBe(true)
    expect(hardOf(EASY_BPM)).toBe(false)
    expect(hardOf(null)).toBe(false)
    expect(hardOf(HARD_BPM, UNJUDGED)).toBe(false)
  })
})

describe('estimated bests', () => {
  const estimatedOf = (digests: Parameters<typeof historyOf>[0]) =>
    bestsOf(digests)
      .ride.find((effort) => effort.length === 1200)!
      .years.map(([, , , e]) => e)

  it('tags a ride’s best that did not come from a power meter, and never a run’s', () => {
    expect(
      estimatedOf([
        rideDigest('meter', at(2020), { 1200: 250 }),
        rideDigest('model', at(2021), { 1200: 250 }, { powerSource: 'virtual' }),
        rideDigest('none', at(2022), { 1200: 250 }, { powerSource: 'none' }),
      ]),
    ).toEqual([false, true, true])
    const { run } = bestsOf([
      runDigest('a', at(2021), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: 1100 }] }),
    ])
    expect(run[0]!.years[0]![3]).toBe(false)
  })

  it('tags the ride that holds the year’s best, not another of the year', () => {
    expect(
      estimatedOf([
        rideDigest('meter', at(2021), { 1200: 240 }),
        rideDigest('model', at(2021, 9), { 1200: 260 }, { powerSource: 'virtual' }),
      ]),
    ).toEqual([true])
    expect(
      estimatedOf([
        rideDigest('meter', at(2021), { 1200: 270 }),
        rideDigest('model', at(2021, 9), { 1200: 260 }, { powerSource: 'virtual' }),
      ]),
    ).toEqual([false])
  })
})

describe('bests in the history', () => {
  it('has no bests for an empty library', () => {
    expect(bestsOf([])).toEqual({ run: [], ride: [] })
  })

  it('is remembered for the same digests, and made again when what it reads changes', () => {
    const library = [
      runDigest('a', at(2021), {}, { distanceBests: [{ distanceM: FIVE_K, seconds: 1500 }] }),
      rideDigest('b', at(2021), { 1200: 250 }),
    ]
    const first = bestsOf(library)
    expect(bestsOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 1 })).toBe(first)
    expect(bestsOf(library, { ...INPUT, setAside: new Set(['a']) })).not.toBe(first)
    expect(bestsOf(library, { ...INPUT, settings: { massKg: 80, bikeMassKg: 9 } })).not.toBe(first)
  })
})
