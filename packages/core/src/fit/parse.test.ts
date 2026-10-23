import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { encodeFit } from './encode'
import { DEFAULT_PARSE_LIMITS, parseFit } from './parse'
import type { ParseResult } from './parse'
import { buildFit, secondly } from './fitTestFiles'
import { FILE_TYPE, SPORT } from './protocol/profile'
import { FILE_ID_LAYOUT, RECORD_LAYOUT, SESSION_LAYOUT } from './protocol/layouts'
import { FitWriter } from './protocol/writer'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)
const E_BIKE = 'E-bike activities are not supported because motor assistance hides your own power'

interface FixtureOptions {
  withPower?: boolean
  /** Indexes in [pauseFrom, pauseTo) are paused: speed and power 0, no heart rate. */
  pauseFrom?: number
  pauseTo?: number
}

/** Deterministic activity whose values sit on the FIT field grid, so they survive a round trip. */
function makeActivity(sport: Sport, n: number, options: FixtureOptions = {}): Activity {
  const { withPower = true, pauseFrom = 0, pauseTo = 0 } = options
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const heartRate = new Float64Array(n)
  const power = new Float64Array(n)
  const paused = new Uint8Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const isPaused = i >= pauseFrom && i < pauseTo
    const v = isPaused ? 0 : 4 + (i % 7) * 0.25
    speed[i] = v
    total += v
    distance[i] = total
    altitude[i] = 100 + i * 0.2
    paused[i] = isPaused ? 1 : 0
    heartRate[i] = isPaused ? NaN : 120 + (i % 30)
    power[i] = withPower ? (isPaused ? 0 : 200 + (i % 50)) : NaN
  }
  return {
    id: 'fixture',
    name: 'fixture',
    sport,
    startMs: START_MS,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused,
    hasPower: withPower,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let worst = 0
  for (let i = 0; i < a.length; i++) {
    worst = Math.max(worst, Math.abs(a[i]! - b[i]!))
  }
  return worst
}

/** Parses bytes that must succeed and returns the first activity. */
function firstActivity(result: ParseResult): Activity {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  const [activity] = result.activities
  if (activity === undefined) throw new Error('expected at least one activity')
  return activity
}

/** Parses bytes that must fail and returns the reason. */
function reasonOf(result: ParseResult): string {
  if (result.ok) throw new Error('expected a failure')
  return result.reason
}

