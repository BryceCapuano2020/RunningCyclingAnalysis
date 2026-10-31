import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { fileNameOf, workoutKey } from '../duplicates'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import type { ActivityDigest } from '../types'
import { hashedFileName, minimisedForUpload } from './minimise'

const POLICY = { titles: false, account: 'user-1' }

function digestOf(id: string, name: string, modelRevision = 7): ActivityDigest {
  const base = digestActivity(
    syntheticActivity({ id, n: 600, startMs: Date.UTC(2026, 2, 14, 7, 30, 41) }),
  )
  return { ...base, id, name, modelRevision }
}

const ID = `${Date.UTC(2026, 2, 14, 7, 30, 41)}-activities/12345678.fit`

describe('what is sent of a digest from revision 7', () => {
  it('replaces the title by a generated name unless the athlete chose to send titles', async () => {
    const digest = digestOf(ID, 'Run along the Embarcadero to home')
    const hidden = await minimisedForUpload(digest, 'activities/12345678.fit', POLICY)
    expect(hidden.digest.name).toMatch(
      /^(Early Morning|Morning|Afternoon|Evening|Night|Lunch).* Run$/,
    )
    expect(hidden.digest.name).not.toContain('Embarcadero')
    const shown = await minimisedForUpload(digest, 'activities/12345678.fit', {
      ...POLICY,
      titles: true,
    })
    expect(shown.digest.name).toBe('Run along the Embarcadero to home')
  })

  it('hashes the file name and the digest id with it, keeping the extension and the id’s shape', async () => {
    const sent = await minimisedForUpload(digestOf(ID, 'x'), 'activities/12345678.fit', POLICY)
    expect(sent.fileName).toMatch(/^rca-[0-9a-f]{16}\.fit$/)
    expect(sent.fileName).not.toContain('12345678')
    expect(sent.digest.id).toBe(`${Date.UTC(2026, 2, 14, 7, 30, 41)}-${sent.fileName}`)
    expect(fileNameOf(sent.digest.id)).toBe(sent.fileName)
  })

  it('keeps the part and index a digest id carries, and the format it ranks by', async () => {
    const start = Date.UTC(2026, 2, 14, 7, 30, 41)
    const sent = await minimisedForUpload(
      digestOf(`${start}-export/987.tcx#2.1`, 'x'),
      'export/987.tcx',
      POLICY,
    )
    expect(sent.digest.id).toMatch(new RegExp(`^${start}-rca-[0-9a-f]{16}\\.tcx#2\\.1$`))
    expect(fileNameOf(sent.digest.id)).toBe(sent.fileName)
  })

  it('is the same every time for one account and file, and differs between accounts and files', async () => {
    const a = await hashedFileName('activities/1.fit', 'user-1')
    expect(await hashedFileName('activities/1.fit', 'user-1')).toBe(a)
    expect(await hashedFileName('activities/1.fit', 'user-2')).not.toBe(a)
    expect(await hashedFileName('activities/2.fit', 'user-1')).not.toBe(a)
  })

  it('does not hash a name again, so a rebuild of a stored activity finds it', async () => {
    const once = await hashedFileName('activities/1.fit', 'user-1')
    expect(await hashedFileName(once, 'user-1')).toBe(once)
    expect(await hashedFileName(once, 'user-2')).toBe(once)
    const digest = digestOf(`${Date.UTC(2026, 2, 14, 7, 30, 41)}-${once}`, 'x')
    const again = await minimisedForUpload(digest, once, POLICY)
    expect(again.digest.id).toBe(digest.id)
    expect(again.fileName).toBe(once)
  })

  it('changes nothing else of the digest, and nothing of the workout’s key', async () => {
    const digest = digestOf(ID, 'Title')
    const sent = (await minimisedForUpload(digest, 'activities/12345678.fit', POLICY)).digest
    const { id: _a, name: _b, ...rest } = sent
    const { id: _c, name: _d, ...before } = digest
    expect(rest).toEqual(before)
    expect(workoutKey(sent.sport, sent.startMs)).toBe(workoutKey(digest.sport, digest.startMs))
  })

  it('sends a digest of an earlier revision as it is', async () => {
    const digest = digestOf(ID, 'Title', 6)
    const sent = await minimisedForUpload(digest, 'activities/12345678.fit', POLICY)
    expect(sent.digest).toBe(digest)
    expect(sent.fileName).toBe('activities/12345678.fit')
  })
})
