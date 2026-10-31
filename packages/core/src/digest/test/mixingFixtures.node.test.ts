import { describe, expect, it } from 'vitest'
import { digestActivityAt } from '../digestActivity'
import { serializeDigest } from '../serialize'
import {
  REV6_FIXTURES_MAX_BYTES,
  readRev6Fixture,
  rev6FixtureNames,
  rev6FixtureText,
  writeRev6Fixture,
} from './mixingFixtures.node'
import { studyLibraries } from './mixingLibraries'

/**
 * The fixtures are the revision-6 digester's output on the study libraries. While that digester exists (the gate of
 * D12 section 1.9) this test remakes them in memory and compares; `RCA_WRITE_REV6_FIXTURES=1` writes them instead.
 */
describe('the checked-in revision-6 digests of the study libraries', () => {
  const libraries = studyLibraries()

  it('are the digests the revision-6 digester makes of the libraries, byte for byte', () => {
    if (process.env.RCA_WRITE_REV6_FIXTURES === '1') {
      for (const { name, activities } of libraries) {
        writeRev6Fixture(
          name,
          activities.map((activity) => digestActivityAt(activity, 6)),
        )
      }
    }
    expect(rev6FixtureNames()).toEqual(libraries.map(({ name }) => name).sort())
    for (const { name, activities } of libraries) {
      const made = activities
        .map((activity) => digestActivityAt(activity, 6))
        .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : 1))
        .map((digest) => serializeDigest(digest))
      expect(rev6FixtureText(name).split('\n').filter(Boolean), name).toEqual(made)
    }
  })

  it('read back as revision-6 digests, and weigh under 4 MB together', () => {
    let bytes = 0
    for (const name of rev6FixtureNames()) {
      const digests = readRev6Fixture(name)
      expect(digests.length, name).toBeGreaterThan(50)
      expect(new Set(digests.map((digest) => digest.modelRevision)), name).toEqual(new Set([6]))
      bytes += rev6FixtureText(name).length
    }
    expect(bytes).toBeLessThan(REV6_FIXTURES_MAX_BYTES)
  })
})