describe('parseFit round trip', () => {
  it('reproduces a ride with power and heart rate', () => {
    const original = makeActivity('ride', 120)
    const result = parseFit(encodeFit(original), 'Morning Ride.fit')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.activities.length).toBe(1)
    expect(result.skipped).toEqual([])

    const a = result.activities[0]!
    expect(a.sport).toBe('ride')
    expect(a.name).toBe('Morning Ride')
    expect(a.id).toBe(`${START_MS}-Morning Ride.fit`)
    expect(a.startMs).toBe(START_MS)
    expect(a.n).toBe(120)
    expect(a.hasPower).toBe(true)
    expect(a.hasHeartRate).toBe(true)
    expect(a.hasAltitude).toBe(true)
    expect(maxAbsDiff(a.speed, original.speed)).toBeLessThanOrEqual(0.001)
    expect(maxAbsDiff(a.distance, original.distance)).toBeLessThanOrEqual(0.01)
    expect(maxAbsDiff(a.altitude, original.altitude)).toBeLessThanOrEqual(0.1)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
    expect(Array.from(a.power)).toEqual(Array.from(original.power))
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
  })

  it('reproduces a run without power', () => {
    const original = makeActivity('run', 90, { withPower: false })
    const result = parseFit(encodeFit(original), 'tempo.fit')
    const a = firstActivity(result)
    expect(a.sport).toBe('run')
    expect(a.name).toBe('tempo')
    expect(a.n).toBe(90)
    expect(a.hasPower).toBe(false)
    expect(a.power.every((v) => Number.isNaN(v))).toBe(true)
    expect(maxAbsDiff(a.speed, original.speed)).toBeLessThanOrEqual(0.001)
    expect(maxAbsDiff(a.distance, original.distance)).toBeLessThanOrEqual(0.01)
    expect(Array.from(a.heartRate)).toEqual(Array.from(original.heartRate))
  })

  it('keeps a pause: no records inside it, so it parses back as paused', () => {
    const original = makeActivity('ride', 300, { pauseFrom: 120, pauseTo: 180 })
    const a = firstActivity(parseFit(encodeFit(original), 'paused.fit'))
    expect(a.n).toBe(300)
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
    expect(Array.from(a.speed.slice(119, 181))).toEqual(Array.from(original.speed.slice(119, 181)))
    expect(a.power[150]).toBe(0)
    expect(Number.isNaN(a.heartRate[150])).toBe(true)
    expect(a.distance[150]).toBe(original.distance[150])
    expect(maxAbsDiff(a.altitude, original.altitude)).toBeLessThanOrEqual(0.1)
  })

  it('uses timer events to preserve a short pause that gap inference would interpolate', () => {
    const original = makeActivity('ride', 90, { pauseFrom: 40, pauseTo: 45 })
    const a = firstActivity(parseFit(encodeFit(original), 'short-pause.fit'))
    expect(Array.from(a.paused)).toEqual(Array.from(original.paused))
    expect(Array.from(a.speed.slice(39, 46))).toEqual([
      original.speed[39],
      0,
      0,
      0,
      0,
      0,
      original.speed[45],
    ])
    expect(Array.from(a.power.slice(39, 46))).toEqual([
      original.power[39],
      0,
      0,
      0,
      0,
      0,
      original.power[45],
    ])
  })

  it('starts an independently encoded timer pause at the stop timestamp, including interior records', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'cycling',
          startMs: START_MS,
          durationS: 60,
          records: secondly(START_MS, 60, { speed: 8, power: 220, altitude: 100 }),
        },
      ],
      timerEvents: [
        { tMs: START_MS, eventType: 'start' },
        { tMs: START_MS + 30_000, eventType: 'stop' },
        { tMs: START_MS + 36_000, eventType: 'start' },
        { tMs: START_MS + 60_000, eventType: 'stop' },
      ],
    })
    const activity = firstActivity(parseFit(bytes, 'timer-stop.fit'))
    expect(Array.from(activity.paused.slice(27, 39))).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0])
    expect(Array.from(activity.speed.slice(30, 36))).toEqual([0, 0, 0, 0, 0, 0])
    expect(Array.from(activity.power.slice(30, 36))).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('reads a file with no position as outdoor when its sport is not an indoor one', () => {
    const original = makeActivity('ride', 60)
    expect(firstActivity(parseFit(encodeFit(original), 'a.fit')).indoor).toBe(false)
    expect(firstActivity(parseFit(encodeFit(original, { gps: true }), 'a.fit')).indoor).toBe(false)
  })

  it('keeps the climb of a hilly run recorded without GPS, so it is not treated as flat', () => {
    // Altitude rises 0.2 m per second, about 12 m a minute, with no position written.
    const original = makeActivity('run', 300)
    const a = firstActivity(parseFit(encodeFit(original), 'hills.fit'))
    expect(a.indoor).toBe(false)
    expect(a.hasAltitude).toBe(true)
    expect(a.altitude[299]! - a.altitude[0]!).toBeCloseTo(59.8, 1)
  })

  it('marks a trainer ride with no position and no altitude indoor, though it is plain cycling', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'cycling',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 8, power: 200 }),
        },
      ],
    })
    const a = firstActivity(parseFit(bytes, 'trainer.fit'))
    expect(a.indoor).toBe(true)
    expect(a.hasAltitude).toBe(false)
  })

  it('keeps a run outdoors when a file from a watch has records without positions', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 120,
          records: secondly(START_MS, 120, { speed: 3, altitude: 50 }),
        },
      ],
    })
    expect(firstActivity(parseFit(bytes, 'gps-off.fit')).indoor).toBe(false)
  })
})

