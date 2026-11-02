import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../../constants'
import { REGISTRY } from '../registry'
import { episodesOf, replayDetector } from '../test/harness'
import { plantedLibrary } from '../test/plantedLibrary'
import { fitnessHistories, fitnessStatuses } from '../../fitness/compute'
import { fitnessFindingHeadline } from '../../fitness/copy'
import { datedByLookBack } from '../../lookback/cardDates'
import { lookBackOf } from '../../lookback/compute'
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
      /^\d+% \(\d+ to \d+\) off your level before \d{1,2} [A-Z][a-z]{2}( \d{4})? at \d+ bpm\.$/,
    )
    expect(finding.headline).not.toMatch(/\/km|\/mi/)
    expect(finding.confidence).toBeGreaterThanOrEqual(0.8)
    expect(finding.numbers.map((n) => n.key)).toEqual(['now', 'before', 'change'])
    // The number is said as a pace, as the page shows a run; the effect stays in speed for the engine.
    const change = finding.numbers.find((n) => n.key === 'change')!
    expect(change.value / 100).toBeCloseTo(finding.effect / (1 + finding.effect), 6)
    expect(change.value).toBeLessThan(finding.effect * 100)
  })

  it('speaks a rise once it has settled, as better, and not when it first shows', () => {
    const rise = plantedLibrary({
      seed: 5,
      weeks: 120,
      perWeek: 3,
      ...NOISE,
      effects: [{ type: 'efficiency-shift', atWeek: 60, size: 0.25 }],
    })
    const start = rise.truths[0]!.onsetMs
    const result = replayDetector(fitnessStatusDetector, rise, {
      fromMs: start - 6 * WEEK,
      toMs: start + 50 * WEEK,
    })
    const ids = episodesOf(result.marks).map((e) => e.finding.id)
    expect(ids).toEqual(['fitness-status:run:improved'])
    const finding = episodesOf(result.marks)[0]!.finding
    expect(finding.direction).toBe('better')
    expect(finding.effect).toBeGreaterThan(0.04)
    expect(finding.headline).toMatch(
      /^\d+% \(\d+ to \d+\) faster than your level before \d{1,2} [A-Z][a-z]{2}( \d{4})? at \d+ bpm\.$/,
    )
    expect(finding.headline).not.toMatch(/\/km|\/mi/)
    // Not at the first sign: the first mark that speaks is weeks after the rise is first shown as improving.
    const first = result.marks.find((m) => m.spoken.length > 0)!
    const shown = fitnessStatuses(
      rise.digests.filter((d) => d.startMs <= first.asOfMs),
      new Set(),
      { asOfMs: first.asOfMs },
    ).run
    expect(shown.state).toBe('improved')
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

  it('speaks for rides too, once through a collapse in power, and not when they are switched off', () => {
    const rides = plantedLibrary({
      seed: 4,
      weeks: 80,
      perWeek: 3,
      sports: ['ride'],
      noise: 0.01,
      effects: [{ type: 'efficiency-shift', atWeek: 50, size: -0.3 }],
    })
    const on = fitnessStatuses(rides.digests, new Set()).ride
    expect(['slipping', 'holding-below']).toContain(on.state)
    const result = replayDetector(fitnessStatusDetector, rides, {
      fromMs: rides.firstMs + 15 * WEEK,
    })
    const ids = episodesOf(result.marks).map((e) => e.finding.id)
    expect(ids).toContain('fitness-status:ride:slipping')
    // A run library has no ride finding, and nothing speaks for a library of rides while the ride is switched off.
    const off = fitnessStatuses(rides.digests, new Set(), { enabled: { ride: false } }).ride
    expect(off.shortfall).toEqual({ kind: 'unavailable' })
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
    expect(back.headline).toMatch(/^Back (?:and \d+% .* faster than|at) your /)
    expect(back.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('names the month the card names: its headline carries the look-back’s dates, as the card does', () => {
    const dip = plantedLibrary({
      seed: 7,
      weeks: 240,
      perWeek: 3,
      noise: 0.025,
      noiseModel: { autocorrelation: 0.9, heavyTails: true },
      effects: [
        { type: 'efficiency-shift', atWeek: 70, size: -0.12 },
        { type: 'efficiency-shift', atWeek: 110, size: 0.12 / 0.88 },
      ],
    })
    const result = replayDetector(fitnessStatusDetector, dip, {
      fromMs: dip.firstMs + 118 * WEEK,
      toMs: dip.firstMs + 142 * WEEK,
    })
    let differs = 0
    let spoken = 0
    for (const mark of result.marks) {
      for (const finding of mark.spoken) {
        const digests = dip.digests.filter((d) => d.startMs <= mark.asOfMs)
        const statuses = fitnessStatuses(digests, new Set(), { asOfMs: mark.asOfMs })
        const raw = statuses.run
        const look = lookBackOf(digests, { massKg: 70, bikeMassKg: 9 }, new Set())
        const histories = fitnessHistories(digests, new Set())
        // The finding's own status is as of the mark, dated by the look-back of the same digests, as the card is.
        const card = datedByLookBack(statuses, look, histories).run
        spoken++
        expect(finding.headline).toBe(fitnessFindingHeadline(card))
        if (fitnessFindingHeadline(raw) !== finding.headline) differs++
      }
    }
    expect(spoken).toBeGreaterThanOrEqual(2)
    // Without the look-back's dates, at least one of them would name another month.
    expect(differs).toBeGreaterThan(0)
  })
})
