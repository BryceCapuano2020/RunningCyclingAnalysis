import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import type { ThresholdStep, ThresholdTimeline } from '../digest/thresholdTimelineTypes'
import { thresholdAt } from '../digest/thresholdTimelineTypes'
import type { CriticalPowerFit } from '../types'
import { settledThresholds } from './settleThresholds'

const WEEK_MS = 7 * DAY_MS
const START = Date.UTC(2024, 0, 7)

const fitOf = (cp: number, cpSe = 0.1): CriticalPowerFit => ({
  cp,
  wPrime: 100,
  cpSe,
  r2: 0.99,
  nPoints: 6,
})

/** A run of steps from [week, cp] pairs; a null cp is a window with no fit. */
function stepsOf(points: [number, number | null][]): ThresholdStep[] {
  let lastFit = -1
  return points.map(([week, cp], i) => {
    if (cp !== null) lastFit = i
    return {
      fromMs: START + week * WEEK_MS,
      fit: cp === null ? null : fitOf(cp),
      asOfMs: START + (week - 1) * WEEK_MS,
      lastFit,
    }
  })
}

const BOTH = { run: fitOf(15), ride: fitOf(15) }
const settledRun = (points: [number, number | null][]) =>
  settledThresholds({ run: stepsOf(points), ride: [] }, BOTH).run
const cps = (steps: ThresholdStep[]) => steps.map((step) => step.fit?.cp ?? null)

describe('settledThresholds', () => {
  it('holds the threshold through a move smaller than its own standard error', () => {
    const run = settledRun([
      [0, 15],
      [3, 15.05],
      [6, 14.95],
      [9, 15.08],
      [12, 15],
    ])
    expect(cps(run)).toEqual([15, 15, 15, 15, 15])
  })

  it('does not follow a hard effort passing through the window: a step that goes back within two weeks', () => {
    // 15 -> 17 for one week -> 15, and a rise that stays: 15 -> 17 for six weeks.
    const spike = settledRun([
      [0, 15],
      [4, 17],
      [5, 15.02],
      [10, 15],
    ])
    expect(cps(spike)).toEqual([15, 15, 15, 15])
    const stays = settledRun([
      [0, 15],
      [4, 17],
      [10, 17.05],
      [14, 17],
    ])
    expect(cps(stays)).toEqual([15, 17, 17, 17])
  })

  it('follows a rise that continues past the held threshold, however short each step', () => {
    const climb = settledRun([
      [0, 15],
      [4, 16],
      [5, 17],
      [6, 18],
      [12, 18.01],
    ])
    expect(cps(climb)).toEqual([15, 16, 17, 18, 18.01])
  })

  it('takes the newest fit as it is, the library own figure', () => {
    const run = settledRun([
      [0, 15],
      [4, 15.05],
      [5, 15.04],
    ])
    expect(cps(run)).toEqual([15, 15, 15.04])
  })

  it('leaves a window without a fit without one, and keeps where the last fit stood', () => {
    const run = settledRun([
      [0, 15],
      [10, null],
      [30, 15.04],
      [40, 15.05],
    ])
    expect(cps(run)).toEqual([15, null, 15, 15.05])
    expect(run.map((step) => step.lastFit)).toEqual([0, 0, 2, 3])
    expect(thresholdAt(run, START + 12 * WEEK_MS)).toMatchObject({ asOfMs: START + -1 * WEEK_MS })
  })

  it('dates a held threshold by the window that last agreed with it, not by a spike it ignored', () => {
    const run = settledRun([
      [0, 15],
      [4, 17],
      [5, 15.02],
      [30, null],
    ])
    // The spike at step 1 is ignored and keeps step 0's date; step 2 agrees with the held fit and dates it afresh.
    expect(run[1]!.asOfMs).toBe(run[0]!.asOfMs)
    expect(run[2]!.asOfMs).toBe(START + 4 * WEEK_MS)
    expect(thresholdAt(run, START + 32 * WEEK_MS)!.asOfMs).toBe(run[2]!.asOfMs)
  })

  it('has no fit in a sport whose whole-library fit is refused, and still has its steps', () => {
    const timeline: ThresholdTimeline = {
      run: stepsOf([
        [0, 15],
        [4, 16],
      ]),
      ride: stepsOf([
        [0, 3],
        [4, 3.2],
      ]),
    }
    const settled = settledThresholds(timeline, { run: fitOf(15), ride: null })
    expect(settled.run.map((step) => step.fit?.cp)).toEqual([15, 16])
    expect(settled.ride).toHaveLength(2)
    expect(settled.ride.every((step) => step.fit === null && step.lastFit === -1)).toBe(true)
    expect(thresholdAt(settled.ride, START + 5 * WEEK_MS)).toBeNull()
  })

  it('changes nothing for a timeline that already holds still', () => {
    const flat = stepsOf([
      [0, 15],
      [4, 15],
      [8, 15],
    ])
    expect(settledThresholds({ run: flat, ride: [] }, BOTH).run).toEqual(flat)
  })
})
