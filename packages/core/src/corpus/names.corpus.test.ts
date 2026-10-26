import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseActivityFile } from '../import'
import type { ParseResult } from '../import/result'
import { corpusReader } from './helpers'

/*
 * Activity names from real device files. FIT files carry no title, so each is named from its start
 * time and sport. A GPX track is named by its track name unless that is a device default, such as
 * Garmin's "ACTIVE LOG". A TCX activity is named from its start, since its Notes are free text.
 * A name that more than one activity of a file shares gets its start time, as in "Night Run, 3:36 am".
 */

const GENERATED = /^(Night|Morning|Lunch|Afternoon|Evening) (Run|Ride)(, \d{1,2}:\d{2} (am|pm))?$/

const FIT_DIR = new URL('../../test-corpus/fitparse/', import.meta.url)
const FIT = corpusReader(FIT_DIR)
const GPX = corpusReader(new URL('../../test-corpus/gpxpy/', import.meta.url))
const TCX = corpusReader(new URL('../../test-corpus/tcxparser/', import.meta.url))

function namesOf(result: ParseResult): string[] {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return result.activities.map((a) => a.name)
}

/**
 * These GPX files name no sport, so each track is refused. Writing a running type first in each
 * track changes nothing else, and the names the file gives are what the test reads.
 */
function withRunType(text: string): Uint8Array {
  return new TextEncoder().encode(text.replaceAll('<trk>', '<trk><type>running</type>'))
}

describe('activity names from the real corpus', () => {
  it('names every FIT activity from its start time, never from its file name', () => {
    const names = readdirSync(FIT_DIR)
      .filter((name) => name.endsWith('.fit'))
      .flatMap((name) => {
        const result = parseActivityFile(FIT.bytes(name), name)
        return result.ok ? namesOf(result) : []
      })

    expect(names.length).toBeGreaterThan(10)
    for (const name of names) expect(name).toMatch(GENERATED)
  })

  it('does not name a GPX track by a device default such as ACTIVE LOG', () => {
    const result = parseActivityFile(withRunType(GPX.text('cerknicko-jezero.gpx')), 'a.gpx')
    const names = namesOf(result)

    expect(names.length).toBeGreaterThan(1)
    for (const name of names) expect(name).toMatch(GENERATED)
  })

  it('names a TCX activity from its start, and not from its Notes', () => {
    const names = namesOf(parseActivityFile(TCX.bytes('test.tcx'), 'test.tcx'))

    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toMatch(GENERATED)
  })
})
