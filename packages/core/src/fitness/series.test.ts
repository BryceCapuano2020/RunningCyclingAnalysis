import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { PlantedSpec } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from './compute'

const NONE: ReadonlySet<string> = new Set()
const WEEK = 7 * DAY_MS
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

const library = (over: Partial<PlantedSpec> = {}) =>
  plantedLibrary({ seed: 3, weeks: 100, perWeek: 3, ...NOISE, effects: [], ...over })

const slipped = () => library({ effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }] })

describe('the level series of a fitness status', () => {
  it('is empty while there is no state to give', () => {
    const status = fitnessStatuses(library({ weeks: 10 }).digests, NONE).run
    expect(status.state).toBe('not-enough-evidence')
    expect(status.series).toEqual([])
  })

  it('ends on the status’s own level, so the chart and the sentence give one figure', () => {
    const status = fitnessStatuses(slipped().digests, NONE).run
    const last = status.series.at(-1)!
    expect(last.value).toBe(status.now)
    expect(last.low).toBeLessThan(last.value)
    expect(last.high).toBeGreaterThan(last.value)
    expect(last.atMs).toBeLessThanOrEqual(status.asOfMs)
    expect(last.runs).toBeGreaterThanOrEqual(6)
  })

  it('steps back four weeks at a time, oldest first, and stays small', () => {
    const { series } = fitnessStatuses(slipped().digests, NONE).run
    expect(series.length).toBeGreaterThan(10)
    expect(series.length).toBeLessThanOrEqual(20)
    const steps = series.slice(0, -1).map((p, i) => series[i + 1]!.atMs - p.atMs)
    // The last step is shorter or longer by the days the newest run is from the end of its week.
    for (const step of steps.slice(0, -1)) expect(step).toBe(4 * WEEK)
    expect(JSON.stringify(series).length).toBeLessThan(3000)
    expect(Object.keys(series[0]!).sort()).toEqual([
      'atMs',
      'high',
      'low',
      'runs',
      'value',
      'weeks',
    ])
  })

  it('dates a step by the last day it includes, a Sunday, and says how many weeks it is read over', () => {
    const { series } = fitnessStatuses(slipped().digests, NONE).run
    for (const p of series.slice(0, -1)) {
      expect(new Date(p.atMs).getUTCDay()).toBe(0)
      expect(new Date(p.atMs).getUTCHours()).toBe(23)
    }
    for (const p of series) expect([4, 6, 8, 12, 16]).toContain(p.weeks)
  })

  it('draws a range round every point, wider where fewer runs stand behind it', () => {
    const { series } = fitnessStatuses(slipped().digests, NONE).run
    for (const p of series) {
      expect(p.low).toBeLessThan(p.value)
      expect(p.high).toBeGreaterThan(p.value)
      // The printed ranges never narrow below the model-error floor: about 3% either side.
      expect(p.high / p.value - 1).toBeGreaterThan(0.03)
    }
  })

  it('shows the drop: levels near the reference before the onset and below it by more than the noise after', () => {
    const planted = slipped()
    const status = fitnessStatuses(planted.digests, NONE).run
    const before = status.before!
    const onset = status.onsetMs!
    const early = status.series.filter((p) => p.atMs < onset - 2 * WEEK)
    const late = status.series.filter((p) => p.atMs > onset + 8 * WEEK)
    expect(early.length).toBeGreaterThan(2)
    expect(late.length).toBeGreaterThan(2)
    for (const p of early) expect(Math.abs(p.value / before - 1)).toBeLessThan(0.05)
    for (const p of late) expect(p.value / before - 1).toBeLessThan(-0.03)
  })

  it('carries the same series for a calm athlete, level with its reference', () => {
    const calm = plantedLibrary({ seed: 5, weeks: 70, perWeek: 3, noise: 0.01, effects: [] })
    const status = fitnessStatuses(calm.digests, NONE).run
    expect(status.state).toBe('holding')
    for (const p of status.series) expect(Math.abs(p.value / status.before! - 1)).toBeLessThan(0.04)
  })

  it('reaches back no more than 76 weeks, however long the library', () => {
    const long = fitnessStatuses(library({ weeks: 200 }).digests, NONE).run
    const first = long.series[0]!.atMs
    expect(long.asOfMs - first).toBeLessThanOrEqual(76 * WEEK + WEEK)
  })
})