describe('parseFit validation', () => {
  it('rejects garbage bytes', () => {
    const garbage = new Uint8Array(100).map((_, i) => (i * 37) % 251)
    expect(parseFit(garbage, 'junk.fit')).toEqual({
      ok: false,
      fileName: 'junk.fit',
      reason: 'Not a FIT file',
    })
  })

  it('never throws, even for input that is not a byte array', () => {
    const notBytes = null as unknown as Uint8Array
    expect(parseFit(notBytes, 'broken.fit')).toEqual({
      ok: false,
      fileName: 'broken.fit',
      reason: 'Could not decode FIT file',
    })
  })

  it('rejects empty and very short input', () => {
    expect(parseFit(new Uint8Array(0), 'empty.fit')).toEqual({
      ok: false,
      fileName: 'empty.fit',
      reason: 'Not a FIT file',
    })
    expect(parseFit(new Uint8Array([14, 16, 0, 0, 0]), 'short.fit')).toEqual({
      ok: false,
      fileName: 'short.fit',
      reason: 'Not a FIT file',
    })
  })

  it('rejects a file whose header is valid but which holds no decodable records', () => {
    const bytes = encodeFit(makeActivity('ride', 120))
    const headerOnly = bytes.slice(0, 20)
    expect(parseFit(headerOnly, 'cut.fit')).toEqual({
      ok: false,
      fileName: 'cut.fit',
      reason: 'File is incomplete or corrupt',
    })
  })

  it('rejects files and sessions over configured ingestion quotas with clear reasons', () => {
    const bytes = encodeFit(makeActivity('ride', 60))
    expect(
      parseFit(bytes, 'large.fit', { ...DEFAULT_PARSE_LIMITS, maxFileBytes: bytes.length - 1 }),
    ).toEqual({
      ok: false,
      fileName: 'large.fit',
      reason: `FIT file exceeds the ${bytes.length - 1}-byte limit`,
    })
    expect(
      parseFit(bytes, 'many-records.fit', {
        ...DEFAULT_PARSE_LIMITS,
        maxRecordMessages: 10,
      }),
    ).toEqual({
      ok: false,
      fileName: 'many-records.fit',
      reason: 'FIT file exceeds the 10-record limit',
    })
    expect(
      parseFit(bytes, 'long.fit', { ...DEFAULT_PARSE_LIMITS, maxActivitySeconds: 30 }),
    ).toEqual({
      ok: false,
      fileName: 'long.fit',
      reason: 'Activity exceeds the 30-second time-grid limit',
    })
  })

  it('rejects a truncated file even when 60 or more of its records survive', () => {
    const bytes = buildFit({
      sportMesg: 'running',
      looseRecords: secondly(START_MS, 120, { speed: 3 }),
    })
    const truncated = bytes.slice(0, Math.floor(bytes.length * 0.7))
    expect(parseFit(truncated, 'partial.fit')).toEqual({
      ok: false,
      fileName: 'partial.fit',
      reason: 'File is incomplete or corrupt',
    })
  })

  it('rejects a truncated file with fewer than 60 records the same way', () => {
    const bytes = buildFit({
      sportMesg: 'running',
      looseRecords: secondly(START_MS, 30, { speed: 3 }),
    })
    const truncated = bytes.slice(0, Math.floor(bytes.length * 0.7))
    expect(parseFit(truncated, 'partial.fit')).toEqual({
      ok: false,
      fileName: 'partial.fit',
      reason: 'File is incomplete or corrupt',
    })
  })

  it('rejects a ride shorter than one minute', () => {
    const result = parseFit(encodeFit(makeActivity('ride', 59)), 'short.fit')
    expect(result).toEqual({
      ok: false,
      fileName: 'short.fit',
      reason: 'Activity is shorter than one minute',
    })
  })

  it('accepts a ride of exactly one minute', () => {
    const a = firstActivity(parseFit(encodeFit(makeActivity('ride', 60)), 'min.fit'))
    expect(a.n).toBe(60)
  })

  it('skips records without a timestamp when counting samples', () => {
    const untimed = new FitWriter()
    untimed.message(FILE_ID_LAYOUT, { type: FILE_TYPE.activity, timeCreated: 0 })
    untimed.message(SESSION_LAYOUT, { sport: SPORT.running })
    for (let i = 0; i < 70; i++) untimed.message(RECORD_LAYOUT, { enhancedSpeed: 3000 })
    expect(reasonOf(parseFit(untimed.finish(), 'x.fit'))).toBe(
      'Activity is shorter than one minute',
    )
    const timed = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 3 }),
        },
      ],
    })
    expect(parseFit(timed, 'x.fit').ok).toBe(true)
  })

  it('ignores a stray timestamp more than a day from the rest of the file', () => {
    const bytes = buildFit({
      sportMesg: 'running',
      looseRecords: [
        ...secondly(START_MS, 60, { speed: 4 }),
        { tMs: Date.UTC(1989, 11, 31, 12), speed: 99 },
      ],
    })
    const a = firstActivity(parseFit(bytes, 'stray.fit'))
    expect(a.startMs).toBe(START_MS)
    expect(a.n).toBe(60)
    expect(a.speed.every((v) => v === 4)).toBe(true)
  })
})

