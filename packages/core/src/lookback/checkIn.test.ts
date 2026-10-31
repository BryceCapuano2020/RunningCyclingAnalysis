import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import { workoutKey } from '../duplicates'
import { MODEL_REVISION } from '../digest'
import type { AthleteSettings } from '../types'
import { beatsShown, checkInBetween, OLDER_DAYS } from './checkIn'
import { lookBackOf } from './compute'
import { decodeSeconds, encodeSeconds, snapshotOf } from './snapshot'
import type { SnapshotEpisode, SnapshotFitness } from './snapshot'
import { ago, runBest, second, snap } from './test/snapshotFixture'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const holding = (extra: Partial<SnapshotFitness> = {}): SnapshotFitness => ({
  state: 'holding',
  referenceHr: 148,
  enteredMs: null,
  within: 0.02,
  ...extra,
})

describe('the snapshot', () => {
  it('writes the start seconds as differences in base 36 and reads them back', () => {
    const seconds = [1_700_000_000, 1_700_000_050, 1_700_086_400, 1_700_086_401]
    const text = encodeSeconds(seconds)
    expect(decodeSeconds(text)).toEqual(seconds)
    expect(text.split(',')[1]).toBe((50).toString(36))
    expect(decodeSeconds(encodeSeconds([]))).toEqual([])
  })

  const planted = plantedLibrary({ seed: 3, weeks: 120, perWeek: 3, noise: 0.03, effects: [] })
  const nowMs = planted.lastMs + DAY_MS
  const look = lookBackOf(planted.digests, SETTINGS, new Set(), nowMs)
  const fitness = fitnessStatuses(planted.digests, new Set(), { nowMs })
  const taken = snapshotOf(
    { digests: planted.digests, fitness, lookBack: look, revision: MODEL_REVISION },
    nowMs + 12_345,
  )

  it('keeps every workout once, the exact time, the revision and the newest start', () => {
    expect(taken.atMs).toBe(nowMs + 12_345)
    expect(taken.revision).toBe(MODEL_REVISION)
    const run = planted.digests.filter((d) => d.sport === 'run')
    expect(taken.counts.run).toBe(new Set(run.map((d) => workoutKey(d.sport, d.startMs))).size)
    expect(decodeSeconds(taken.keys.run)).toEqual(
      [...new Set(run.map((d) => second(d.startMs)))].sort((a, b) => a - b),
    )
    expect(taken.asOfMs).toBe(Math.max(...planted.digests.map((d) => d.startMs)))
  })

  it('keeps bests that the keys can name, and nothing that names a file', () => {
    const keys = new Set(decodeSeconds(taken.keys.run).map((s) => `run-${s}`))
    expect(taken.bests.run.length).toBeGreaterThan(0)
    for (const best of taken.bests.run) expect(keys.has(best.key)).toBe(true)
    const text = JSON.stringify(taken)
    for (const d of planted.digests.slice(0, 40)) expect(text).not.toContain(d.id)
  })

  it('is the same snapshot for the same library and clock', () => {
    const again = snapshotOf(
      {
        digests: [...planted.digests].reverse(),
        fitness,
        lookBack: look,
        revision: MODEL_REVISION,
      },
      nowMs + 12_345,
    )
    expect(again).toEqual(taken)
  })
})

describe('what was added', () => {
  const before = snap({ run: [ago(60), ago(40)], ride: [ago(50)] })

  it('is nothing without a baseline, and counts the new workouts of each sport', () => {
    expect(checkInBetween(null, before)).toBeNull()
    const now = snap({ run: [ago(60), ago(40), ago(3), ago(1)], ride: [ago(50), ago(2)] })
    const c = checkInBetween(before, now)!
    expect(c.added).toEqual({ run: 2, ride: 1 })
    expect(c.sinceMs).toBe(before.atMs)
    expect(c.older).toEqual({ run: null, ride: null })
  })

  it('finds older files only past 28 days before the newest workout the baseline held', () => {
    const edge = before.asOfMs - OLDER_DAYS * DAY_MS
    const now = snap({ run: [ago(60), ago(40), edge, edge - 1000, ago(70)], ride: [ago(50)] })
    const c = checkInBetween(before, now)!
    expect(c.added.run).toBe(3)
    expect(c.older.run).toEqual({ count: 2, fromMs: ago(70), toMs: edge - 1000 })
  })
})

describe('new bests', () => {
  const old = ago(100)
  const base = snap({ run: [old, ago(40)] }, { bests: { run: [runBest(3.5, old)], ride: [] } })

  const live = (value: number, startMs: number, extra: number[] = []) =>
    snap(
      { run: [old, ago(40), startMs, ...extra] },
      { bests: { run: [runBest(value, startMs)], ride: [] } },
    )

  it('tells a best set by a new workout that is a whole second faster', () => {
    const c = checkInBetween(base, live(3.7, ago(2)))!
    expect(c.bests).toHaveLength(1)
    expect(c.bests[0]).toMatchObject({ sport: 'run', value: 3.7, previous: 3.5, older: false })
    expect(c.quiet).toBe(false)
  })

  it('does not tell a gain the page would round away, or a best an old workout still holds', () => {
    expect(beatsShown('m/s', 1000 / 285.2, 1000 / 285.4)).toBe(false)
    expect(beatsShown('m/s', 1000 / 284, 1000 / 285)).toBe(true)
    expect(beatsShown('W', 200.4, 200.0)).toBe(false)
    expect(beatsShown('W', 201, 200)).toBe(true)
    expect(checkInBetween(base, live(3.5001, ago(2)))!.bests).toEqual([])
    const same = snap({ run: [old, ago(40), ago(2)] }, { bests: base.bests })
    expect(checkInBetween(base, same)!.bests).toEqual([])
  })

  it('says when the best was set by a workout found in older files', () => {
    const c = checkInBetween(base, live(3.9, ago(90)))!
    expect(c.bests[0]).toMatchObject({ older: true, atMs: ago(90) })
  })

  it('tells at most three, the largest gain first, and skips an effort the baseline had no best for', () => {
    const efforts = [300, 1200, 3600, 7200].map((d, i) =>
      runBest(3.5 + 0.1 * (i + 1), ago(2 + i), d),
    )
    const wasAt = (d: number) => runBest(3.4, old, d)
    const was = snap(
      { run: [old] },
      { bests: { run: [wasAt(300), wasAt(1200), wasAt(3600)], ride: [] } },
    )
    const now = snap(
      { run: [old, ago(2), ago(3), ago(4), ago(5)] },
      { bests: { run: efforts, ride: [] } },
    )
    const c = checkInBetween(was, now)!
    expect(c.bests.map((b) => (b.effort as { durationS: number }).durationS)).toEqual([
      3600, 1200, 300,
    ])
  })
})

