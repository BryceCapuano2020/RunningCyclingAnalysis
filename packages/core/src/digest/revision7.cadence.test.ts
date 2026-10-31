import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { cadenceInSportUnit, resolveGpxRunCadence } from './gpxCadence'
import { movingMask } from './masks'
import { readDigest } from './readDigest'
import { serializeDigest } from './serialize'
import { gpxRun, lockedRun } from './test/gateFixtures'

const SEVEN = 7

/** A GPX run of 40 minutes at 1.63 m/s whose `<cad>` is constantly `value`, or with `edit` applied. */
function constantRun(value: number, edit: (a: Activity) => void = () => {}): Activity {
  const run = gpxRun(value)
  run.cadence!.fill(value)
  edit(run)
  return run
}

const resolved = (a: Activity) => resolveGpxRunCadence(a, movingMask(a))

describe('a GPX run’s cadence unit', () => {
  it('resolves a median of 65 to 98 as strides, doubled', () => {
    for (const m of [65, 78, 95, 96, 98]) expect(resolved(constantRun(m))![0], `${m}`).toBe(2 * m)
  })

  it('resolves a median of 135 or more as steps, as written', () => {
    for (const m of [135, 140, 160, 190]) expect(resolved(constantRun(m))![0], `${m}`).toBe(m)
  })

  it('leaves the gap between the bands, and anything under it, unresolved: never a guess', () => {
    for (const m of [30, 55, 64, 99, 100, 105, 110, 112, 130, 134]) {
      expect(resolved(constantRun(m)), `${m}`).toBeNull()
    }
  })

  it('needs 60 moving seconds at running speed, and reads only those', () => {
    const slow = constantRun(78, (a) => a.speed.fill(1.0))
    expect(resolved(slow)).toBeNull()
    const brief = constantRun(78, (a) => a.speed.fill(1.0, 0, a.n - 59))
    expect(resolved(brief)).toBeNull()
    const enough = constantRun(78, (a) => a.speed.fill(1.0, 0, a.n - 60))
    expect(resolved(enough)).not.toBeNull()
    const paused = constantRun(78, (a) => a.paused.fill(1, 0, a.n - 59))
    expect(resolved(paused)).toBeNull()
  })

  it('resolves nothing for a file with a known unit, or without cadence', () => {
    const fit = constantRun(156, (a) => {
      a.cadenceUnit = 'steps/min'
    })
    expect(resolved(fit)).toBeNull()
    expect(cadenceInSportUnit(fit, movingMask(fit))).toBe(fit.cadence)
    const none = gpxRun(78)
    delete none.cadence
    delete none.cadenceUnit
    expect(cadenceInSportUnit(none, movingMask(none))).toBeNull()
  })

  it('does not change the Activity it reads', () => {
    const run = constantRun(78)
    const before = Float32Array.from(run.cadence!)
    digestActivityAt(run, SEVEN)
    expect(run.cadenceUnit).toBe('unknown')
    expect(Array.from(run.cadence!)).toEqual(Array.from(before))
  })
})

describe('the walking-pace rule on a GPX run, at revision 7', () => {
  const walking = (a: Activity) => digestActivityAt(a, SEVEN).walkingPace === true

  it('G1: a 16:30 run with strides near 78 is not walking', () => {
    expect(walking(gpxRun(78))).toBe(false)
  })

  it('G2: a hike with strides near 55 is walking', () => {
    expect(walking(gpxRun(55))).toBe(true)
  })

  it('G3: a hike with steps near 112 falls in the gap and is walking by today’s rule', () => {
    expect(walking(gpxRun(112))).toBe(true)
  })

  it('G4: a run/walk with strides near 80 is not walking, its walk seconds included', () => {
    const session = gpxRun(78, 11)
    for (let start = 0; start < session.n; start += 240) {
      session.speed.fill(2.6, start, start + 60)
      session.cadence!.fill(82, start, start + 60)
    }
    expect(walking(session)).toBe(false)
  })

  it('G5: a median between 99 and 134 is unresolved and so walking, as today', () => {
    for (const m of [99, 110, 120, 134]) expect(walking(constantRun(m)), `${m}`).toBe(true)
  })

  it('G6: no cadence is walking, as today', () => {
    const run = gpxRun(78)
    delete run.cadence
    delete run.cadenceUnit
    expect(walking(run)).toBe(true)
  })

  it('G7: a phone app’s steps near 160 are not walking', () => {
    expect(walking(gpxRun(160))).toBe(false)
  })

  it('G8: the same run as a FIT or TCX file is unchanged by the revision', () => {
    const fit = gpxRun(156)
    fit.cadenceUnit = 'steps/min'
    const before = digestActivityAt(fit, 6)
    const after = digestActivityAt(fit, SEVEN)
    expect(after.walkingPace).toBeUndefined()
    expect({ ...after, modelRevision: 6 }).toEqual(before)
  })

  it('G9: at revision 6 the same GPX run is still walking: the gate is closed', () => {
    expect(digestActivityAt(gpxRun(78), 6).walkingPace).toBe(true)
    expect(digestActivity(gpxRun(78)).walkingPace).toBe(true)
  })
})