describe('parseFit sport mapping', () => {
  it('rejects an unsupported sport from the session', () => {
    const bytes = buildFit({
      sessions: [
        { sport: 'swimming', startMs: START_MS, durationS: 70, records: secondly(START_MS, 70) },
      ],
    })
    expect(parseFit(bytes, 'pool.fit')).toEqual({
      ok: false,
      fileName: 'pool.fit',
      reason: 'Unsupported sport: swimming',
    })
  })

  it('reports an unknown sport when the file names none', () => {
    const bytes = buildFit({ looseRecords: secondly(START_MS, 70, { speed: 3 }) })
    expect(parseFit(bytes, 'nosport.fit')).toEqual({
      ok: false,
      fileName: 'nosport.fit',
      reason: 'Unsupported sport: unknown',
    })
  })

  it('falls back to the sport message when the session has none', () => {
    const bytes = buildFit({
      sportMesg: 'running',
      sessions: [
        { startMs: START_MS, durationS: 70, records: secondly(START_MS, 70, { speed: 3 }) },
      ],
    })
    const a = firstActivity(parseFit(bytes, 'fallback.fit'))
    expect(a.sport).toBe('run')
  })

  it('reads a generic session sport from the sport message', () => {
    const bytes = buildFit({
      sportMesg: 'cycling',
      sessions: [
        {
          sport: 'generic',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 8 }),
        },
      ],
    })
    expect(firstActivity(parseFit(bytes, 'generic.fit')).sport).toBe('ride')
  })

  it('reads the sport from the session rather than a conflicting sport message', () => {
    const bytes = buildFit({
      sportMesg: 'running',
      sessions: [
        {
          sport: 'cycling',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 8 }),
        },
      ],
    })
    expect(firstActivity(parseFit(bytes, 'both.fit')).sport).toBe('ride')
  })

  it('rejects e-bike sessions with the motor-assistance reason', () => {
    const bike = makeActivity('ride', 70)
    expect(reasonOf(parseFit(encodeFit(bike, { subSport: 'eBikeMountain' }), 'ebike.fit'))).toBe(
      E_BIKE,
    )
    const bytes = buildFit({
      sessions: [
        { sport: 'eBiking', startMs: START_MS, durationS: 70, records: secondly(START_MS, 70) },
      ],
    })
    expect(reasonOf(parseFit(bytes, 'ebike.fit'))).toBe(E_BIKE)
  })

  it('maps indoor cycling and spin to ride, and treadmill to run, all indoor', () => {
    const records = secondly(START_MS, 70, { speed: 8 })
    for (const subSport of ['indoorCycling', 'spin'] as const) {
      const bytes = buildFit({
        sessions: [
          { sport: 'fitnessEquipment', subSport, startMs: START_MS, durationS: 70, records },
        ],
      })
      const a = firstActivity(parseFit(bytes, 'bike.fit'))
      expect(a.sport).toBe('ride')
      expect(a.indoor).toBe(true)
    }
    for (const subSport of ['treadmill', 'indoorRunning'] as const) {
      const bytes = buildFit({
        sessions: [
          { sport: 'fitnessEquipment', subSport, startMs: START_MS, durationS: 70, records },
        ],
      })
      const a = firstActivity(parseFit(bytes, 'run.fit'))
      expect(a.sport).toBe('run')
      expect(a.indoor).toBe(true)
    }
  })

  it('rejects other fitness equipment', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'fitnessEquipment',
          subSport: 'elliptical',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70),
        },
      ],
    })
    expect(reasonOf(parseFit(bytes, 'elliptical.fit'))).toBe('Unsupported sport: fitnessEquipment')
  })

  it('marks a virtual activity indoor even when it has a position', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'cycling',
          subSport: 'virtualActivity',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 8, gps: true }),
        },
      ],
    })
    expect(firstActivity(parseFit(bytes, 'zwift.fit')).indoor).toBe(true)
  })

  it('marks an outdoor run with GPS positions as not indoor', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 70,
          records: secondly(START_MS, 70, { speed: 3, gps: true }),
        },
      ],
    })
    expect(firstActivity(parseFit(bytes, 'road.fit')).indoor).toBe(false)
  })
})

