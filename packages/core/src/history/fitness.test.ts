import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { PlantedSpec } from '../findings/test/plantedLibrary'
import { fitnessHistories } from '../fitness/compute'
import { AnalysisSession } from '../session'
import type { ActivityDigest } from '../types'
import { historyOf, NO_HISTORY } from './compute'
import type { HistoryInput } from './types'

const WEEK = 7 * DAY_MS
const SETTINGS = { massKg: 70, bikeMassKg: 9 }
const NOISE = { noise: 0.025, noiseModel: { autocorrelation: 0.9, heavyTails: true } }
const library = (over: Partial<PlantedSpec> = {}) =>
  plantedLibrary({ seed: 4, weeks: 150, perWeek: 3, ...NOISE, effects: [], ...over })
const inputFor = (nowMs: number): HistoryInput => ({
  settings: SETTINGS,
  setAside: new Set(),
  nowMs,
  gate: undefined,
})
const dayOf = (ms: number) => Math.round((ms - WEEK_ORIGIN_MS) / DAY_MS)

describe('fitness over the years: the dots', () => {
  const dip = library({
    seed: 11,
    weeks: 240,
    effects: [
      { type: 'efficiency-shift', atWeek: 90, size: -0.1 },
      { type: 'efficiency-shift', atWeek: 150, size: 0.1 / 0.9 },
    ],
  })
  const state = new AnalysisSession().loadDigests(dip.digests, SETTINGS)
  const dots = state.history.fitness.run

  it('is one dot for each steady run the fitness card counts, at the heart rate the card names', () => {
    expect(dots.levels.length).toBe(state.fitness.run.steady)
    expect(dots.levels.length).toBeGreaterThan(300)
    expect(dots.referenceHr).toBe(state.fitness.run.referenceHr)
    expect(dots.referenceHr).toBe(state.lookBack.sports.run.referenceHr)
    expect(dots.gaps).toHaveLength(dots.levels.length)
    expect(dots.gaps[0]).toBe(0)
    expect(dots.gaps.every((g) => g >= 0 && Number.isInteger(g))).toBe(true)
  })

  it('holds each dot to a hundredth of a metre a second, the values the unit read', () => {
    const { runs } = fitnessHistories(dip.digests, new Set()).run
    expect(dots.step).toBe(0.01)
    runs.forEach((run, i) => {
      expect(Math.abs(dots.levels[i]! * dots.step - Math.exp(run.x))).toBeLessThanOrEqual(0.005001)
    })
    const days = dots.gaps.reduce<number[]>(
      (all, g, i) => [...all, (all[i - 1] ?? dots.firstDay) + g],
      [],
    )
    expect(days[0]).toBe(dots.firstDay)
    expect(days.at(-1)).toBe(Math.floor(runs.at(-1)!.t))
  })

  it('shades the slips and rises the look-back lists, on the same days', () => {
    const listed = state.lookBack.sports.run.fitness
    expect(listed.kind).toBe('ok')
    if (listed.kind !== 'ok') return
    const shaded = listed.episodes.filter((e) => e.kind !== 'after-break')
    expect(shaded.length).toBeGreaterThan(0)
    expect(dots.spans).toEqual(
      shaded.map((e) => ({
        kind: e.kind === 'improvement' ? 'rise' : 'slip',
        fromDay: dayOf(e.fromMs),
        toDay: e.toMs === null ? null : dayOf(e.toMs),
      })),
    )
    expect(dots.horizonDay).toBe(dayOf(listed.toMs))
  })

  it('names the slip the card names: the card’s onset is the start of a shaded slip', () => {
    const card = state.fitness.run
    expect(['holding-below', 'recovering', 'back', 'slipping']).toContain(card.state)
    const onset = dayOf(card.onsetMs!)
    expect(dots.spans.some((s) => s.kind === 'slip' && Math.abs(s.fromDay - onset) <= 1)).toBe(true)
  })

  it('sums each calendar year to its dots, with a middle that sits among them', () => {
    expect(dots.years.reduce((n, y) => n + y.n, 0)).toBe(dots.levels.length)
    for (const year of dots.years) {
      expect(year.low).toBeLessThanOrEqual(year.median)
      expect(year.median).toBeLessThanOrEqual(year.high)
    }
    const years = dots.years.map((y) => y.year)
    expect(years).toEqual(Array.from({ length: years.length }, (_, i) => years[0]! + i))
  })

  it('draws its middle line as the median of the dots within 6 weeks either side, every 4 weeks', () => {
    const days = dots.gaps.reduce<number[]>(
      (all, g, i) => [...all, (all[i - 1] ?? dots.firstDay) + g],
      [],
    )
    dots.line.forEach((value, k) => {
      const at = dots.firstDay + k * 28
      const near = dots.levels.filter((_, i) => Math.abs(days[i]! - at) <= 42).sort((a, b) => a - b)
      if (near.length < 4) expect(value).toBeNull()
      else
        expect(
          Math.abs(value! - (near[(near.length - 1) >> 1]! + near[near.length >> 1]!) / 2),
        ).toBeLessThanOrEqual(0.5)
    })
    expect(dots.line.filter((v) => v !== null).length).toBeGreaterThan(dots.line.length * 0.9)
  })
})

