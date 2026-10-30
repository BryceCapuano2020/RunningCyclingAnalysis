import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../../constants'
import { REGISTRY } from '../registry'
import { episodesOf, replayDetector } from '../test/harness'
import { plantedLibrary } from '../test/plantedLibrary'
import { fitnessStatuses } from '../../fitness/compute'
import { fitnessStatusDetector } from './fitnessStatus'

const WEEK = 7 * DAY_MS
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

describe('the fitness-status detector', () => {
  it('is registered for both sports', () => {
    expect(REGISTRY.run.map((d) => d.id)).toContain('fitness-status')
    expect(REGISTRY.ride.map((d) => d.id)).toContain('fitness-status')
  })

  const library = plantedLibrary({
    seed: 3,
    weeks: 110,
    perWeek: 3,
    ...NOISE,
    effects: [{ type: 'efficiency-shift', atWeek: 60, size: -0.12 }],
  })
  const onset = library.truths[0]!.onsetMs
  const replay = replayDetector(fitnessStatusDetector, library, {
    fromMs: onset - 6 * WEEK,
    toMs: onset + 16 * WEEK,
  })

  it('speaks a slip once, for a few weeks after it begins to be shown, and then not again', () => {
    const spoken = replay.marks.filter((m) => m.spoken.length > 0)
    expect(spoken.length).toBeGreaterThanOrEqual(2)
    expect(spoken.length).toBeLessThanOrEqual(6)
    expect(spoken[0]!.asOfMs).toBeGreaterThanOrEqual(onset)
    expect(spoken[0]!.asOfMs).toBeLessThan(onset + 12 * WEEK)
    const episodes = episodesOf(replay.marks)
    expect(episodes).toHaveLength(1)
    const finding = episodes[0]!.finding
    expect(finding.id).toBe('fitness-status:run:slipping')
    expect(finding.direction).toBe('worse')
    expect(finding.effect).toBeLessThan(-0.04)
    expect(finding.headline).toMatch(
      /^At \d+ bpm you now run \d+(\.\d)?% \(\d+( to \d+)?%\) slower than before /,
    )
    expect(finding.headline).not.toMatch(/\/km|\/mi/)
    expect(finding.confidence).toBeGreaterThanOrEqual(0.8)
    expect(finding.numbers.map((n) => n.key)).toEqual(['now', 'before', 'change'])
    // The number is said as a pace, as the page shows a run; the effect stays in speed for the engine.
    const change = finding.numbers.find((n) => n.key === 'change')!
    expect(change.value / 100).toBeCloseTo(finding.effect / (1 + finding.effect), 6)
    expect(change.value).toBeLessThan(finding.effect * 100)
  })

  it('points at the runs it rests on', () => {
    const finding = episodesOf(replay.marks)[0]!.finding
    const ids = new Set(library.digests.map((d) => d.id))
    const activities = finding.evidence.flatMap((r) => (r.type === 'activity' ? [r.id] : []))
    expect(activities.length).toBeGreaterThanOrEqual(6)
    expect(activities.every((id) => ids.has(id))).toBe(true)
    expect(finding.evidence.filter((r) => r.type === 'span')).toHaveLength(2)
  })

  it('makes no finding for a library that does not change', () => {
    const quiet = plantedLibrary({ seed: 4, weeks: 80, perWeek: 3, noise: 0.002, effects: [] })
    const status = fitnessStatuses(quiet.digests, new Set()).run
    // It is a real "holding" the detector stays silent on, not a library with too little to judge.
    expect(status.state).toBe('holding')
    const result = replayDetector(fitnessStatusDetector, quiet, {
      fromMs: quiet.firstMs + 15 * WEEK,
    })
    expect(result.marks.length).toBeGreaterThan(50)
    expect(result.marks.every((m) => m.spoken.length === 0)).toBe(true)
  })

  it('has nothing to say for rides while they are off, even through a collapse in power', () => {
    const rides = plantedLibrary({
      seed: 4,
      weeks: 80,
      perWeek: 3,
      sports: ['ride'],
      noise: 0.01,
      effects: [{ type: 'efficiency-shift', atWeek: 50, size: -0.3 }],
    })
    // With rides on, the same library is a loss (slipping, then holding below): the silence below is the flag, not an absence of signal.
    const on = fitnessStatuses(rides.digests, new Set(), { enabled: { ride: true } }).ride
    expect(['slipping', 'holding-below']).toContain(on.state)
    const result = replayDetector(fitnessStatusDetector, rides, {
      fromMs: rides.firstMs + 15 * WEEK,
    })
    expect(result.marks.length).toBeGreaterThan(50)
    expect(result.marks.every((m) => m.spoken.length === 0)).toBe(true)
  })

  it("speaks a back once, from the back test's own statistic, and a recovering before it", () => {
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
    const returnMs = dip.truths[1]!.onsetMs
    const result = replayDetector(fitnessStatusDetector, dip, {
      fromMs: returnMs - 6 * WEEK,
      toMs: returnMs + 40 * WEEK,
    })
    const ids = episodesOf(result.marks).map((e) => e.finding.id)
    expect(ids).toContain('fitness-status:run:recovering')
    expect(ids).toContain('fitness-status:run:back')
    const back = episodesOf(result.marks).find((e) => e.finding.id.endsWith(':back'))!.finding
    expect(back.direction).toBe('better')
    expect(back.headline).toMatch(/^At \d+ bpm you are back/)
    expect(back.confidence).toBeGreaterThanOrEqual(0.8)
  })
})
