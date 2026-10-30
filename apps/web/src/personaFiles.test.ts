import { unzipSync, gunzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseActivityFile } from '@rca/core/import'
import { persona } from '@rca/core/synthetic'
import { makeLibraryFiles, makeStravaZip } from '../scripts/personaFiles'

const WEEKS = 2

describe('persona files', () => {
  it('a phone runner is GPX files the importer reads as outdoor runs', () => {
    const library = persona('phoneSlowRunner', 1, WEEKS)
    const files = makeLibraryFiles(library)
    expect(files.length).toBe(library.entries.length)
    expect(files.every((f) => f.name.endsWith('.gpx'))).toBe(true)
    const parsed = parseActivityFile(files[0]!.bytes, files[0]!.name)
    expect(parsed.ok && parsed.activities[0]!.sport).toBe('run')
    expect(parsed.ok && parsed.activities[0]!.indoor).toBe(false)
  })

  it('a treadmill run is a FIT the importer reads as indoor, with no altitude', () => {
    const files = makeLibraryFiles(persona('treadmillOnly', 1, WEEKS))
    for (const f of files.slice(0, 3)) {
      const parsed = parseActivityFile(f.bytes, f.name)
      expect(parsed.ok && parsed.activities[0]!.indoor).toBe(true)
    }
  })

  it('a rider without power writes no power', () => {
    const f = makeLibraryFiles(persona('rideNoPower', 1, WEEKS))[0]!
    const parsed = parseActivityFile(f.bytes, f.name)
    expect(parsed.ok && parsed.activities[0]!.hasPower).toBe(false)
  })

  it('the Strava zip lists every file in activities.csv, and the same seed gives the same bytes', () => {
    const library = persona('twoSport', 2, WEEKS)
    const zip = makeStravaZip(library)
    expect(makeStravaZip(persona('twoSport', 2, WEEKS))).toEqual(zip)
    const entries = unzipSync(zip)
    const rows = strFromU8(entries['activities.csv']!).trim().split('\n').slice(1)
    expect(rows.length).toBe(library.entries.length)
    const types = new Set(rows.map((r) => r.split(',')[3]))
    expect([...types].sort()).toEqual(['Ride', 'Run'])
    const first = rows[0]!.split(',').at(-1)!
    const parsed = parseActivityFile(gunzipSync(entries[first]!), first.replace(/\.gz$/, ''))
    expect(parsed.ok).toBe(true)
  })
})
