import { describe, expect, it } from 'vitest'
import type { RawRecord } from '../fit/resample'
import type { GpsFix } from './gps'
import type { PipelineUnit } from './pipeline'
import { activitiesFromRecords, activitiesFromUnits, baseName } from './pipeline'
import { DEFAULT_PARSE_LIMITS } from './result'
import type { ParseResult } from './result'

const START = Date.UTC(2024, 4, 1, 7, 30, 0)
const NOW = Date.UTC(2024, 5, 1)
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** One record per second from startMs: a steady run with altitude, heart rate and power. */
function steadyRecords(count: number, startMs = START): RawRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    tMs: startMs + i * 1000,
    speed: 4,
    distance: 4 * i,
    altitude: 100,
    heartRate: 140,
    power: 200,
  }))
}

function unitOf(records: RawRecord[]): PipelineUnit {
  return {
    records,
    timerEvents: [],
    sport: 'run',
    sportLabel: 'running',
    indoor: false,
    hasPosition: true,
  }
}

function succeeded(result: ParseResult): Extract<ParseResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`)
  return result
}

describe('activitiesFromRecords', () => {
  it('turns a minimal valid record list into one activity', () => {
    const result = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(60)), fileName: 'morning.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )

    expect(result.skipped).toEqual([])
    expect(result.droppedValues).toBe(0)
    expect(result.activities).toHaveLength(1)
    expect(result.activities[0]).toMatchObject({
      id: `${START}-morning.gpx`,
      name: 'morning',
      sport: 'run',
      indoor: false,
      startMs: START,
      n: 60,
    })
  })

  it('accepts a sparsely recorded track by the seconds its records cover, in any format', () => {
    // Smart recording: one fix every 5 s for 3 minutes is 37 records but 181 covered seconds.
    const sparse = steadyRecords(37)
    sparse.forEach((r, i) => {
      r.tMs = START + i * 5000
      r.distance = 20 * i
    })
    const result = succeeded(
      activitiesFromRecords({ ...unitOf(sparse), fileName: 'smart.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    )
    expect(result.activities[0]?.n).toBe(181)
  })

  it('refuses a long but sparse track as sparse, not as short', () => {
    // 22 fixes 50 s apart span over 17 minutes but vouch for only 22 seconds.
    const sparse = steadyRecords(22)
    for (const [i, r] of sparse.entries()) {
      r.tMs = START + i * 50_000
    }
    const result = activitiesFromRecords(
      { ...unitOf(sparse), fileName: 'sparse.gpx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/too sparsely/) })
  })

  it('refuses records that cover less than one minute', () => {
    const result = activitiesFromRecords(
      { ...unitOf(steadyRecords(59)), fileName: 'short.gpx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )

    expect(result).toEqual({
      ok: false,
      fileName: 'short.gpx',
      reason: 'Activity is shorter than one minute',
    })
  })

  it('refuses seven records an hour apart, which cover seven seconds and not six hours', () => {
    const hourly = Array.from({ length: 7 }, (_, i) => ({
      tMs: START + i * HOUR_MS,
      speed: 4,
      distance: 0,
    }))
    const result = activitiesFromRecords(
      { ...unitOf(hourly), fileName: 'hourly.gpx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )

    expect(result).toEqual({
      ok: false,
      fileName: 'hourly.gpx',
      reason: 'Activity is recorded too sparsely: its points are more than 10 seconds apart',
    })
  })

  it('accepts a ride with an hour-long pause once it has a minute of riding', () => {
    const records = [...steadyRecords(30, START), ...steadyRecords(30, START + HOUR_MS)]
    const result = succeeded(
      activitiesFromRecords({ ...unitOf(records), fileName: 'pause.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    )
    expect(result.activities).toHaveLength(1)
  })

  it('refuses a ride with an hour-long pause and only 59 seconds of riding', () => {
    const records = [...steadyRecords(30, START), ...steadyRecords(29, START + HOUR_MS)]
    const result = activitiesFromRecords(
      { ...unitOf(records), fileName: 'pause.gpx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )
    expect(result).toEqual({
      ok: false,
      fileName: 'pause.gpx',
      reason: 'Activity is shorter than one minute',
    })
  })

  it('refuses an activity that starts more than a day in the future', () => {
    const result = activitiesFromRecords(
      { ...unitOf(steadyRecords(60)), fileName: 'future.gpx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: START - 2 * DAY_MS },
    )

    expect(result).toEqual({
      ok: false,
      fileName: 'future.gpx',
      reason: 'Activity date is not plausible',
    })
  })

  it('splits a gap of more than four hours into two activities', () => {
    const records = [...steadyRecords(60, START), ...steadyRecords(60, START + 5 * HOUR_MS)]
    const result = succeeded(
      activitiesFromRecords({ ...unitOf(records), fileName: 'long.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    )

    expect(result.activities.map((a) => a.id)).toEqual([
      `${START}-long.gpx.1`,
      `${START + 5 * HOUR_MS}-long.gpx.2`,
    ])
    expect(result.activities.map((a) => a.name)).toEqual(['long (part 1)', 'long (part 2)'])
  })

  it('refuses an unsupported sport with the FIT rejection message', () => {
    const result = activitiesFromRecords(
      { ...unitOf(steadyRecords(60)), sport: null, sportLabel: 'swimming', fileName: 'pool.tcx' },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )

    expect(result).toEqual({
      ok: false,
      fileName: 'pool.tcx',
      reason: 'Unsupported sport: swimming',
    })
  })
})

/** One record per second with no position: altitude noise of 0 to 4 m, and the given speed and power. */
function unpositionedRecords(
  count: number,
  speed: number | undefined,
  power?: number,
): RawRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    tMs: START + i * 1000,
    speed,
    altitude: i % 5,
    heartRate: 140,
    power,
  }))
}

/** One record per second with no position, the given speed in each second, and altitude noise. */
function recordsAtSpeeds(speeds: number[], power: number): RawRecord[] {
  return speeds.map((speed, i) => ({
    tMs: START + i * 1000,
    speed,
    altitude: i % 5,
    heartRate: 140,
    power,
  }))
}

describe('indoor inference for units without positions', () => {
  function rideOf(records: RawRecord[], overrides: Partial<PipelineUnit> = {}): PipelineUnit {
    return {
      ...unitOf(records),
      sport: 'ride',
      sportLabel: 'cycling',
      hasPosition: false,
      ...overrides,
    }
  }

  function isIndoor(unit: PipelineUnit): boolean {
    const result = succeeded(
      activitiesFromRecords({ ...unit, fileName: 'ride.fit' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    )
    return result.activities[0]!.indoor
  }

  it('marks a powered ride whose speed is missing as indoor, though altitude is recorded', () => {
    expect(isIndoor(rideOf(unpositionedRecords(120, undefined, 200)))).toBe(true)
  })

  it('marks a powered ride whose speed is zero as indoor, though altitude is recorded', () => {
    expect(isIndoor(rideOf(unpositionedRecords(120, 0, 200)))).toBe(true)
  })

  it('keeps a powered ride that is moving outdoor, even without positions', () => {
    expect(isIndoor(rideOf(unpositionedRecords(120, 6, 200)))).toBe(false)
  })

  it('keeps a stationary ride without power outdoor, since power is what marks a trainer', () => {
    expect(isIndoor(rideOf(unpositionedRecords(120, undefined)))).toBe(false)
  })

  it('keeps a stationary run outdoor: the rule is for cycling only', () => {
    const run = rideOf(unpositionedRecords(120, undefined, 200), {
      sport: 'run',
      sportLabel: 'running',
    })
    expect(isIndoor(run)).toBe(false)
  })

  it('keeps a stationary ride with a position outdoor', () => {
    expect(isIndoor(rideOf(unpositionedRecords(120, undefined, 200), { hasPosition: true }))).toBe(
      false,
    )
  })

  it('keeps a powered ride without GPS or speed outdoor when it climbs 150 m', () => {
    const climb: RawRecord[] = Array.from({ length: 120 }, (_, i) => ({
      tMs: START + i * 1000,
      altitude: 100 + (i * 150) / 119,
      heartRate: 140,
      power: 200,
    }))
    expect(isIndoor(rideOf(climb))).toBe(false)
  })

  it('marks a powered ride indoor when 95% of its seconds are stopped', () => {
    const speeds = [...Array.from({ length: 95 }, () => 0), ...Array.from({ length: 5 }, () => 6)]
    expect(isIndoor(rideOf(recordsAtSpeeds(speeds, 200)))).toBe(true)
  })

  it('keeps a powered ride outdoor when 6% of its seconds are moving', () => {
    const speeds = [...Array.from({ length: 94 }, () => 0), ...Array.from({ length: 6 }, () => 6)]
    expect(isIndoor(rideOf(recordsAtSpeeds(speeds, 200)))).toBe(false)
  })

  it('counts a speed of exactly 0.5 m/s as moving', () => {
    expect(
      isIndoor(
        rideOf(
          recordsAtSpeeds(
            Array.from({ length: 120 }, () => 0.5),
            200,
          ),
        ),
      ),
    ).toBe(false)
  })

  it('counts a speed just under 0.5 m/s as stopped', () => {
    expect(
      isIndoor(
        rideOf(
          recordsAtSpeeds(
            Array.from({ length: 120 }, () => 0.49),
            200,
          ),
        ),
      ),
    ).toBe(true)
  })
})

describe('activitiesFromUnits', () => {
  it('gives each unit its index in the id and its sport in the name', () => {
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'week.fit',
          units: [unitOf(steadyRecords(60)), unitOf(steadyRecords(60, START + 2 * HOUR_MS))],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )

    expect(result.activities.map((a) => a.id)).toEqual([
      `${START}-week.fit#0`,
      `${START + 2 * HOUR_MS}-week.fit#1`,
    ])
    expect(result.activities.map((a) => a.name)).toEqual(['week (run)', 'week (run)'])
  })
})