describe('parseFit multi-session files', () => {
  it('splits a duathlon into a run and a ride, with suffixed ids and names', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 600,
          records: secondly(START_MS, 600, { speed: 3, gps: true }),
        },
        {
          sport: 'cycling',
          startMs: START_MS + 700_000,
          durationS: 900,
          records: secondly(START_MS + 700_000, 900, { speed: 8, gps: true }),
        },
      ],
    })
    const result = parseFit(bytes, 'duathlon.fit')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skipped).toEqual([])
    expect(result.activities.map((a) => a.sport)).toEqual(['run', 'ride'])
    const [run, ride] = result.activities
    expect(run?.id).toBe(`${START_MS}-duathlon.fit#0`)
    expect(run?.name).toBe('duathlon (run)')
    expect(run?.startMs).toBe(START_MS)
    expect(run?.n).toBe(600)
    expect(ride?.id).toBe(`${START_MS + 700_000}-duathlon.fit#1`)
    expect(ride?.name).toBe('duathlon (ride)')
    expect(ride?.startMs).toBe(START_MS + 700_000)
    expect(ride?.n).toBe(900)
    expect(ride?.speed[899]).toBeCloseTo(8, 10)
  })

  it('skips a swim in a triathlon and keeps the ride and run', () => {
    const t1 = START_MS + 400_000
    const t2 = START_MS + 1_400_000
    const bytes = buildFit({
      sessions: [
        { sport: 'swimming', startMs: START_MS, durationS: 300, records: secondly(START_MS, 300) },
        {
          sport: 'cycling',
          startMs: t1,
          durationS: 900,
          records: secondly(t1, 900, { speed: 8, gps: true }),
        },
        {
          sport: 'running',
          startMs: t2,
          durationS: 600,
          records: secondly(t2, 600, { speed: 3, gps: true }),
        },
      ],
    })
    const result = parseFit(bytes, 'tri.fit')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skipped).toEqual(['swimming session skipped'])
    expect(result.activities.map((a) => a.sport)).toEqual(['ride', 'run'])
    expect(result.activities.map((a) => a.id)).toEqual([`${t1}-tri.fit#1`, `${t2}-tri.fit#2`])
  })

  it('skips an e-bike session in a multi-session file with a short reason', () => {
    const t1 = START_MS + 700_000
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 600,
          records: secondly(START_MS, 600, { speed: 3 }),
        },
        { sport: 'eBiking', startMs: t1, durationS: 900, records: secondly(t1, 900, { speed: 8 }) },
      ],
    })
    const result = parseFit(bytes, 'mixed.fit')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.skipped).toEqual(['e-bike session skipped'])
      expect(result.activities.map((a) => a.sport)).toEqual(['run'])
    }
  })

  it('skips a session shorter than one minute', () => {
    const t1 = START_MS + 700_000
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 600,
          records: secondly(START_MS, 600, { speed: 3 }),
        },
        { sport: 'cycling', startMs: t1, durationS: 30, records: secondly(t1, 30, { speed: 8 }) },
      ],
    })
    const result = parseFit(bytes, 'short-ride.fit')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.skipped).toEqual(['session shorter than one minute'])
      expect(result.activities.length).toBe(1)
    }
  })

  it('fails with the first specific reason when every session is unusable', () => {
    const t1 = START_MS + 700_000
    const bytes = buildFit({
      sessions: [
        { sport: 'swimming', startMs: START_MS, durationS: 300, records: secondly(START_MS, 300) },
        { sport: 'eBiking', startMs: t1, durationS: 900, records: secondly(t1, 900) },
      ],
    })
    expect(parseFit(bytes, 'pool.fit')).toEqual({
      ok: false,
      fileName: 'pool.fit',
      reason: 'Unsupported sport: swimming',
    })
  })

  it('fails with the short-activity reason when every session is too short', () => {
    const t1 = START_MS + 700_000
    const bytes = buildFit({
      sessions: [
        { sport: 'running', startMs: START_MS, durationS: 30, records: secondly(START_MS, 30) },
        { sport: 'cycling', startMs: t1, durationS: 30, records: secondly(t1, 30) },
      ],
    })
    expect(reasonOf(parseFit(bytes, 'tiny.fit'))).toBe('Activity is shorter than one minute')
  })

  it('gives a record between two sessions to neither', () => {
    const t1 = START_MS + 100_000
    const bytes = buildFit({
      looseRecords: [],
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 60,
          records: secondly(START_MS, 60, { speed: 3 }),
        },
        {
          sport: 'cycling',
          startMs: t1,
          durationS: 60,
          records: [
            ...secondly(START_MS + 70_000, 5, { speed: 9 }),
            ...secondly(t1, 60, { speed: 8 }),
          ],
        },
      ],
    })
    const result = parseFit(bytes, 'gap.fit')
    expect(result.ok).toBe(true)
    if (result.ok) {
      const [run, ride] = result.activities
      expect(run?.n).toBe(60)
      expect(ride?.n).toBe(60)
      expect(ride?.speed.every((v) => v === 8)).toBe(true)
    }
  })
})

