import { describe, expect, it } from 'vitest'
import { historyOf } from './compute'
import { yearCurvesOf } from './test/curves'
import { EASY_BPM, HARD_BPM, INPUT, UNJUDGED, at, rideDigest, runDigest } from './test/digests'

describe('best curve by year', () => {
  it('has the durations the sport page charts: a ride from a minute, a run from where its curve starts, both to three hours', () => {
    const { run, ride } = yearCurvesOf([])
    expect(ride.durations[0]).toBe(60)
    expect(run.durations[0]).toBe(180)
    expect([run, ride].map((sport) => sport.durations.at(-1))).toEqual([10_800, 10_800])
    expect(ride.years).toEqual([])
  })

  it('is each year’s best at each duration, oldest year first, with a gap where the year has no effort that long', () => {
    const { ride } = yearCurvesOf([
      rideDigest('late', at(2023), { 300: 330, 1200: 280 }),
      rideDigest('a', at(2021), { 300: 300, 1200: 250, 3600: 220 }),
      rideDigest('b', at(2021, 9), { 300: 310, 1200: 240 }),
    ])
    expect(ride.years.map((year) => year.year)).toEqual([2021, 2023])
    const at5 = ride.durations.indexOf(300)
    const at20 = ride.durations.indexOf(1200)
    const at60 = ride.durations.indexOf(3600)
    const [older, newer] = ride.years
    expect([older!.values[at5], older!.values[at20], older!.values[at60]]).toEqual([310, 250, 220])
    expect([newer!.values[at5], newer!.values[at20], newer!.values[at60]]).toEqual([330, 280, null])
    // Shorter than the shortest effort, the envelope carries the best down, so those are the same effort's.
    expect(newer!.values[ride.durations.indexOf(60)]).toBe(330)
  })

  it('gives a run as the flat speed its cost stands for, in metres a second', () => {
    const { run } = yearCurvesOf([runDigest('a', at(2022), { 1200: 4.2, 3600: 3.8 })])
    const [year] = run.years
    expect(year!.values[run.durations.indexOf(1200)]).toBeCloseTo(4.2, 3)
    expect(year!.values[run.durations.indexOf(3600)]).toBeCloseTo(3.8, 3)
  })

  it('leaves out a year with nothing to draw, an indoor run’s year among them', () => {
    const { run } = yearCurvesOf([
      runDigest('belt', at(2020), { 1200: 4.5 }, { indoor: true }),
      runDigest('road', at(2021), { 1200: 4.0 }),
    ])
    expect(run.years.map((year) => year.year)).toEqual([2021])
  })

  it('leaves out a ride whose power is set aside', () => {
    const { ride } = yearCurvesOf([
      rideDigest('real', at(2021), { 1200: 250 }),
      rideDigest('glitch', at(2022), { 1200: 2000 }),
    ])
    expect(ride.years.map((year) => year.year)).toEqual([2021])
  })

  it('reads the two sports apart', () => {
    const { run, ride } = yearCurvesOf([
      runDigest('a', at(2020), { 1200: 4 }),
      rideDigest('b', at(2022), { 1200: 250 }),
    ])
    expect(run.years.map((year) => year.year)).toEqual([2020])
    expect(ride.years.map((year) => year.year)).toEqual([2022])
  })

  it('says whether heart rate shows the year’s best 20 minutes was hard', () => {
    const hardOf = (bpm: number | null, input = INPUT) =>
      yearCurvesOf([runDigest('a', at(2021), { 1200: 4 }, { maxHeartRate: bpm })], input).run
        .years[0]!.hard
    expect(hardOf(HARD_BPM)).toBe(true)
    expect(hardOf(EASY_BPM)).toBe(false)
    expect(hardOf(null)).toBe(false)
    expect(hardOf(HARD_BPM, UNJUDGED)).toBe(false)
  })

  it('judges a best carried down from a longer effort by that effort', () => {
    // 45 min at the best: the 20 minute value is carried from it, and a long effort is judged by its average.
    const carried = (average: number) =>
      yearCurvesOf([
        rideDigest('a', at(2021), { 2700: 250 }, { maxHeartRate: HARD_BPM, avgHeartRate: average }),
      ]).ride.years[0]!.hard
    expect(carried(170)).toBe(true)
    expect(carried(120)).toBe(false)
  })

  it('lists the durations whose value is a bike model’s and not a meter’s, for rides only', () => {
    const { ride, run } = yearCurvesOf([
      rideDigest('meter', at(2021), { 300: 300, 1200: 250 }),
      rideDigest('model', at(2021, 9), { 1200: 280 }, { powerSource: 'virtual' }),
      runDigest('a', at(2021), { 1200: 4 }),
    ])
    const at5 = ride.durations.indexOf(300)
    const at20 = ride.durations.indexOf(1200)
    // The model's 20 minutes is the year's best there; its value carried to the shorter durations is not above the meter's 5 minutes.
    expect(ride.years[0]!.estimated).toContain(at20)
    expect(ride.years[0]!.estimated).not.toContain(at5)
    expect(run.years[0]!.estimated).toEqual([])
  })

  it('is remembered for the same digests, and made again when the ride pricing changes', () => {
    const library = [
      rideDigest('a', at(2021), { 1200: 250 }),
      runDigest('b', at(2021), { 1200: 4 }),
    ]
    const first = historyOf(library, INPUT).yearCurves
    expect(historyOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 1 }).yearCurves).toBe(first)
    expect(
      historyOf(library, { ...INPUT, settings: { massKg: 80, bikeMassKg: 9 } }).yearCurves,
    ).not.toBe(first)
  })
})
