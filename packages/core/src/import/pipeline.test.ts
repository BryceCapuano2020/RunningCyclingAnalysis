import { hashedFileName } from './minimise'
import { describe, expect, it } from 'vitest'
import type { RawRecord } from '../fit/resample'
import type { GpsFix } from './gps'
import type { PipelineUnit } from './pipeline'
import { activitiesFromRecords, activitiesFromUnits } from './pipeline'
import { DEFAULT_PARSE_LIMITS } from './result'
import type { ParseResult } from './result'
import { generatedName } from './names'

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
      id: `${START}-${hashedFileName('morning.gpx')}`,
      name: generatedName(START, 'run'),
      sport: 'run',
      indoor: false,
      startMs: START,
      n: 60,
    })
  })

  it('names an activity from the title its file carries', () => {
    const result = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(60)), title: 'Hill repeats', fileName: 'run.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )

    expect(result.activities[0]?.name).toBe('Hill repeats')
  })

  it('falls back to the file title, then the start time, when the export name is a device default', () => {
    const titled = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(60)), title: 'Hill repeats', fileName: 'run.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, activityName: '001' },
      ),
    )
    const untitled = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(60, localMs(6, 11))), fileName: 'run.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, activityName: 'ACTIVE LOG' },
      ),
    )

    expect(titled.activities[0]?.name).toBe('Hill repeats')
    expect(untitled.activities[0]?.name).toBe('Morning Run')
  })

  it('names an activity from the name its export gives, before the file title', () => {
    const result = succeeded(
      activitiesFromRecords(
        { ...unitOf(steadyRecords(60)), title: 'Track name', fileName: 'run.gpx' },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, activityName: 'Export name' },
      ),
    )

    expect(result.activities[0]?.name).toBe('Export name')
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
      code: 'too-short',
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
      code: 'too-sparse',
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
      code: 'too-short',
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
      code: 'implausible-date',
    })
  })

  it('splits a gap of more than four hours into two activities', () => {
    const records = [...steadyRecords(60, START), ...steadyRecords(60, START + 5 * HOUR_MS)]
    const result = succeeded(
      activitiesFromRecords({ ...unitOf(records), fileName: 'long.gpx' }, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
        activityName: 'Long day',
      }),
    )

    expect(result.activities.map((a) => a.id)).toEqual([
      `${START}-${hashedFileName('long.gpx')}.1`,
      `${START + 5 * HOUR_MS}-${hashedFileName('long.gpx')}.2`,
    ])
    expect(result.activities.map((a) => a.name)).toEqual(['Long day (part 1)', 'Long day (part 2)'])
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
      code: 'unsupported-sport',
      detail: 'swimming',
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

/** A local start on a fixed day, so the clock times a test expects hold in any time zone. */
function localMs(hour: number, minute: number): number {
  return new Date(2024, 4, 1, hour, minute).getTime()
}

/** A ride unit: the same steady records as a run, with a cycling sport. */
function rideOf(records: RawRecord[]): PipelineUnit {
  return { ...unitOf(records), sport: 'ride', sportLabel: 'cycling' }
}

describe('activitiesFromUnits', () => {
  it('gives each unit its index in the id, and tells apart two legs that share a name', () => {
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'week.fit',
          units: [
            unitOf(steadyRecords(60, localMs(6, 11))),
            unitOf(steadyRecords(60, localMs(8, 20))),
          ],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, activityName: 'Week' },
      ),
    )

    expect(result.activities.map((a) => a.id)).toEqual([
      `${localMs(6, 11)}-${hashedFileName('week.fit')}#0`,
      `${localMs(8, 20)}-${hashedFileName('week.fit')}#1`,
    ])
    expect(result.activities.map((a) => a.name)).toEqual([
      'Week (Run, 6:11 am)',
      'Week (Run, 8:20 am)',
    ])
  })

  it('names a run-ride-run brick by its export name, with the start time on the two runs', () => {
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'brick.fit',
          units: [
            unitOf(steadyRecords(60, localMs(6, 11))),
            rideOf(steadyRecords(60, localMs(9, 0))),
            unitOf(steadyRecords(60, localMs(12, 30))),
          ],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, activityName: 'Brick' },
      ),
    )

    expect(result.activities.map((a) => a.name)).toEqual([
      'Brick (Run, 6:11 am)',
      'Brick (Ride)',
      'Brick (Run, 12:30 pm)',
    ])
  })

  it('numbers two legs that start in the same minute after their start time', () => {
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'twins.fit',
          units: [
            unitOf(steadyRecords(60, localMs(6, 11))),
            unitOf(steadyRecords(60, localMs(6, 11) + 30_000)),
          ],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )

    expect(result.activities.map((a) => a.name)).toEqual([
      'Morning Run, 6:11 am',
      'Morning Run, 6:11 am (2)',
    ])
  })

  it('tells apart two generated names of one file with the start time, at midnight too', () => {
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'brick.fit',
          units: [
            unitOf(steadyRecords(60, localMs(0, 5))),
            rideOf(steadyRecords(60, localMs(9, 0))),
            unitOf(steadyRecords(60, localMs(0, 40))),
          ],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )

    expect(result.activities.map((a) => a.name)).toEqual([
      'Night Run, 12:05 am',
      'Morning Ride',
      'Night Run, 12:40 am',
    ])
  })
})