describe('parseFit file names', () => {
  it('strips directories and the .fit and .fit.gz extensions', () => {
    const bytes = encodeFit(makeActivity('ride', 60))
    const names = ['rides/Sunday Loop.fit', 'C:\\rides\\Sunday Loop.FIT', 'Sunday Loop.fit.gz'].map(
      (fileName) => {
        const result = parseFit(bytes, fileName)
        return result.ok ? result.activities[0]?.name : null
      },
    )
    expect(names).toEqual(['Sunday Loop', 'Sunday Loop', 'Sunday Loop'])
  })
})

describe('parseFit hardening', () => {
  const HOUR = 3_600_000
  const DAY = 24 * HOUR

  it('rejects a file with a flipped bit as corrupt, whatever the byte', () => {
    const bytes = encodeFit(makeActivity('ride', 120))
    for (const at of [40, 200, 900, bytes.length - 10, bytes.length - 1]) {
      const flipped = bytes.slice()
      flipped[at] = flipped[at]! ^ 0x04
      expect(reasonOf(parseFit(flipped, 'flip.fit'))).toBe('File is corrupt (checksum mismatch)')
    }
  })

  it('rejects a truncated file as incomplete rather than decoding the part that is left', () => {
    const bytes = encodeFit(makeActivity('ride', 120))
    const cut = bytes.slice(0, Math.floor(bytes.length * 0.7))
    expect(reasonOf(parseFit(cut, 'cut.fit'))).toBe('File is incomplete or corrupt')
  })

  it('says a file with no records contains no activity records', () => {
    const bytes = buildFit({
      sessions: [{ sport: 'running', startMs: START_MS, durationS: 70, records: [] }],
    })
    expect(parseFit(bytes, 'empty.fit')).toEqual({
      ok: false,
      fileName: 'empty.fit',
      reason: 'File contains no activity records',
    })
  })

  it('does not count two records 20 hours apart as a minute of activity', () => {
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 20 * 3600,
          records: [
            { tMs: START_MS, speed: 3 },
            { tMs: START_MS + 20 * HOUR, speed: 3 },
          ],
        },
      ],
    })
    expect(reasonOf(parseFit(bytes, 'two.fit'))).toBe('Activity is shorter than one minute')
  })

  it('rejects one session whose records span more than 48 hours', () => {
    // Records every 30 minutes for 60 hours. Records more than a day from the median are treated
    // as clock errors, so the 48 hours that remain are the longest span an activity can keep.
    const records = Array.from({ length: 121 }, (_, i) => ({
      tMs: START_MS + i * 30 * 60_000,
      speed: 3,
    }))
    const bytes = buildFit({
      sessions: [{ sport: 'running', startMs: START_MS, durationS: 60 * 3600, records }],
    })
    expect(reasonOf(parseFit(bytes, 'long.fit'))).toBe('Activity is longer than 48 hours')
  })

  it('caps the grid samples summed over every session of one file', () => {
    // A record every minute for 20 hours: one continuous 72,001-sample activity per session.
    const sessions = [0, 1, 2].map((k) => {
      const startMs = START_MS + k * 25 * HOUR
      const records = Array.from({ length: 1201 }, (_, i) => ({
        tMs: startMs + i * 60_000,
        speed: 3,
      }))
      return { sport: 'running' as const, startMs, durationS: 20 * 3600, records }
    })
    expect(reasonOf(parseFit(buildFit({ sessions }), 'many.fit'))).toBe(
      'File contains too much data',
    )
  })

  it('rejects 600 sessions of two far-apart records without allocating for each', () => {
    const sessions = Array.from({ length: 600 }, (_, k) => {
      const startMs = START_MS + k * 25 * HOUR
      return {
        sport: 'running' as const,
        startMs,
        durationS: 20 * 3600,
        records: [
          { tMs: startMs, speed: 3 },
          { tMs: startMs + 20 * HOUR, speed: 3 },
        ],
      }
    })
    expect(parseFit(buildFit({ sessions }), 'sparse.fit').ok).toBe(false)
  })

  it('splits a 30 hour gap into two activities and loses no records', () => {
    const second = START_MS + 31 * HOUR
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 32 * 3600,
          records: [
            ...secondly(START_MS, 3600, { speed: 3 }),
            ...secondly(second, 3600, { speed: 3 }),
          ],
        },
      ],
    })
    const result = parseFit(bytes, 'gap.fit')
    if (!result.ok) throw new Error(result.reason)
    expect(result.activities.map((a) => a.n)).toEqual([3600, 3600])
    expect(result.activities.map((a) => a.startMs)).toEqual([START_MS, second])
    expect(result.activities.map((a) => a.name)).toEqual(['gap (part 1)', 'gap (part 2)'])
    expect(result.activities[0]?.id).not.toBe(result.activities[1]?.id)
  })

  it('splits a 20 hour gap into two activities rather than one 21 hour activity', () => {
    const second = START_MS + 21 * HOUR
    const bytes = buildFit({
      sessions: [
        {
          sport: 'cycling',
          startMs: START_MS,
          durationS: 22 * 3600,
          records: [
            ...secondly(START_MS, 3600, { speed: 8 }),
            ...secondly(second, 3600, { speed: 8 }),
          ],
        },
      ],
    })
    const result = parseFit(bytes, 'gap20.fit')
    if (!result.ok) throw new Error(result.reason)
    expect(result.activities.map((a) => a.n)).toEqual([3600, 3600])
  })

  it('matches thousands of records to sessions without a quadratic scan', () => {
    const count = 2800
    const sessions = Array.from({ length: count }, (_, k) => {
      const startMs = START_MS + k * 120_000
      return {
        sport: 'cycling' as const,
        startMs,
        durationS: 60,
        records: secondly(startMs, 60, { speed: 8 }),
      }
    })
    const bytes = buildFit({ sessions })
    const began = performance.now()
    const result = parseFit(bytes, 'many-sessions.fit')
    const elapsed = performance.now() - began
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.activities.length).toBe(count)
    expect(elapsed).toBeLessThan(2000)
  })

  it('rejects an activity dated before 2000', () => {
    const startMs = Date.UTC(1999, 11, 31, 23)
    const bytes = buildFit({
      sessions: [
        { sport: 'running', startMs, durationS: 70, records: secondly(startMs, 70, { speed: 3 }) },
      ],
    })
    expect(reasonOf(parseFit(bytes, 'old.fit'))).toBe('Activity date is not plausible')
  })

  it('rejects an activity more than a day after the injected clock', () => {
    const bytes = encodeFit(makeActivity('ride', 120))
    expect(
      reasonOf(parseFit(bytes, 'future.fit', DEFAULT_PARSE_LIMITS, { nowMs: START_MS - 2 * DAY })),
    ).toBe('Activity date is not plausible')
    expect(
      parseFit(bytes, 'soon.fit', DEFAULT_PARSE_LIMITS, { nowMs: START_MS - 12 * HOUR }).ok,
    ).toBe(true)
  })

  it('drops impossible speed, power and heart rate values and counts them', () => {
    const records = secondly(START_MS, 70, { speed: 8, power: 200, heartRate: 140 })
    records[10] = { tMs: START_MS + 10_000, speed: 40, power: 3500, heartRate: 252 }
    records[20] = { tMs: START_MS + 20_000, speed: 8, power: 200, heartRate: 10 }
    const bytes = buildFit({
      sessions: [{ sport: 'cycling', startMs: START_MS, durationS: 70, records }],
    })
    const result = parseFit(bytes, 'bad-values.fit')
    if (!result.ok) throw new Error(result.reason)
    const [a] = result.activities
    expect(a?.speed[10]).toBe(8)
    expect(a?.power[10]).toBe(200)
    expect(a?.heartRate[10]).toBe(140)
    expect(a?.heartRate[20]).toBe(140)
    expect(result.droppedValues).toBe(4)
  })

  it('treats a run speed derived from distance above 12.5 m/s as missing', () => {
    const records = Array.from({ length: 70 }, (_, i) => ({
      tMs: START_MS + i * 1000,
      distance: i * 100,
    }))
    const bytes = buildFit({
      sessions: [{ sport: 'running', startMs: START_MS, durationS: 70, records }],
    })
    const result = parseFit(bytes, 'jumpy.fit')
    if (!result.ok) throw new Error(result.reason)
    const [a] = result.activities
    expect(a?.speed.every((v) => Number.isNaN(v) || v <= 12.5)).toBe(true)
    expect(result.droppedValues).toBeGreaterThan(0)
  })

  it('gives an overlapping record to the latest-starting session and reports the overlap', () => {
    const second = START_MS + 300_000
    const bytes = buildFit({
      sessions: [
        {
          sport: 'running',
          startMs: START_MS,
          durationS: 600,
          records: secondly(START_MS, 600, { speed: 3 }),
        },
        {
          sport: 'running',
          startMs: second,
          durationS: 600,
          records: secondly(second, 600, { speed: 3 }),
        },
      ],
    })
    const result = parseFit(bytes, 'overlap.fit')
    if (!result.ok) throw new Error(result.reason)
    expect(result.skipped).toEqual(['Sessions overlap; times were adjusted'])
    const [first, later] = result.activities
    expect(first?.n).toBe(300)
    expect(later?.n).toBe(600)
  })
})
