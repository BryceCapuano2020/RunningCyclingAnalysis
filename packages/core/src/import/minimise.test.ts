import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { fileNameOf, workoutKey } from '../duplicates'
import type { ActivityDigest } from '../types'
import { hashedDigestId, hashedFileName, isHashedFileName, minimisedForUpload } from './minimise'

const POLICY = { titles: false }
const START = Date.UTC(2026, 2, 14, 7, 30, 41)

function digestOf(id: string, name: string, modelRevision = 7): ActivityDigest {
  const base = digestActivity(syntheticActivity({ id, n: 600, startMs: START }))
  return { ...base, id, name, modelRevision }
}

const ID = `${START}-activities/12345678.fit`

describe('the hashed file name', () => {
  it('keeps the format’s extension, drops the rest, and is the same every time', () => {
    const name = hashedFileName('activities/12345678.fit')
    expect(name).toMatch(/^rca-[0-9a-f]{16}\.fit$/)
    expect(name).not.toContain('12345678')
    expect(hashedFileName('activities/12345678.fit')).toBe(name)
    expect(hashedFileName('activities/12345679.fit')).not.toBe(name)
    expect(hashedFileName('a/ride.TCX')).toMatch(/^rca-[0-9a-f]{16}\.tcx$/)
    expect(hashedFileName('track')).toMatch(/^rca-[0-9a-f]{16}$/)
  })

  it('is not hashed again', () => {
    const once = hashedFileName('activities/1.fit')
    expect(isHashedFileName(once)).toBe(true)
    expect(isHashedFileName('activities/1.fit')).toBe(false)
    expect(hashedFileName(once)).toBe(once)
  })

  it('makes a digest id the same file name, keeping the part and index', () => {
    const id = hashedDigestId(`${START}-export/987.tcx#2.1`)
    expect(id).toMatch(new RegExp(`^${START}-rca-[0-9a-f]{16}\\.tcx#2\\.1$`))
    expect(fileNameOf(id)).toBe(hashedFileName('export/987.tcx'))
    expect(hashedDigestId(id)).toBe(id)
  })
})

describe('what is sent of a new activity from revision 7', () => {
  it('replaces the title by a generated name unless the athlete chose to send titles', () => {
    const digest = digestOf(ID, 'Run along the Embarcadero to home')
    const hidden = minimisedForUpload(digest, 'activities/12345678.fit', POLICY)
    expect(hidden.digest.name).toMatch(
      /^(Early Morning|Morning|Afternoon|Evening|Night|Lunch).* Run$/,
    )
    expect(hidden.digest.name).not.toContain('Embarcadero')
    const shown = minimisedForUpload(digest, 'activities/12345678.fit', { titles: true })
    expect(shown.digest.name).toBe('Run along the Embarcadero to home')
  })

  it('hashes the file name and the digest id with it', () => {
    const sent = minimisedForUpload(digestOf(ID, 'x'), 'activities/12345678.fit', POLICY)
    expect(sent.fileName).toBe(hashedFileName('activities/12345678.fit'))
    expect(sent.digest.id).toBe(`${START}-${sent.fileName}`)
    expect(fileNameOf(sent.digest.id)).toBe(sent.fileName)
  })

  it('sends an id and a name that are already hashed as they are, so an activity made at import is not changed', () => {
    const name = hashedFileName('activities/1.fit')
    const digest = digestOf(`${START}-${name}`, 'x')
    const sent = minimisedForUpload(digest, name, POLICY)
    expect(sent.digest.id).toBe(digest.id)
    expect(sent.fileName).toBe(name)
  })

  it('changes nothing else of the digest, and nothing of the workout’s key', () => {
    const digest = digestOf(ID, 'Title')
    const sent = minimisedForUpload(digest, 'activities/12345678.fit', POLICY).digest
    const { id: _a, name: _b, ...rest } = sent
    const { id: _c, name: _d, ...before } = digest
    expect(rest).toEqual(before)
    expect(workoutKey(sent.sport, sent.startMs)).toBe(workoutKey(digest.sport, digest.startMs))
  })

  it('sends a digest of an earlier revision as it is', () => {
    const digest = digestOf(ID, 'Title', 6)
    const sent = minimisedForUpload(digest, 'activities/12345678.fit', POLICY)
    expect(sent.digest).toBe(digest)
    expect(sent.fileName).toBe('activities/12345678.fit')
  })
})