describe('route shapes', () => {
  /** One fix a second round an 800 m by 400 m rectangle, so its shape is twice as wide as it is tall. */
  function rectangleFixes(startMs: number, count: number): GpsFix[] {
    const earth = 6_371_008.8
    const lat0 = 51.5
    const lon0 = -0.12
    const corners: [number, number][] = [
      [0, 0],
      [800, 0],
      [800, 400],
      [0, 400],
    ]
    const per = count / 4
    const fixes: GpsFix[] = []
    corners.forEach(([x0, y0], side) => {
      const [x1, y1] = corners[(side + 1) % 4]!
      for (let k = 0; k < per; k++) {
        const east = x0 + ((x1 - x0) * k) / per
        const north = y0 + ((y1 - y0) * k) / per
        fixes.push({
          t: startMs + (side * per + k) * 1000,
          lat: lat0 + (north / earth) * (180 / Math.PI),
          lon: lon0 + (east / (earth * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI),
        })
      }
    })
    return fixes
  }

  it('gives the second part its own shape, from the fixes in its own part', () => {
    const records = [...steadyRecords(120, START), ...steadyRecords(240, START + 5 * HOUR_MS)]
    const fixes = [...circleFixes(START, 120), ...rectangleFixes(START + 5 * HOUR_MS, 240)]
    const unit = { ...unitOf(records), fixes }
    const [first, second] = succeeded(
      activitiesFromRecords({ ...unit, fileName: 'long.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    ).activities

    expect(first?.route?.aspect).toBeCloseTo(1, 1)
    expect(second?.route?.aspect).toBeCloseTo(2, 1)
  })

  /** One fix a second around a circle of 200 m, so the unit has a loop to draw. */
  function circleFixes(startMs: number, count: number): GpsFix[] {
    const earth = 6_371_008.8
    const lat0 = 51.5
    const lon0 = -0.12
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count
      return {
        t: startMs + i * 1000,
        lat: lat0 + ((200 * Math.sin(angle)) / earth) * (180 / Math.PI),
        lon:
          lon0 +
          ((200 * Math.cos(angle)) / (earth * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI),
      }
    })
  }

  it('gives a unit with positions a route shape', () => {
    const unit = { ...unitOf(steadyRecords(120)), fixes: circleFixes(START, 120) }
    const [activity] = succeeded(
      activitiesFromRecords({ ...unit, fileName: 'loop.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    ).activities

    expect(activity?.route?.points.length).toBeGreaterThanOrEqual(3)
  })

  it('gives an indoor unit no route, even when it has positions', () => {
    const unit = { ...unitOf(steadyRecords(120)), indoor: true, fixes: circleFixes(START, 120) }
    const [activity] = succeeded(
      activitiesFromRecords({ ...unit, fileName: 'loop.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    ).activities

    expect(activity).toBeDefined()
    expect(activity?.route).toBeUndefined()
  })

  it('gives a unit without positions no route', () => {
    const [activity] = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(120)), fileName: 'loop.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    ).activities

    expect(activity?.route).toBeUndefined()
  })

  it('gives each part of a split unit only the fixes that fall in its own part', () => {
    const records = [...steadyRecords(120, START), ...steadyRecords(120, START + 5 * HOUR_MS)]
    const unit = { ...unitOf(records), fixes: circleFixes(START, 120) }
    const [first, second] = succeeded(
      activitiesFromRecords({ ...unit, fileName: 'long.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
      }),
    ).activities

    expect(first?.route).toBeDefined()
    expect(second?.route).toBeUndefined()
  })
})

describe('baseName', () => {
  it.each([
    ['ride.fit', 'ride'],
    ['ride.FIT.gz', 'ride'],
    ['run.gpx', 'run'],
    ['run.GPX.GZ', 'run'],
    ['course.tcx', 'course'],
    ['course.tcx.gz', 'course'],
    ['folder/sub/ride.fit', 'ride'],
    ['C:\\rides\\ride.tcx', 'ride'],
    ['my.ride.gpx', 'my.ride'],
    ['ride.gz', 'ride.gz'],
    ['ride.fit.zip', 'ride.fit.zip'],
    ['ride', 'ride'],
  ])('strips the activity extension from %s', (fileName, expected) => {
    expect(baseName(fileName)).toBe(expected)
  })
})
