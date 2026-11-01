import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  REV6_FIXTURES_MAX_BYTES,
  readRev6Fixture,
  rev6FixtureNames,
  rev6FixtureText,
} from './mixingFixtures.node'
import { studyLibraries } from './mixingLibraries'

/**
 * The revision-6 digests of the study libraries are frozen: they were made by the digester of revision 6 (the
 * gated digester that existed until the release that wrote revision 7) and cannot be made again. Their hashes
 * are pinned, so an edit or a regeneration by another digester fails here.
 */
const SHA256: Record<string, string> = {
  descent: '773559dcac4e123654ee4a58ebd4a30599d23dd8be4d6b6923cb38262fab9cbe',
  flat: 'e0bef48a95e243cecdc2a352ffa2e1883cfd9468e4b3177161554be1c1f20116',
  long: '816e5bb25622625a3831c1a548937935a1ebae4ddf359bdf5f743eb3289dd86f',
  hilly: 'b81d86191887d0a1c9abf4f2f7230772ade2fd3537dbd070d970ec71905e7a12',
  'season-a': '2cc2ff0475d8a8b914aafab32ad8fe8091a7620c0f4392e0400a913dd74a94ea',
  'season-b': '05fa38dc4c663ba4ff861992925ea953a42d306cbf028a756352b73f4ce5fa8a',
  warm: 'a67ff949f344cddc4f57a0d541083155f9ad4ea0dbf3dbad7f05bc2aa8f6ee0f',
}

describe('the checked-in revision-6 digests of the study libraries', () => {
  it('are the files that were made, byte for byte, one for each library', () => {
    expect(rev6FixtureNames()).toEqual(
      studyLibraries()
        .map(({ name }) => name)
        .sort(),
    )
    for (const name of rev6FixtureNames()) {
      const hash = createHash('sha256').update(rev6FixtureText(name)).digest('hex')
      expect(hash, name).toBe(SHA256[name])
    }
  })

  it('read back as revision-6 digests, and weigh under 5 MB together', () => {
    let bytes = 0
    for (const name of rev6FixtureNames()) {
      const digests = readRev6Fixture(name)
      expect(digests.length, name).toBeGreaterThan(50)
      expect(new Set(digests.map((digest) => digest.modelRevision)), name).toEqual(new Set([6]))
      bytes += rev6FixtureText(name).length
    }
    expect(bytes).toBeLessThan(REV6_FIXTURES_MAX_BYTES)
  })

  it('are of the activities the libraries make now, by id and start, so the study compares like with like', () => {
    for (const { name, activities } of studyLibraries()) {
      const made = activities
        .map(({ id, startMs }) => `${startMs}:${id}`)
        .sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]) || (a < b ? -1 : 1))
      const kept = readRev6Fixture(name).map(({ id, startMs }) => `${startMs}:${id}`)
      expect(kept, name).toEqual(made)
    }
  })
})