/** One record a minute, so a long activity has few records but one grid sample a second. */
function minuteRecords(count: number, startMs: number): RawRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    tMs: startMs + i * 60_000,
    speed: 4,
    distance: 240 * i,
    altitude: 100,
    heartRate: 140,
    power: 200,
  }))
}

describe('sample budget', () => {
  it('refuses the file when its units together pass the 48-hour grid, and only then', () => {
    // A 40-hour unit takes 144,001 samples. A 10-hour unit after it would take 36,001 more, which is
    // past the 172,800 a file may hold. A 6-hour unit takes 21,601 and fits.
    const forty = unitOf(minuteRecords(2401, START))
    const tooMuch = activitiesFromUnits(
      {
        fileName: 'long.fit',
        units: [forty, unitOf(minuteRecords(601, START + 41 * HOUR_MS))],
      },
      DEFAULT_PARSE_LIMITS,
      { nowMs: NOW },
    )
    expect(tooMuch).toEqual({
      ok: false,
      fileName: 'long.fit',
      reason: 'File contains too much data',
      code: 'too-much-data',
    })

    const fits = succeeded(
      activitiesFromUnits(
        {
          fileName: 'long.fit',
          units: [forty, unitOf(minuteRecords(361, START + 41 * HOUR_MS))],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW },
      ),
    )
    expect(fits.activities).toHaveLength(2)
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

describe('what the export says about an activity', () => {
  const file = { ...unitOf(steadyRecords(60)), fileName: 'morning.gpx' }

  it('tags every activity of the file as a race when the export says so, and no other', () => {
    const tagged = succeeded(
      activitiesFromRecords(file, DEFAULT_PARSE_LIMITS, { nowMs: NOW, race: true }),
    )
    expect(tagged.activities[0]?.race).toBe(true)
    for (const opts of [{ nowMs: NOW }, { nowMs: NOW, race: false }]) {
      const plain = succeeded(activitiesFromRecords(file, DEFAULT_PARSE_LIMITS, opts))
      expect(plain.activities[0]).not.toHaveProperty('race')
    }
  })

  it('names each activity by its own start with nameAt, without the sport a shared name carries', () => {
    const second = START + 5 * HOUR_MS
    const result = succeeded(
      activitiesFromUnits(
        {
          fileName: 'two.fit',
          units: [unitOf(steadyRecords(60)), unitOf(steadyRecords(60, second))],
        },
        DEFAULT_PARSE_LIMITS,
        { nowMs: NOW, nameAt: (startMs) => (startMs === START ? 'Warm up' : 'Main set') },
      ),
    )
    expect(result.activities.map((a) => a.name)).toEqual(['Warm up', 'Main set'])
  })

  it('prefers the name the export gives the file to one given by start, and falls back without one', () => {
    const named = succeeded(
      activitiesFromRecords(file, DEFAULT_PARSE_LIMITS, {
        nowMs: NOW,
        activityName: 'From the list',
        nameAt: () => 'By start',
      }),
    )
    expect(named.activities[0]?.name).toBe('From the list')
    const none = succeeded(
      activitiesFromRecords(file, DEFAULT_PARSE_LIMITS, { nowMs: NOW, nameAt: () => undefined }),
    )
    expect(none.activities[0]?.name).toBe(generatedName(START, 'run'))
  })
})
