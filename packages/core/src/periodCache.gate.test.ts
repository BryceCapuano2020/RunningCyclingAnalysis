import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL } from './constants'
import { rideGateOf } from './digest/estimatedRide'
import { orderedCurrent } from './digest/ordered'
import { ride, SETTINGS } from './digest/test/estimatedRideFixture'
import { PeriodCache } from './periodCache'
import { RecordsCache } from './sessionRecords'
import type { ActivityDigest } from './types'

/** Ten power-meter rides whose 5 min heart rate rises `slope` bpm a watt, and a ride without one with a window to judge. */
function library(slope: number): ActivityDigest[] {
  const measured = Array.from({ length: 10 }, (_, i) =>
    ride(`m${i}`, i, 'measured', {
      300: { watts: 200 + 10 * i, heartRate: Math.round(90 + slope * (200 + 10 * i)) },
    }),
  )
  return [...measured, ride('v', 20, 'virtual', { 300: { watts: 240, heartRate: 150 } })]
}

const rides = library(0.35)
const gate = rideGateOf(orderedCurrent(rides), new Set())
/** The same lines made again from the same rides: a different object, the same gate. */
const sameGate = rideGateOf(orderedCurrent(library(0.35)), new Set())
/** A gate whose lines differ. */
const otherGate = rideGateOf(orderedCurrent(library(0.2)), new Set())
const previous = library(0.35).map((d) =>
  Object.assign({}, d, { id: `p-${d.id}`, startMs: d.startMs - 1e10 }),
)

describe('the gates differ only as intended', () => {
  it('has equal lines for equal rides and other lines for other rides', () => {
    expect(gate).not.toBeNull()
    expect(sameGate).not.toBe(gate)
    expect([...sameGate!.lines]).toEqual([...gate!.lines])
    expect([...otherGate!.lines]).not.toEqual([...gate!.lines])
  })
})

describe('PeriodCache and the library’s ride gate', () => {
  it('keeps the analysis for an equal gate, redoes it for another or none, and keeps the way back', () => {
    const cache = new PeriodCache()
    const first = cache.analysis(rides, SETTINGS, [], undefined, undefined, gate)
    expect(cache.analysis(rides, SETTINGS, [], undefined, undefined, sameGate)).toBe(first)
    const other = cache.analysis(rides, SETTINGS, [], undefined, undefined, otherGate)
    expect(other).not.toBe(first)
    const none = cache.analysis(rides, SETTINGS, [], undefined, undefined, null)
    expect(none).not.toBe(first)
    expect(none).not.toBe(other)
    expect(cache.analysis(rides, SETTINGS, [], undefined, undefined, gate)).toBe(first)
    expect(cache.analysis(rides, SETTINGS, [], undefined, undefined, null)).toBe(none)
  })

  it('keeps the trend for an equal gate and redoes it when the gate changes or goes', () => {
    const cache = new PeriodCache()
    const trend = (g: typeof gate) => cache.trends(rides, SETTINGS, null, null, undefined, g)
    const first = trend(gate)
    expect(trend(sameGate)[300]).toBe(first[300])
    expect(trend(otherGate)[300]).not.toBe(first[300])
    expect(trend(null)[300]).not.toBe(first[300])
    // Each change replaced the cached trend, so the unchanged gate is worked out again, to the same points.
    expect(trend(gate)[300]).toEqual(first[300])
  })

  it('keeps the previous period’s curves for an equal gate and redoes them when it changes or goes', () => {
    const cache = new PeriodCache()
    const model = { ...DEFAULT_BIKE_MODEL }
    const curves = (g: typeof gate) => cache.previousCurves(rides, previous, SETTINGS, model, g)
    const first = curves(gate)
    expect(curves(sameGate)).toBe(first)
    const other = curves(otherGate)
    expect(other).not.toBe(first)
    const none = curves(null)
    expect(none).not.toBe(other)
  })
})

describe('RecordsCache and the library’s ride gate', () => {
  it('keeps the holders for an equal gate and redoes them when it changes or goes', () => {
    const cache = new RecordsCache()
    const first = cache.holders(rides, SETTINGS, gate)
    expect(cache.holders(rides, SETTINGS, sameGate)).toBe(first)
    const other = cache.holders(rides, SETTINGS, otherGate)
    expect(other).not.toBe(first)
    const none = cache.holders(rides, SETTINGS, null)
    expect(none).not.toBe(other)
    expect(cache.holders(rides, SETTINGS, null)).toBe(none)
  })
})
