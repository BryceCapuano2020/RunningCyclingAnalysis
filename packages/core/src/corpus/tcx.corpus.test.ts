import { describe, expect, it } from 'vitest'
import { parseActivityFile } from '../import'
import type { Activity } from '../types'
import { corpusReader, isSaneActivity, mutations } from './helpers'

/*
 * Real Garmin TCX files from python-tcxparser (vkurup/python-tcxparser @ 5ecaac92f8f2, BSD-2).
 * Reference values come from two places that do not use this parser:
 *  - the device's own Lap summaries (TotalTimeSeconds, DistanceMeters, Average and Maximum
 *    HeartRateBpm), read here with a separate regex;
 *  - tests/test_tcxparser.py in the same repository, which asserts exact values for test.tcx
 *    (fetched with `gh api repos/vkurup/python-tcxparser/contents/tests/test_tcxparser.py`).
 */

const { bytes: corpusBytes, text: corpusText } = corpusReader(
  new URL('../../test-corpus/tcxparser/', import.meta.url),
)
const NO_RECORDS = 'File contains no activity records'
const NO_ZONE = 'TCX times need a time zone (Z or ±hh:mm)'
const DOCUMENTED: RegExp[] = [
  /^Not a TCX file$/,
  /^Could not decode TCX file$/,
  /^File contains no activities$/,
  /^File contains no activity records$/,
  /^TCX times need a time zone/,
  /^Unsupported sport: .+$/,
  /^TCX file exceeds the /,
  /^Activity is shorter than one minute$/,
  /^Activity is longer than 48 hours$/,
  /^File contains too much data$/,
  /^Activity date is not plausible$/,
  /^Activity exceeds the /,
]

function parseOk(bytes: Uint8Array, name: string): Activity[] {
  const result = parseActivityFile(bytes, name)
  if (!result.ok) throw new Error(`${name}: expected ok, got ${result.reason}`)
  return result.activities
}

function firstOk(text: string, name: string): Activity {
  const [activity] = parseOk(new TextEncoder().encode(text), name)
  if (activity === undefined) throw new Error(`${name}: no activity`)
  return activity
}

const FILES = ['test.tcx', 'no_hr.tcx', 'sup_activity_1.tcx'] as const

interface DeviceLap {
  startMs: number
  totalS: number
  distanceM: number
  avgHr: number | undefined
  maxHr: number | undefined
}

/** The Lap summaries the device wrote, read straight from the XML, outside any Track. */
function deviceLaps(text: string): DeviceLap[] {
  return [...text.matchAll(/<Lap StartTime="([^"]+)">([\s\S]*?)<\/Lap>/g)].map((m) => {
    const summary = m[2]!.replace(/<Track>[\s\S]*?<\/Track>/g, '')
    const number = (pattern: RegExp): number | undefined => {
      const hit = pattern.exec(summary)
      return hit === null ? undefined : Number(hit[1])
    }
    return {
      startMs: Date.parse(m[1]!),
      totalS: number(/<TotalTimeSeconds>([^<]+)</)!,
      distanceM: number(/<DistanceMeters>([^<]+)</)!,
      avgHr: number(/<AverageHeartRateBpm>\s*<Value>([^<]+)</),
      maxHr: number(/<MaximumHeartRateBpm>\s*<Value>([^<]+)</),
    }
  })
}

/** Grid index of a wall-clock instant, as the activity's 1 Hz grid counts it. */
function indexOf(a: Activity, ms: number): number {
  return Math.round((ms - a.startMs) / 1000)
}

