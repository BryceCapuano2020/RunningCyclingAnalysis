import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { PlantedSpec } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'
import type { ActivityDigest } from '../types'
import { fitnessStatuses } from './compute'
import { NO_FITNESS } from './types'

const NONE: ReadonlySet<string> = new Set()
const WEEK = 7 * DAY_MS
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

const library = (over: Partial<PlantedSpec> = {}) =>
  plantedLibrary({ seed: 3, weeks: 100, perWeek: 3, ...NOISE, effects: [], ...over })

describe('fitnessStatuses', () => {
  it('has nothing to say without a library', () => {
    expect(fitnessStatuses([], NONE)).toEqual(NO_FITNESS)
  })

  it('does not compare rides until they are calibrated, and does when told to', () => {
    const rides = library({ sports: ['ride'], weeks: 70 })
    expect(fitnessStatuses(rides.digests, NONE).ride.shortfall).toEqual({ kind: 'unavailable' })
    const enabled = fitnessStatuses(rides.digests, NONE, { enabled: { ride: true } })
    expect(enabled.ride.steady).toBeGreaterThan(50)
    expect(enabled.ride.referenceHr).not.toBeNull()
    expect(enabled.ride.evidence!.method.tier).toBe('power')
  })

  it('counts what is missing when there is too little history', () => {
    const short = fitnessStatuses(library({ weeks: 10 }).digests, NONE).run
    expect(short.state).toBe('not-enough-evidence')
    expect(short.shortfall).toMatchObject({ kind: 'history', need: 12, needWeeks: 8 })
    const none = fitnessStatuses(library({ weeks: 10, sports: ['ride'] }).digests, NONE).run
    expect(none.shortfall).toMatchObject({ kind: 'history', have: 0 })
    expect(none.steady).toBe(0)
  })

  it('counts the steady runs of the last 8 weeks when there are too few', () => {
    const full = library({ weeks: 60 })
    const last = full.digests.at(-1)!.startMs
    const sparse = full.digests.filter(
      (d) => d.startMs < last - 8 * WEEK || d.startMs > last - 3 * DAY_MS,
    )
    const status = fitnessStatuses(sparse, NONE).run
    expect(status.state).toBe('not-enough-evidence')
    expect(status.shortfall).toMatchObject({ kind: 'recent', need: 4, weeks: 8 })
    expect((status.shortfall as { have: number }).have).toBeLessThan(4)
  })

  it('names a break of 4 weeks or more, counted from the date asked about', () => {
    const digests = library({ weeks: 60 }).digests
    const last = digests.at(-1)!.startMs
    expect(fitnessStatuses(digests, NONE).run.shortfall?.kind).not.toBe('break')
    const later = fitnessStatuses(digests, NONE, { asOfMs: last + 6 * WEEK }).run
    expect(later.shortfall).toEqual({ kind: 'break', weeksSince: 6 })
    expect(later.asOfMs).toBe(last + 6 * WEEK)
  })

  it('withholds "holding" when the level is not known to within 6%', () => {
    const status = fitnessStatuses(library().digests, NONE).run
    expect(status.shortfall).toMatchObject({ kind: 'imprecise' })
    expect((status.shortfall as { within: number }).within).toBeGreaterThan(0.06)
  })

  it('says holding, with the runs behind it, for a steadier athlete', () => {
    const calm = plantedLibrary({ seed: 5, weeks: 70, perWeek: 3, noise: 0.01, effects: [] })
    const status = fitnessStatuses(calm.digests, NONE).run
    expect(status.state).toBe('holding')
    expect(status.within).toBeLessThan(0.06)
    expect(Math.abs(status.change!.value)).toBeLessThan(0.03)
    expect(status.now).toBeGreaterThan(2)
    expect(status.evidence!.recent.runs).toBeGreaterThanOrEqual(8)
    const ids = new Set(calm.digests.map((d) => d.id))
    expect(status.evidence!.recent.ids.every((id) => ids.has(id))).toBe(true)
    expect(status.evidence!.baseline!.runs).toBeGreaterThan(status.evidence!.recent.runs)
  })

  it('says slipping, with the month it began, when the level drops', () => {
    const planted = library({ effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }] })
    const status = fitnessStatuses(planted.digests, NONE).run
    expect(status.state).toBe('slipping')
    expect(status.change!.value).toBeLessThan(-0.05)
    expect(status.change!.high).toBeLessThan(0)
    expect(status.change!.low).toBeLessThan(status.change!.value)
    expect(status.entered!.z).toBeLessThan(-3.3)
    const onset = status.onsetMs!
    const truth = planted.truths[0]!.onsetMs
    expect(Math.abs(onset - truth)).toBeLessThan(8 * WEEK)
    expect(status.now).toBeLessThan(status.before!)
  })

  it('leaves out heart rate that is set aside', () => {
    const digests = library({ weeks: 60 }).digests
    const all = fitnessStatuses(digests, NONE).run.steady
    const ids = new Set(digests.slice(0, 40).map((d) => d.id))
    expect(fitnessStatuses(digests, ids).run.steady).toBeLessThan(all)
  })

  it('is a function of the digests alone: any order, any copy of the list', () => {
    const planted = library({ effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }] })
    const reversed = [...planted.digests].reverse()
    expect(fitnessStatuses(reversed, NONE)).toEqual(fitnessStatuses(planted.digests, NONE))
  })

  it('does the work once for the same digests, and again when the set-aside list or the date changes', () => {
    const digests: ActivityDigest[] = library({ weeks: 60 }).digests
    const first = fitnessStatuses(digests, NONE)
    expect(fitnessStatuses(digests, new Set())).toBe(first)
    expect(fitnessStatuses(digests.slice(), NONE)).toBe(first)
    expect(fitnessStatuses(digests, new Set([digests[0]!.id]))).not.toBe(first)
    expect(fitnessStatuses(digests, NONE, { asOfMs: digests.at(-1)!.startMs + WEEK })).not.toBe(
      first,
    )
    expect(fitnessStatuses(digests.slice(1), NONE)).not.toBe(first)
  })
})

