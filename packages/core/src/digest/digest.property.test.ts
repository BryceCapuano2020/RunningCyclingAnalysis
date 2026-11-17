import { describe, expect, it } from 'vitest'
import {
  hashedDigestId,
  hashedFileName,
  isHashedFileName,
  minimisedForUpload,
} from '../import/minimise'
import { snapshotCorpus } from '../test/snapshotCorpus'
import { check, fc } from '../test/property'
import { parseDigest, serializeDigest } from './serialize'

/*
 * A digest is stored as JSON and read back by code of other versions. Writing then reading changes nothing a reader sees, and
 * writing again gives the same text. What is sent to the account is made with a hash that is applied once and then holds.
 */

const digests = snapshotCorpus().flatMap((library) => library.digests)
// An index, not the digest, so a counterexample prints small.
const digest = fc.nat(digests.length - 1).map((i) => digests[i]!)
const text = fc.string({ maxLength: 40 })

describe('digest serialisation', () => {
  it('reads back what it wrote, and reading is a fixed point', () => {
    check(
      fc.property(
        digest,
        fc.integer({ min: 0, max: 4_102_444_800_000 }),
        text,
        (base, startMs, name) => {
          const changed = { ...base, startMs, name }
          const json = serializeDigest(changed)
          const read = parseDigest(json)
          expect(read.startMs).toBe(startMs)
          expect(read.name).toBe(name)
          // The reader normalises (it drops what a device does not keep), so the fixed point is the read form.
          const again = serializeDigest(read)
          expect(serializeDigest(parseDigest(again))).toBe(again)
        },
      ),
      200,
    )
  })
})

describe('minimising for upload', () => {
  it('is idempotent and always hashes the name', () => {
    check(
      fc.property(
        digest,
        fc.stringMatching(/^[A-Za-z0-9 _()-]{1,24}$/),
        fc.constantFrom('', '.fit', '.gpx', '.tcx', '.FIT'),
        (base, stem, extension) => {
          const fileName = `${stem}${extension}`
          const once = minimisedForUpload({ ...base, id: `1700000000-${fileName}` }, fileName)
          const twice = minimisedForUpload(once.digest, once.fileName)
          expect(twice).toStrictEqual(once)
          expect(hashedFileName(once.fileName)).toBe(once.fileName)
          expect(hashedDigestId(once.digest.id)).toBe(once.digest.id)
          expect(isHashedFileName(once.fileName)).toBe(true)
        },
      ),
      200,
    )
  })
})
