import { describe, expect, it } from 'vitest'
import { quantile } from '../math'
import type { Activity } from '../types'
import { autocorrelation, sineShare } from './noise/realism'
import { SAMPLE_ATHLETE, generateSampleActivity, samplePlan } from './sampleSeason'
import type { SampleEntry } from './sampleSeason'

const plan = samplePlan()
const generated = new Map<string, Activity>()
/** An entry's recording, made once for the file. */
function recording(entry: SampleEntry): Activity {
  const held = generated.get(entry.spec.id)
  if (held !== undefined) return held
  const made = generateSampleActivity(entry)
  generated.set(entry.spec.id, made)
  return made
}

const finite = (xs: ArrayLike<number>) => Array.from(xs).filter(Number.isFinite)
const heartRateAt = (a: Activity, q: number) => quantile(finite(a.heartRate), q)
const easyRuns = plan.filter((e) => e.spec.sport === 'run' && e.spec.effort === 'easy')
const longRuns = easyRuns.filter((e) => e.spec.durationS >= 75 * 60 && e.gap === undefined)

describe('what the sample is called', () => {
  const counts = new Map<string, number>()
  for (const entry of plan) counts.set(entry.spec.name, (counts.get(entry.spec.name) ?? 0) + 1)

  it('spreads over many names, none in more than a quarter of the list', () => {
    expect(counts.size).toBeGreaterThanOrEqual(20)
    expect(Math.max(...counts.values()) / plan.length).toBeLessThan(0.25)
  })

  it('is mostly a watch’s own names, by the hour, with a title now and then', () => {
    const defaults = plan.filter((e) =>
      /^(Morning|Lunch|Afternoon|Evening) (Run|Ride)$/.test(e.spec.name),
    )
    expect(defaults.length).toBeGreaterThanOrEqual(8)
    expect(defaults.length).toBeLessThan(plan.length / 2)
  })

  it('never says what the generator made', () => {
    for (const name of counts.keys())
      expect(name).not.toMatch(/Glitch|Flat|Rolling|With HR|Simulat|Synthetic/)
  })
})

describe('the sample’s recordings', () => {
  it('has a 5K that is 5.0 km, from the start line, run at a pace a runner of this level can hold', () => {
    const entry = plan.find((e) => e.spec.name === 'Parkrun 5K')!
    const race = recording(entry)
    const km = race.distance[race.n - 1]! / 1000
    // The recording ends within a second of 5.0 km, as a watch stopped at the line would.
    expect(Math.abs(km - 5) / 5).toBeLessThan(0.01)
    expect(race.n / 60).toBeGreaterThan(15)
    expect(race.n / 60).toBeLessThan(30)
    expect(race.startMs).toBeGreaterThan(entry.spec.startMs)
  })

  it('has two treadmill runs, with belt speed and no altitude, and every other run outdoors', () => {
    const runs = plan.filter((e) => e.spec.sport === 'run')
    const indoors = runs.filter((e) => recording(e).indoor)
    expect(indoors).toHaveLength(2)
    for (const entry of indoors) {
      expect(recording(entry).hasAltitude).toBe(false)
      expect(entry.spec.name).toMatch(/[Tt]readmill/)
    }
    expect(runs.filter((e) => !recording(e).indoor && !recording(e).hasAltitude)).toHaveLength(0)
  })

  it('has one easy run with no heart rate, and the older weeks’ hard sessions with none either', () => {
    const noStrap = plan.filter((e) => recording(e).hasHeartRate === false)
    const none = noStrap.filter((e) => e.spec.effort === 'easy')
    expect(none).toHaveLength(1)
    // The older weeks' hard runs and midweek rides were recorded without a strap: readings the change test counts.
    expect(noStrap.length - none.length).toBeGreaterThan(10)
    expect(none[0]!.spec.sport).toBe('run')
    expect(finite(recording(none[0]!).heartRate)).toHaveLength(0)
  })

  it('has a long run where the watch lost its signal: unknown speed, held distance, then a step', () => {
    const entry = plan.find((e) => e.gap !== undefined)!
    const run = recording(entry)
    const unrecorded = Array.from(run.unrecorded ?? []).reduce((a, b) => a + b, 0)
    expect(unrecorded).toBe(entry.gap!.lengthS)
    const first = run.unrecorded!.indexOf(1)
    const last = first + unrecorded
    expect(Number.isNaN(run.speed[first]!)).toBe(true)
    expect(Number.isNaN(run.heartRate[first]!)).toBe(true)
    expect(run.distance[last - 1]).toBe(run.distance[first - 1])
    expect(run.distance[last]! - run.distance[last - 1]!).toBeGreaterThan(100)
  })
})

describe('hard efforts that reach the top of the athlete’s range', () => {
  const hard = (sport: string) =>
    plan.filter(
      (e) =>
        e.spec.sport === sport &&
        (['test', 'race', 'intervals'] as string[]).includes(e.spec.effort) &&
        e.spec.withPower !== false,
    )

  it.each(['run', 'ride'])(
    'has several in %s whose heart rate is within 5% of the maximum',
    (sport) => {
      const near = hard(sport).filter(
        (e) => heartRateAt(recording(e), 0.995) >= 0.95 * SAMPLE_ATHLETE.hrMax,
      )
      expect(near.length).toBeGreaterThanOrEqual(3)
    },
  )

  it('holds a 20 minute effort in each sport: a test block, which has the effort held for 20 minutes', () => {
    for (const sport of ['run', 'ride']) {
      const tests = plan.filter((e) => e.spec.sport === sport && e.spec.effort === 'test')
      expect(tests.length).toBeGreaterThanOrEqual(3)
      for (const entry of tests) expect(entry.spec.durationS).toBeGreaterThanOrEqual(98 * 60)
    }
  })
})

describe('easy running that looks recorded, not drawn', () => {
  it('sits near 70% of the maximum heart rate, and a long run’s middle 90% spans about 12 bpm', () => {
    const spans: number[] = []
    for (const entry of longRuns.slice(-6)) {
      const run = recording(entry)
      const share = heartRateAt(run, 0.5) / SAMPLE_ATHLETE.hrMax
      expect(share).toBeGreaterThan(0.6)
      expect(share).toBeLessThan(0.8)
      spans.push(heartRateAt(run, 0.95) - heartRateAt(run, 0.05))
    }
    expect(quantile(spans, 0.5)).toBeGreaterThanOrEqual(12)
    expect(Math.min(...spans)).toBeGreaterThanOrEqual(8)
  })

  it('has a pace that is not two sines and does not repeat ten minutes on', () => {
    for (const entry of longRuns.slice(-6)) {
      const speed = recording(entry).speed
      expect(autocorrelation(speed, 600)).toBeLessThan(0.3)
      expect(sineShare(speed, [600, 1700])).toBeLessThan(0.8)
    }
  })
})
