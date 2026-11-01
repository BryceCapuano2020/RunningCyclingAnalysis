import { describe, expect, it } from 'vitest'
import { simulate } from '../fitness/test/runSim'
import { bestSplit } from './anchors'
import { anchorsOf } from './live'
import { coreOf, segmentLevels, sigmaOver } from './segments'

/** A level with no wander, a dip of 3.5% for 40 weeks: under the bar for a change found alone (4%), and at the card's. */
const runs = simulate(
  {
    weeks: 160,
    perWeek: 5,
    level: { wanderSd: 0, runSd: 0.03 },
    planted: [
      { type: 'step', week: 60, size: -0.035 },
      { type: 'step', week: 100, size: 0.035 },
    ],
  },
  3,
)
const bar = { delta: 0.04, z: 3.3 }
const END = 150 * 7

describe('a change the card declared', () => {
  const live = [{ declaredWeek: 64, backWeek: 108, recoveringWeek: null, relapsed: false }]

  it('puts the date where the runs split best, within the weeks the card trails it by', () => {
    const { sigma } = sigmaOver(runs)
    const [fall, rise] = anchorsOf(live)
    expect(Math.abs(bestSplit(runs, fall!, sigma, 0)! - 60)).toBeLessThanOrEqual(5)
    expect(Math.abs(bestSplit(runs, rise!, sigma, 0)! - 100)).toBeLessThanOrEqual(6)
  })

  it('splits the plateaus there, where a change this size is not found alone', () => {
    expect(segmentLevels(runs, END, bar)!.levels).toHaveLength(1)
    const levels = segmentLevels(runs, END, bar, undefined, anchorsOf(live))!.levels
    expect(levels.map((l) => l.forced)).toEqual([undefined, 'fall', 'rise'])
    expect(levels[1]!.m).toBeLessThan(levels[0]!.m)
  })

  it('reads the step without the weeks beside the cut, which the choosing of the cut flatters', () => {
    const levels = segmentLevels(runs, END, bar, undefined, anchorsOf(live))!.levels
    expect(levels[1]!.core).toBeDefined()
    expect(coreOf(levels[0]!).m).toBe(levels[0]!.core?.m ?? levels[0]!.m)
  })

  it('keeps a slip the card declared when the weak step back out of it would average it away', () => {
    // The card never said back for this dip, so its return is an ordinary step (3.5% against a bar of 4%) and weak: merged
    // with the dip it reads as no step at all, and the card's slip is lost with it.
    const fallOnly = anchorsOf([{ ...live[0]!, backWeek: null }])
    const levels = segmentLevels(runs, END, bar, undefined, fallOnly)!.levels
    expect(levels.map((l) => l.forced)).toEqual([undefined, 'fall', undefined])
    expect(Math.abs(levels[1]!.fromWeek - levels[0]!.fromWeek - 60)).toBeLessThanOrEqual(5)
    expect(levels[1]!.m).toBeLessThan(levels[0]!.m)
  })

  it('keeps nothing of a change the runs do not show', () => {
    const flat = simulate({ weeks: 160, perWeek: 5, level: { wanderSd: 0, runSd: 0.03 } }, 3)
    const levels = segmentLevels(flat, END, bar, undefined, anchorsOf(live))!.levels
    expect(levels.some((l) => l.forced !== undefined)).toBe(false)
    const fallOnly = anchorsOf([{ ...live[0]!, backWeek: null }])
    expect(
      segmentLevels(flat, END, bar, undefined, fallOnly)!.levels.some(
        (l) => l.forced !== undefined,
      ),
    ).toBe(false)
  })
})