describe('TCX corpus: robustness', () => {
  it('reads test.tcx and no_hr.tcx as runs and refuses sup_activity_1.tcx by its sport', () => {
    for (const name of ['test.tcx', 'no_hr.tcx']) {
      const [a] = parseOk(corpusBytes(name), name)
      expect(a?.sport, name).toBe('run')
      expect(a?.n, name).toBe(1993)
    }
    expect(parseActivityFile(corpusBytes('sup_activity_1.tcx'), 'sup_activity_1.tcx')).toEqual({
      ok: false,
      fileName: 'sup_activity_1.tcx',
      reason: 'Unsupported sport: Other',
    })
  })

  it.each(FILES)('never throws on truncated or corrupted copies of %s', (name) => {
    const bytes = corpusBytes(name)
    for (const copy of mutations(bytes, name.length)) {
      const result = parseActivityFile(copy, name)
      if (result.ok) {
        for (const a of result.activities) expect(isSaneActivity(a)).toBe(true)
      } else {
        expect(DOCUMENTED.some((pattern) => pattern.test(result.reason))).toBe(true)
      }
    }
  })

  it('refuses a copy with every Time removed with the no-records message', () => {
    const untimed = corpusText('test.tcx').replace(/<Time>[^<]*<\/Time>/g, '')
    const result = parseActivityFile(new TextEncoder().encode(untimed), 'untimed.tcx')
    expect(result).toEqual({ ok: false, fileName: 'untimed.tcx', reason: NO_RECORDS })
  })

  it('refuses a copy whose times have no zone with the zone message', () => {
    const zoneless = corpusText('test.tcx').replace(/<Time>([^<]*)Z<\/Time>/g, '<Time>$1</Time>')
    const result = parseActivityFile(new TextEncoder().encode(zoneless), 'zoneless.tcx')
    expect(result).toEqual({ ok: false, fileName: 'zoneless.tcx', reason: NO_ZONE })
  })

  it('reads a BOM, CRLF line endings and prefixed element names as the same activity', () => {
    const text = corpusText('test.tcx')
    const reference = firstOk(text, 'test.tcx')
    const variants = {
      bom: '﻿' + text,
      crlf: text.replace(/\n/g, '\r\n'),
      prefixed: text
        .replace(
          ' xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
          ' xmlns:tcx="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
        )
        .replace(/<(\/?)(?!tcx:|\?|!)([A-Za-z]+)/g, '<$1tcx:$2'),
    }
    for (const [label, variant] of Object.entries(variants)) {
      const a = firstOk(variant, `${label}.tcx`)
      expect(a.n, label).toBe(reference.n)
      expect(a.startMs, label).toBe(reference.startMs)
      expect(a.distance[a.n - 1], label).toBe(reference.distance[reference.n - 1])
      expect(a.hasHeartRate, label).toBe(true)
    }
  })
})

describe('TCX corpus: device lap summaries', () => {
  const text = corpusText('test.tcx')
  const laps = deviceLaps(text)
  const a = firstOk(text, 'test.tcx')

  it('reads three laps from test.tcx', () => {
    expect(laps.map((lap) => lap.totalS)).toEqual([608.47, 714.8, 669.51])
  })

  it.each([0, 1, 2])('lap %i: distance within 1%% of the device', (k) => {
    const lap = laps[k]!
    const from = indexOf(a, lap.startMs)
    const to = Math.min(a.n - 1, from + Math.round(lap.totalS))
    const ours = a.distance[to]! - a.distance[from]!
    expect(Math.abs(ours - lap.distanceM) / lap.distanceM).toBeLessThanOrEqual(0.01)
  })

  it.each([0, 1, 2])('lap %i: timer time within 2%% of the device', (k) => {
    const lap = laps[k]!
    const from = indexOf(a, lap.startMs)
    const to = Math.min(a.n, from + Math.round(lap.totalS))
    let moving = 0
    for (let i = from; i < to; i++) if (a.paused[i] === 0) moving++
    expect(Math.abs(moving - lap.totalS) / lap.totalS).toBeLessThanOrEqual(0.02)
  })

  it.each([0, 1, 2])('lap %i: average heart rate within 2 bpm of the device', (k) => {
    const lap = laps[k]!
    const from = indexOf(a, lap.startMs)
    const to = Math.min(a.n, from + Math.round(lap.totalS))
    let sum = 0
    let count = 0
    for (let i = from; i < to; i++) {
      const hr = a.heartRate[i]!
      if (Number.isFinite(hr)) {
        sum += hr
        count++
      }
    }
    expect(Math.abs(sum / count - lap.avgHr!)).toBeLessThanOrEqual(2)
  })

  it.each([0, 1, 2])('lap %i: maximum heart rate within 2 bpm of the device', (k) => {
    const lap = laps[k]!
    const from = indexOf(a, lap.startMs)
    const to = Math.min(a.n, from + Math.round(lap.totalS))
    let max = 0
    for (let i = from; i < to; i++) {
      const hr = a.heartRate[i]!
      if (Number.isFinite(hr)) max = Math.max(max, hr)
    }
    expect(Math.abs(max - lap.maxHr!)).toBeLessThanOrEqual(2)
  })

  it('the device lap totals add up to the activity timer within 2%', () => {
    const total = laps.reduce((sum, lap) => sum + lap.totalS, 0)
    let moving = 0
    for (let i = 0; i < a.n; i++) if (a.paused[i] === 0) moving++
    expect(total).toBeCloseTo(1992.78, 2)
    expect(Math.abs(moving - total) / total).toBeLessThanOrEqual(0.02)
  })
})

