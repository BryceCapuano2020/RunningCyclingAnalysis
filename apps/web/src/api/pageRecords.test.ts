import { afterEach, describe, expect, it, vi } from 'vitest'
import { digestActivity, serializeDigest } from '@rca/core/digest'
import { tryReadDigest } from '@rca/core/digest/read'
import { mutantsOf } from '@rca/core/digest/test/mutants'
import { sampleDataset } from '@rca/core/synthetic'
import { readableRecords } from './pageRecords'

const base = JSON.parse(
  serializeDigest(digestActivity(sampleDataset().activities.find((a) => a.sport === 'run')!)),
) as Record<string, unknown>

function item(id: string, digest: unknown) {
  return { id, fileName: 'a.fit', hasFile: false, fileSize: null, createdAt: 1, digest }
}

afterEach(() => vi.restoreAllMocks())

describe('readableRecords', () => {
  it('keeps a digest and counts the one it cannot read, naming it in the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const page = readableRecords([item('ok', base), item('bad', { ...base, startMs: 1e300 })])
    expect(page.records.map((r) => r.id)).toEqual(['ok'])
    expect(page.unreadable).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"path":"startMs"'))
  })

  it('gives the verdict the one digest reader gives, on every mutant', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const mutants = mutantsOf(base)
    expect(mutants.length).toBeGreaterThan(1000)
    for (const mutant of mutants) {
      const read = tryReadDigest(mutant.wire, 'stored')
      const page = readableRecords([item('m', mutant.wire)])
      expect(page.records.length, mutant.name).toBe(read.ok ? 1 : 0)
      if (read.ok) expect(page.records[0]!.digest, mutant.name).toEqual(read.digest)
    }
  })
})
