import { describe, expect, it } from 'vitest'
import { DEFAULT_PARSE_LIMITS } from '../fit/parse'
import type { ParseResult } from '../fit/parse'
import type { RawRecord } from '../fit/resample'
import type { PipelineUnit } from './pipeline'
import { activitiesFromRecords, activitiesFromUnits, baseName } from './pipeline'

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

  it('refuses a unit with fewer than 60 records', () => {
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