describe('the fitness card', () => {
  const quietRuns = { run: [ago(60)] }
  const between = (was: SnapshotFitness | null, now: SnapshotFitness | null) =>
    checkInBetween(
      snap(quietRuns, { fitness: { run: was, ride: null } }),
      snap({ run: [ago(60), ago(1)] }, { fitness: { run: now, ride: null } }),
    )!

  it('tells a change of state, and nothing is computed beyond the states', () => {
    const c = between(holding(), holding({ state: 'slipping', enteredMs: ago(5), within: null }))
    expect(c.fitness).toEqual([{ sport: 'run', kind: 'moved', from: 'holding', to: 'slipping' }])
    expect(c.quiet).toBe(false)
    expect(JSON.stringify(c)).not.toMatch(/level|referenceHr/)
  })

  it('tells a recovery that was confirmed', () => {
    const c = between(holding({ state: 'recovering', within: null }), holding({ state: 'back' }))
    expect(c.fitness[0]).toMatchObject({ kind: 'moved', from: 'recovering', to: 'back' })
  })

  it('tells a state that began again since, but not one the baseline already showed', () => {
    const began = between(
      holding({ state: 'slipping', enteredMs: ago(400), within: null }),
      holding({ state: 'slipping', enteredMs: ago(-3), within: null }),
    )
    expect(began.fitness[0]).toEqual({
      sport: 'run',
      kind: 'began',
      state: 'slipping',
      sinceMs: ago(-3),
    })
    const shown = holding({ state: 'slipping', enteredMs: ago(-3), within: null })
    expect(between(shown, shown).fitness[0]!.kind).toBe('same')
  })

  it('quotes the card as it is when nothing moved, and is quiet', () => {
    const c = between(holding(), holding({ within: 0.031 }))
    expect(c.fitness).toEqual([{ sport: 'run', kind: 'same', state: 'holding', within: 0.031 }])
    expect(c.quiet).toBe(true)
  })

  it('says nothing of a sport with no readable fitness, or a reference that changed', () => {
    expect(between(null, holding()).fitness).toEqual([])
    expect(between(holding({ state: 'not-enough-evidence' }), holding()).fitness).toEqual([])
    expect(between(holding(), holding({ referenceHr: 151 })).fitness[0]!.kind).toBe('same')
  })
})

describe('new episodes', () => {
  const was = { kind: 'slip-back', fromMs: ago(900), toMs: ago(700) } as const
  const base = snap({ run: [ago(10)] }, { episodes: { run: [was], ride: [] } })
  const found = { kind: 'slip-back', fromMs: ago(400), toMs: ago(300) } as const
  const live = (episodes: SnapshotEpisode[], run: number[]) =>
    snap({ run: [ago(10), ...run] }, { episodes: { run: episodes, ride: [] } })

  it('tells an episode only when older files put a workout inside it', () => {
    const c = checkInBetween(base, live([was, found], [ago(350), ago(2)]))!
    expect(c.episodes).toEqual([{ sport: 'run', ...found }])
    expect(checkInBetween(base, live([was, found], [ago(2)]))!.episodes).toEqual([])
    expect(checkInBetween(base, live([was, found], [ago(600)]))!.episodes).toEqual([])
  })

  it('does not tell an episode the baseline already had, or a recent one', () => {
    const moved = { ...was, fromMs: ago(880) }
    expect(checkInBetween(base, live([moved], [ago(800)]))!.episodes).toEqual([])
    const recent = { kind: 'improvement', fromMs: ago(10), toMs: null } as const
    expect(checkInBetween(base, live([recent], [ago(5)]))!.episodes).toEqual([])
  })
})

describe('a model that changed', () => {
  it('compares the workouts added and nothing else', () => {
    const base = snap(
      { run: [ago(60)] },
      {
        revision: 6,
        bests: { run: [runBest(3.5, ago(60))], ride: [] },
        fitness: { run: holding(), ride: null },
      },
    )
    const now = snap(
      { run: [ago(60), ago(1)] },
      {
        bests: { run: [runBest(4, ago(1))], ride: [] },
        fitness: { run: holding({ state: 'slipping' }), ride: null },
      },
    )
    const c = checkInBetween(base, now)!
    expect(c).toMatchObject({
      modelChanged: true,
      bests: [],
      fitness: [],
      episodes: [],
      added: { run: 1, ride: 0 },
    })
  })
})
