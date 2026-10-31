import '../test/warmSample'
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

  it('compares rides by default, as measured power at the reference heart rate, and leaves them out when told to', () => {
    const rides = library({ sports: ['ride'], weeks: 70 })
    const on = fitnessStatuses(rides.digests, NONE)
    expect(on.ride.steady).toBeGreaterThan(50)
    expect(on.ride.referenceHr).not.toBeNull()
    expect(on.ride.evidence!.method.tier).toBe('power')
    const off = fitnessStatuses(rides.digests, NONE, { enabled: { ride: false } })
    expect(off.ride.shortfall).toEqual({ kind: 'unavailable' })
    expect(off.run.steady).toBe(0)
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

  it('evaluates completed weeks only: runs in the week still going wait for its end', () => {
    const digests = library({
      weeks: 70,
      effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.2 }],
    }).digests
    const sunday = digests.filter((d) => d.startMs <= digests[0]!.startMs + 65 * WEEK - 1)
    const midweek = digests.filter((d) => d.startMs <= digests[0]!.startMs + 65 * WEEK + 3 * DAY_MS)
    expect(midweek.length).toBeGreaterThan(sunday.length)
    const done = fitnessStatuses(sunday, NONE).run
    const going = fitnessStatuses(midweek, NONE).run
    // The runs of the partial week are in the library but not yet in the monitor's weeks.
    expect(going.state).toBe(done.state)
    expect(going.entered).toEqual(done.entered)
    // The reference heart rate and the fit read every run held, so the figures move a little; the weeks do not.
    expect(Math.abs(going.change!.value - done.change!.value)).toBeLessThan(0.03)
    expect(going.steady).toBeGreaterThan(done.steady)
  })

  it('says a clear rise plainly, as improving, and never for an athlete whose level does not move', () => {
    const states = (effects: PlantedSpec['effects']) => {
      const planted = library({ weeks: 100, noise: 0.01, effects })
      // Weeks 64 to 99: from a few weeks before the rise to 30 after it, for the rise and for the null alike.
      // The dip-and-return sweep below covers the weeks before.
      return Array.from({ length: 36 }, (_, i) => {
        const asOfMs = planted.firstMs + (64 + i) * WEEK
        return fitnessStatuses(
          planted.digests.filter((d) => d.startMs <= asOfMs),
          NONE,
          { asOfMs },
        ).run
      })
    }
    const up = states([{ type: 'efficiency-shift', atWeek: 70, size: 0.1 }])
    const improving = up.filter((s) => s.state === 'improving')
    expect(improving.length).toBeGreaterThan(3)
    for (const s of improving) {
      expect(s.change!.low).toBeGreaterThan(0)
      expect(s.entered).toBeNull()
      expect(s.shortfall).toBeNull()
    }
    expect(states([]).some((s) => s.state === 'improving')).toBe(false)
  })

  it('reports the runs behind the earlier level by count and span, not by id', () => {
    const status = fitnessStatuses(
      library({ weeks: 100, effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }] })
        .digests,
      NONE,
    ).run
    expect(status.evidence!.baseline!.runs).toBeGreaterThan(10)
    expect('ids' in status.evidence!.baseline!).toBe(false)
    expect(status.evidence!.recent.ids.length).toBe(status.evidence!.recent.runs)
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
      expect(status.entered === null).toBe(
        status.state === 'holding' || status.state === 'improving',
      )
    }
    const recovering = weekly[first('recovering')]!
    expect(recovering.gain!.value).toBeGreaterThan(0.03)
    expect(recovering.lowMs).toBeGreaterThan(recovering.onsetMs!)
    expect(recovering.entered!.z).toBeGreaterThan(4)
    const back = weekly[first('back')]!
    expect(Math.abs(back.change!.value)).toBeLessThan(0.04)
    expect(back.within).toBeLessThan(0.1)
  })

  it('never says improving once back: the dip is still in the weeks it is compared with', () => {
    const back = first('back')
    expect(back).toBeGreaterThan(0)
    // Back, the episode closes, and for 36 weeks the earlier level still holds the dip.
    expect(weekly.slice(back).filter((s) => s.state === 'improving')).toEqual([])
    expect(weekly.slice(back).some((s) => s.state === 'holding')).toBe(true)
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
  const last = planted.digests.at(-1)!.startMs
  /** A session whose today is the library's last day, unless a test says otherwise. */
  const sessionOn = (nowMs = last) => {
    const session = new AnalysisSession()
    session.clock = () => nowMs
    return session
  }

  it('holds the status of the whole library, the same under every period', () => {
    const session = sessionOn()
    session.choosePeriod('all')
    const all = session.loadDigests(planted.digests, settings)
    expect(all.fitness.run.state).toBe('slipping')
    const recent = session.setRange(42, settings)
    expect(recent.fitness).toBe(all.fitness)
    expect(session.setRange('default', settings).fitness).toBe(all.fitness)
  })

  it("reads the library's own set-aside judgement, not a period's", () => {
    const state = sessionOn().loadDigests(planted.digests, settings)
    const direct = fitnessStatuses(planted.digests, new Set(state.heartRateJudgement.setAside), {
      nowMs: Math.floor(last / DAY_MS) * DAY_MS,
    })
    expect(state.fitness).toEqual(direct)
  })

  it('is empty before anything is loaded and after a clear', () => {
    const session = sessionOn()
    expect(session.setRange('all', settings).fitness).toEqual(NO_FITNESS)
    session.loadDigests(planted.digests, settings)
    expect(session.clear().fitness).toEqual(NO_FITNESS)
  })

  it('takes today from the clock, not from the newest activity: a runner who stopped is told so', () => {
    const stopped = sessionOn(last + 6 * WEEK).loadDigests(planted.digests, settings)
    expect(stopped.fitness.run.state).toBe('not-enough-evidence')
    // Today is cut to the day, so the six weeks read as five or six.
    expect(stopped.fitness.run.shortfall).toMatchObject({ kind: 'break' })
    expect(
      (stopped.fitness.run.shortfall as { weeksSince: number }).weeksSince,
    ).toBeGreaterThanOrEqual(5)
    // A clock before the newest activity, or the same day, changes nothing.
    expect(
      sessionOn(last - 30 * DAY_MS).loadDigests(planted.digests, settings).fitness.run.state,
    ).toBe('slipping')
  })

  it('keeps the work when the clock moves within a day, and redoes it on the next day', () => {
    const session = sessionOn()
    session.choosePeriod('all')
    session.clock = () => last + 3 * WEEK + 1_000
    const first = session.loadDigests(planted.digests, settings).fitness
    session.clock = () => last + 3 * WEEK + 3_000_000
    expect(session.setRange(42, settings).fitness).toBe(first)
    session.clock = () => last + 3 * WEEK + 2 * DAY_MS
    expect(session.setRange('all', settings).fitness).not.toBe(first)
  })

  it("gives the sample athlete the sample season's own day, whatever the clock says", () => {
    const session = sessionOn(Date.UTC(2040, 0, 1))
    const sample = session.loadSample(settings)
    expect(sample.fitness.run.shortfall?.kind).not.toBe('break')
    expect(sample.fitness.run.asOfMs).toBeLessThan(Date.UTC(2030, 0, 1))
  })
})
