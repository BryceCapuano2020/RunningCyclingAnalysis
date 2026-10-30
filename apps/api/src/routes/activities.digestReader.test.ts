import { describe, expect, it } from 'vitest'
import { digestActivity, serializeDigest } from '@rca/core/digest'
import { tryReadDigest } from '@rca/core/digest/read'
import { mutantsOf } from '@rca/core/digest/test/mutants'
import { sampleDataset } from '@rca/core/synthetic'
import { toRecord, type ActivityRow } from './activities/shared.ts'

const base = JSON.parse(
  serializeDigest(digestActivity(sampleDataset().activities.find((a) => a.sport === 'ride')!)),
) as Record<string, unknown>

function rowOf(digestJson: string): ActivityRow {
  return {
    id: 'a',
    userId: 'u',
    dedupeKey: 'k',
    sport: 'ride',
    startMs: 1,
    name: 'n',
    digestVersion: 1,
    digestJson,
    fileName: 'a.fit',
    fileHash: 'h',
    fileKey: null,
    fileSize: null,
    fileReservationToken: null,
    createdAt: 1,
  }
}

describe('the stored digest as the API reads it', () => {
  it('gives the verdict the one digest reader gives, on every mutant', () => {
    const mutants = mutantsOf(base)
    expect(mutants.length).toBeGreaterThan(1000)
    for (const mutant of mutants) {
      const read = tryReadDigest(mutant.wire, 'stored')
      if (read.ok) {
        expect(toRecord(rowOf(mutant.json)).digest, mutant.name).toEqual(read.digest)
      } else {
        expect(() => toRecord(rowOf(mutant.json)), mutant.name).toThrow()
      }
    }
  })
})