describe('the cadence-lock flag in a digest, at revision 7', () => {
  const at7 = (a: Activity) => digestActivityAt(a, SEVEN)

  it('flags a lock, counts it, and keeps the locked seconds out of the maximum', () => {
    const locked = lockedRun(60)
    const before = digestActivityAt(locked, 6)
    const after = at7(locked)
    expect(before.flagCounts['hr-cadence-lock']).toBeUndefined()
    expect(after.flagCounts['hr-cadence-lock']).toBe(1)
    const flag = after.flags.find((f) => f.kind === 'hr-cadence-lock')!
    expect(flag.start).toBe(595)
    expect(flag.end).toBe(665)
    expect(flag.message).toBe('Heart rate matched cadence for 70 seconds')
    // The lock lifted the strap from about 150 to the cadence's 172; without it the maximum is the honest one.
    expect(before.maxHeartRate!).toBeGreaterThan(165)
    expect(after.maxHeartRate!).toBeLessThan(158)
    expect(after.avgHeartRate!).toBeLessThan(before.avgHeartRate!)
  })

  it('does not flag a lock of 20 s, and then the digest is the revision-6 one', () => {
    const short = lockedRun(20)
    expect({ ...at7(short), modelRevision: 6 }).toEqual(digestActivityAt(short, 6))
  })

  it('ignores a lock while paused', () => {
    const locked = lockedRun(90)
    locked.paused.fill(1, 590, 700)
    expect(at7(locked).flagCounts['hr-cadence-lock']).toBeUndefined()
  })

  it('does not flag a flat heart rate equal to a flat cadence', () => {
    const flat = lockedRun(0)
    flat.cadence!.fill(170)
    flat.heartRate.fill(170)
    expect(at7(flat).flagCounts['hr-cadence-lock']).toBeUndefined()
  })

  it('keeps a spike and a lock as two flags, both out of the maximum', () => {
    const run = lockedRun(60)
    run.heartRate.fill(250, 1200, 1203)
    const digest = at7(run)
    expect(digest.flagCounts['hr-cadence-lock']).toBe(1)
    expect(digest.flagCounts['hr-spike']).toBeGreaterThan(0)
    expect(digest.maxHeartRate!).toBeLessThan(158)
    const starts = digest.flags.map((f) => f.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('checks a GPX run only once its unit is resolved', () => {
    /** The strap repeats the cadence the file wrote, whatever its unit. */
    const lockOn = (run: Activity, factor: number) => {
      for (let i = 600; i < 700; i++) run.heartRate[i] = run.cadence![i]! * factor
    }
    // Strides near 78 resolve to steps near 156, and a strap repeating them is a lock.
    const resolvable = gpxRun(78)
    lockOn(resolvable, 2)
    expect(at7(resolvable).flagCounts['hr-cadence-lock']).toBe(1)
    // A median in the gap has no unit, so the same strap is never compared.
    const unresolved = gpxRun(112)
    lockOn(unresolved, 1)
    expect(at7(unresolved).flagCounts['hr-cadence-lock']).toBeUndefined()
  })

  it('survives every view of the reader, a create included', () => {
    const wire = JSON.parse(serializeDigest(at7(lockedRun(60)))) as Record<string, unknown>
    for (const view of ['create', 'stored', 'device'] as const) {
      expect(readDigest(wire, view).flagCounts['hr-cadence-lock'], view).toBe(1)
    }
  })
})