describe('fitness over the years: a long gap in the data', () => {
  const whole = library({ weeks: 280 })
  const gapFrom = whole.firstMs + 60 * WEEK
  const gapTo = whole.firstMs + 200 * WEEK
  const digests: ActivityDigest[] = whole.digests.filter(
    (d) => d.startMs < gapFrom || d.startMs >= gapTo,
  )
  const dots = historyOf(digests, inputFor(whole.lastMs)).fitness.run

  it('breaks the line across the gap instead of bridging it, and picks it up on both sides', () => {
    const gapKnots = dots.line.flatMap((v, i) => {
      const day = dots.firstDay + i * 28
      return day > dayOf(gapFrom) + 42 && day < dayOf(gapTo) - 42 ? [v] : []
    })
    expect(gapKnots.length).toBeGreaterThan(5)
    expect(gapKnots.every((v) => v === null)).toBe(true)
    expect(dots.line.slice(0, 5).every((v) => v !== null)).toBe(true)
    expect(dots.line.slice(-5).every((v) => v !== null)).toBe(true)
  })

  it('has no dot in the gap, and lists a year with none as a year with zero', () => {
    const days = dots.gaps.reduce<number[]>(
      (all, g, i) => [...all, (all[i - 1] ?? dots.firstDay) + g],
      [],
    )
    expect(days.some((d) => d > dayOf(gapFrom) + 7 && d < dayOf(gapTo) - 7)).toBe(false)
    expect(dots.gaps.some((g) => g > 60)).toBe(true)
    const empty = dots.years.filter((y) => y.n === 0)
    expect(empty.length).toBeGreaterThanOrEqual(1)
    expect(empty.every((y) => y.median === 0 && y.low === 0 && y.high === 0)).toBe(true)
  })
})

describe('fitness over the years: what there is to draw', () => {
  it('is empty without a library, and for a sport with no steady activity', () => {
    expect(historyOf([], inputFor(Date.UTC(2030, 0, 1))).fitness).toEqual(NO_HISTORY.fitness)
    const runs = library({ weeks: 60 })
    const history = historyOf(runs.digests, inputFor(runs.lastMs))
    expect(history.fitness.run.levels.length).toBeGreaterThan(40)
    expect(history.fitness.ride).toEqual(NO_HISTORY.fitness.ride)
  })

  it('reads a ride as watts at the card’s heart rate', () => {
    const rides = library({ weeks: 90, sports: ['ride'] })
    const state = new AnalysisSession().loadDigests(rides.digests, SETTINGS)
    const dots = state.history.fitness.ride
    expect(dots.step).toBe(1)
    expect(dots.levels.length).toBe(state.fitness.ride.steady)
    expect(dots.referenceHr).toBe(state.fitness.ride.referenceHr)
    expect(dots.levels.every((w) => w > 50 && w < 600)).toBe(true)
  })

  it('does not read the library again for the same digests', () => {
    const runs = library({ weeks: 60 })
    const input = inputFor(runs.lastMs)
    const first = historyOf(runs.digests, input).fitness
    expect(
      historyOf(runs.digests, { ...input, settings: { massKg: 99, bikeMassKg: 9 } }).fitness,
    ).toBe(first)
  })
})