describe('TCX corpus: python-tcxparser reference values (test.tcx)', () => {
  // Expected values from tests/test_tcxparser.py in vkurup/python-tcxparser.
  const text = corpusText('test.tcx')
  const a = firstOk(text, 'test.tcx')
  const hr = Array.from(a.heartRate).filter((v) => Number.isFinite(v))

  it('starts and ends at the same instants (time_values, time_objects)', () => {
    expect(a.startMs).toBe(Date.UTC(2012, 11, 26, 21, 29, 53))
    expect(a.startMs + (a.n - 1) * 1000).toBe(Date.UTC(2012, 11, 26, 22, 3, 5))
  })

  it('distance is the last DistanceMeters (test_distance_is_correct: 4686.31103516)', () => {
    expect(a.distance[a.n - 1]).toBeCloseTo(4686.31103516, 2)
  })

  it('duration matches the lap total (test_duration_is_correct: 1992.78) within 2%', () => {
    expect(Math.abs(a.n - 1 - 1992.78) / 1992.78).toBeLessThanOrEqual(0.02)
  })

  it('heart rate maximum and minimum (test_hr_max: 189, test_hr_min: 60)', () => {
    expect(Math.max(...hr)).toBe(189)
    expect(Math.min(...hr)).toBe(60)
  })

  it('heart rate average: python counts trackpoints (test_hr_avg: 156), the app counts seconds', () => {
    // python-tcxparser's hr_avg is int(mean of the trackpoint values), so it is not time-weighted.
    const points = [...text.matchAll(/<Time>([^<]+)<\/Time>[\s\S]*?<\/Trackpoint>/g)]
      .map((m) => ({ ms: Date.parse(m[1]!), hr: /<HeartRateBpm>\s*<Value>(\d+)</.exec(m[0]) }))
      .filter((p): p is { ms: number; hr: RegExpExecArray } => p.hr !== null)
      .map((p) => ({ ms: p.ms, hr: Number(p.hr[1]) }))
    const countMean = points.reduce((sum, p) => sum + p.hr, 0) / points.length
    expect(Math.floor(countMean)).toBe(156)
    // Each point holds its value until the next one. The result matches the device's lap averages.
    let weighted = 0
    let span = 0
    for (let i = 0; i + 1 < points.length; i++) {
      const dt = (points[i + 1]!.ms - points[i]!.ms) / 1000
      weighted += points[i]!.hr * dt
      span += dt
    }
    const ours = hr.reduce((sum, v) => sum + v, 0) / hr.length
    expect(Math.abs(ours - weighted / span)).toBeLessThanOrEqual(0.5)
  })

  it('pace is 07:05 per km (test_pace), so 425 s per km to the second', () => {
    const secondsPerKm = (a.n - 1) / (a.distance[a.n - 1]! / 1000)
    expect(Math.abs(secondsPerKm - 425)).toBeLessThanOrEqual(1)
  })

  it('altitude at the first and last point (test_altitude_points_are_correct)', () => {
    expect(a.altitude[0]).toBeCloseTo(178.942626953, 2)
    expect(a.altitude[a.n - 1]).toBeCloseTo(166.4453125, 2)
  })

  it('altitude extremes (test_altitude_max/min_is_correct)', () => {
    expect(Math.max(...Array.from(a.altitude))).toBeCloseTo(215.95324707, 2)
    expect(Math.min(...Array.from(a.altitude))).toBeCloseTo(157.793579102, 2)
  })

  it('the no-HR copy has the same distance and no heart rate (no_hr.tcx)', () => {
    const noHr = firstOk(corpusText('no_hr.tcx'), 'no_hr.tcx')
    expect(noHr.hasHeartRate).toBe(false)
    expect(noHr.distance[noHr.n - 1]).toBeCloseTo(4686.31103516, 2)
  })
})
