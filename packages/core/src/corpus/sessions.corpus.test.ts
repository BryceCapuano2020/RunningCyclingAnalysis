import { describe, expect, it, vi } from 'vitest'
import { parseActivityFile } from '../import'
import { sha256Hex } from '../sha256'
import { AnalysisSession } from '../session'
import { corpusReader } from './helpers'

const { bytes } = corpusReader(new URL('../../test-corpus/fitparse/', import.meta.url))

/** A corpus file as an upload, named as the test names it. */
function upload(name: string, fileName: string): File {
  return new File([new Uint8Array(bytes(name))], fileName)
}

/** The legs of one file, parsed under the upload's key, which is the hash of its bytes. */
async function legsOf(name: string, fileName = name) {
  const file = bytes(name)
  const result = parseActivityFile(file, fileName, undefined, {
    sessionKey: await sha256Hex(file),
  })
  if (!result.ok) throw new Error(`${name} was refused`)
  return result.activities
}

describe('sessions: the legs of one upload', () => {
  it('give each leg the key of the upload it came from', async () => {
    const name = 'activity-large-fenxi2-multisport.fit'
    const legs = await legsOf(name)
    expect(legs.length).toBeGreaterThan(1)
    const key = await sha256Hex(bytes(name))
    for (const leg of legs) expect(leg.sessionKey).toBe(key)
  })

  it('give no session key when the upload has none, even for a multisport file', () => {
    const name = 'activity-large-fenxi2-multisport.fit'
    const result = parseActivityFile(bytes(name), name)
    if (!result.ok) throw new Error(`${name} was refused`)
    expect(result.activities.length).toBeGreaterThan(1)
    for (const leg of result.activities) expect(leg).not.toHaveProperty('sessionKey')
  })

  it('keep two same-named multisport uploads apart, since their keys are their bytes', async () => {
    // Both named ACTIVITY.FIT, as two uploads from different days would be.
    const first = await legsOf('activity-large-fenxi2-multisport.fit', 'ACTIVITY.FIT')
    const second = await legsOf('sample_mulitple_header.fit', 'ACTIVITY.FIT')
    const keys = new Set([...first, ...second].map((leg) => leg.sessionKey))
    expect(keys.size).toBe(2)
    expect(first[0]!.sessionKey).not.toBe(second[0]!.sessionKey)
  })

  it('give a single activity from one upload no session key', async () => {
    const name = 'sample-activity.fit'
    const legs = await legsOf(name)
    expect(legs).toHaveLength(1)
    expect(legs[0]).not.toHaveProperty('sessionKey')
  })
})

describe('AnalysisSession: the session of each upload', () => {
  const SETTINGS = { massKg: 75, bikeMassKg: 9 }

  it('keeps two same-named multisport uploads as two sessions, each keyed by its own bytes', async () => {
    const state = await new AnalysisSession().addFiles(
      [
        upload('activity-large-fenxi2-multisport.fit', 'ACTIVITY.FIT'),
        upload('sample_mulitple_header.fit', 'ACTIVITY.FIT'),
      ],
      SETTINGS,
    )
    // The whole library, since the result is limited to the default period, which holds one file.
    const keys = state.library.map((activity) => activity.sessionKey)
    expect(keys.every((key) => key !== undefined)).toBe(true)
    expect(new Set(keys).size).toBe(2)
    const legsPerKey = new Map<string | undefined, number>()
    for (const key of keys) legsPerKey.set(key, (legsPerKey.get(key) ?? 0) + 1)
    expect([...legsPerKey.values()].sort()).toEqual([2, 3])
    expect(keys).not.toContain('ACTIVITY.FIT')
  })

  it('imports an upload with no session key where the origin has no crypto.subtle, rather than failing', async () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const state = await new AnalysisSession().addFiles(
        [upload('sample-activity.fit', 'run.fit')],
        SETTINGS,
      )
      expect(state.rejected).toEqual([])
      expect(state.library).toHaveLength(1)
      expect(state.library[0]).not.toHaveProperty('sessionKey')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