describe('a dip and a return, week by week', () => {
  const dip = plantedLibrary({
    seed: 2,
    weeks: 190,
    perWeek: 3,
    noise: 0.02,
    noiseModel: { autocorrelation: 0.9, heavyTails: true },
    effects: [
      { type: 'efficiency-shift', atWeek: 70, size: -0.12 },
      { type: 'efficiency-shift', atWeek: 110, size: 0.12 / 0.88 },
    ],
  })
  const marks = Array.from({ length: 150 }, (_, i) => dip.firstMs + (40 + i) * WEEK)
  const weekly = marks.map(
    (asOfMs) =>
      fitnessStatuses(
        dip.digests.filter((d) => d.startMs <= asOfMs),
        NONE,
        { asOfMs },
      ).run,
  )
  const first = (state: string) => weekly.findIndex((s) => s.state === state)

  it('goes through holding, slipping, holding below, recovering and back, in that order', () => {
    const order = ['holding', 'slipping', 'holding-below', 'recovering', 'back'].map(first)
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('tells each state with the figures it needs', () => {
    for (const status of weekly) {
      if (status.state === 'not-enough-evidence') {
        expect(status.shortfall).not.toBeNull()
        continue
      }
      expect(status.shortfall).toBeNull()
      expect(status.now).toBeGreaterThan(0)
      expect(status.evidence!.recent.runs).toBeGreaterThanOrEqual(4)
      expect(status.change!.low).toBeLessThan(status.change!.value)
      expect(status.change!.high).toBeGreaterThan(status.change!.value)
      expect(status.entered === null).toBe(status.state === 'holding')
    }
    const recovering = weekly[first('recovering')]!
    expect(recovering.gain!.value).toBeGreaterThan(0.03)
    expect(recovering.lowMs).toBeGreaterThan(recovering.onsetMs!)
    expect(recovering.entered!.z).toBeGreaterThan(4)
    const back = weekly[first('back')]!
    expect(Math.abs(back.change!.value)).toBeLessThan(0.04)
    expect(back.within).toBeLessThan(0.1)
  })

  it('dates the slip to within a couple of months of when it began', () => {
    const slipping = weekly[first('slipping')]!
    expect(Math.abs(slipping.onsetMs! - dip.truths[0]!.onsetMs)).toBeLessThan(10 * WEEK)
    expect(slipping.entered!.atMs - dip.truths[0]!.onsetMs).toBeLessThan(10 * WEEK)
  })
})

describe('the session', () => {
  const settings = { massKg: 75, bikeMassKg: 9 }
  const planted = library({ effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }] })

  it('holds the status of the whole library, the same under every period', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const all = session.loadDigests(planted.digests, settings)
    expect(all.fitness.run.state).toBe('slipping')
    const recent = session.setRange(42, settings)
    expect(recent.fitness).toBe(all.fitness)
    expect(session.setRange('default', settings).fitness).toBe(all.fitness)
  })

  it("reads the library's own set-aside judgement, not a period's", () => {
    const session = new AnalysisSession()
    const state = session.loadDigests(planted.digests, settings)
    const direct = fitnessStatuses(planted.digests, new Set(state.heartRateJudgement.setAside))
    expect(state.fitness).toEqual(direct)
  })

  it('is empty before anything is loaded and after a clear', () => {
    const session = new AnalysisSession()
    expect(session.setRange('all', settings).fitness).toEqual(NO_FITNESS)
    session.loadDigests(planted.digests, settings)
    expect(session.clear().fitness).toEqual(NO_FITNESS)
  })
})
