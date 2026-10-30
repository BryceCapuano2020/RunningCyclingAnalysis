import { describe, expect, it } from 'vitest'
import type { ImportManifest } from '../importManifest'
import { incompleteText } from './importIncompleteCopy'

function manifest(over: Partial<ImportManifest>): ImportManifest {
  return {
    id: 'a',
    scope: 'device',
    startedAt: 1,
    updatedAt: 1,
    sources: [],
    expected: 100,
    read: 40,
    damaged: [],
    state: 'interrupted',
    ...over,
  }
}

describe('incompleteText', () => {
  it('says how far a cut-off import got, and how to finish', () => {
    expect(incompleteText(manifest({ read: 1_204, expected: 3_639 }))).toBe(
      'The last import stopped after 1,204 of 3,639 files. What it added is here. Add the same files again to finish: files already added are skipped.',
    )
  })

  it('says only that it stopped when it never counted its files, or had read them all', () => {
    const plain =
      'The last import stopped before it finished. What it added is here. Add the same files again to finish: files already added are skipped.'
    expect(incompleteText(manifest({ expected: null }))).toBe(plain)
    expect(incompleteText(manifest({ read: 100, expected: 100 }))).toBe(plain)
  })

  it('names a damaged zip and what it cost, and says to download it again', () => {
    expect(
      incompleteText(
        manifest({ state: 'partial-source', damaged: [{ name: 'export.zip', lost: 1 }] }),
      ),
    ).toBe(
      'export.zip is damaged: 1 file in it could not be read. Download the export again and add it.',
    )
  })

  it('says a zip that ends early is missing files when its directory could not say how many', () => {
    expect(
      incompleteText(
        manifest({ state: 'partial-source', damaged: [{ name: 'export.zip', lost: null }] }),
      ),
    ).toBe(
      'export.zip ends early, so some of its files are missing. Download the export again and add it.',
    )
  })

  it('names up to three damaged zips and counts the rest', () => {
    const damaged = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name: `${name}.zip`, lost: 2 }))
    const text = incompleteText(manifest({ state: 'partial-source', damaged }))
    expect(text).toContain('a.zip is damaged')
    expect(text).toContain('c.zip is damaged')
    expect(text).not.toContain('d.zip')
    expect(text).toContain('2 other zips are damaged too.')
  })
})
