import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../../constants'
import { REGISTRY } from '../registry'
import { episodesOf, replayDetector } from '../test/harness'
import { plantedLibrary } from '../test/plantedLibrary'
import { fitnessStatusDetector } from './fitnessStatus'

const WEEK = 7 * DAY_MS
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

describe('the fitness-status detector', () => {
  it('is in the registry for both sports, and speaks for runs only while rides are off', () => {
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
  })

  it('points at the runs it rests on', () => {
    const finding = episodesOf(replay.marks)[0]!.finding
    const ids = new Set(library.digests.map((d) => d.id))
    const activities = finding.evidence.flatMap((r) => (r.type === 'activity' ? [r.id] : []))
    expect(activities.length).toBeGreaterThanOrEqual(6)
    expect(activities.every((id) => ids.has(id))).toBe(true)
    expect(finding.evidence.filter((r) => r.type === 'span')).toHaveLength(2)
  })

  it('makes no finding of holding, and none for a library that does not change', () => {
    const quiet = plantedLibrary({ seed: 4, weeks: 80, perWeek: 3, noise: 0.01, effects: [] })
    const result = replayDetector(fitnessStatusDetector, quiet, {
      fromMs: quiet.firstMs + 15 * WEEK,
    })
    expect(result.marks.every((m) => m.spoken.length === 0)).toBe(true)
  })

  it('has nothing to say for rides while they are off', () => {
    const rides = plantedLibrary({
      seed: 4,
      weeks: 80,
      perWeek: 3,
      sports: ['ride'],
      noise: 0.01,
      effects: [],
    })
    const result = replayDetector(fitnessStatusDetector, rides, {
      fromMs: rides.firstMs + 15 * WEEK,
    })
    expect(result.marks.every((m) => m.spoken.length === 0)).toBe(true)
  })
})
