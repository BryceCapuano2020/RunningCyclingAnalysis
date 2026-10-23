import { describe, expect, it } from 'vitest'
import { encodeFit } from '../fit/encode'
import { encodeGpx } from '../gpx/encode'
import { encodeTcx } from '../tcx/encode'
import { sampleDataset } from '../synthetic'
import type { Activity } from '../types'
import { parseActivityFile } from './index'

const run = sampleDataset().activities.find((a) => a.sport === 'run') as Activity

describe('parseActivityFile', () => {
  it('parses a FIT file by its extension', () => {
    const result = parseActivityFile(encodeFit(run, { gps: true }), 'run.fit')
    expect(result.ok && result.activities.map((a) => a.sport)).toEqual(['run'])
  })

  it('parses a GPX file by its extension, in any case', () => {
    const result = parseActivityFile(encodeGpx(run), 'Morning Run.GPX')
    expect(result.ok && result.activities.map((a) => a.sport)).toEqual(['run'])
  })

  it('parses a TCX file by its extension', () => {
    const result = parseActivityFile(encodeTcx(run, { gps: true }), 'run.tcx')
    expect(result.ok && result.activities.map((a) => a.sport)).toEqual(['run'])
  })

  it('ignores a trailing .gz when choosing the parser', () => {
    const result = parseActivityFile(encodeGpx(run), 'run.gpx.gz')
    expect(result.ok && result.activities).toHaveLength(1)
    expect(result.ok && result.activities[0]?.name).toBe('run')
  })

  it('refuses any other extension with a clear reason and keeps the file name', () => {
    const result = parseActivityFile(encodeGpx(run), 'notes.txt')
    expect(result).toEqual({
      ok: false,
      fileName: 'notes.txt',
      reason: 'Not a FIT, GPX or TCX file',
    })
  })

  it('refuses a file with no extension', () => {
    const result = parseActivityFile(encodeFit(run), 'activity')
    expect(result.ok).toBe(false)
  })

  it('reports a GPX parse failure under the GPX parser', () => {
    const result = parseActivityFile(new TextEncoder().encode('<html/>'), 'bad.gpx')
    expect(result).toEqual({ ok: false, fileName: 'bad.gpx', reason: 'Not a GPX file' })
  })
})
