import { describe, expect, it } from 'vitest'
import type { RejectedFile } from '@rca/core/session'
import type { ImportManifest } from '../importManifest'
import { incompleteText } from './importIncompleteCopy'
import { damagedZips } from './replyHandlers'

const refused = (fileName: string, detail?: string): RejectedFile => ({
  fileName,
  reason: 'The file is damaged',
  code: 'corrupt',
  ...(detail === undefined ? {} : { detail }),
})

describe('damagedZips', () => {
  it('names a zip once, however many times it was refused, with the files it cost when any refusal says', () => {
    const found = damagedZips([
      refused('export.zip'),
      refused('export.zip', '3'),
      refused('export.zip'),
      refused('other.zip', '2'),
      refused('notes.txt'),
    ])
    expect(found).toEqual([
      { name: 'export.zip', lost: 3 },
      { name: 'other.zip', lost: 2 },
    ])
  })

  it('says a zip that ends early once in the notice', () => {
    const manifest: ImportManifest = {
      id: 'a',
      scope: 'device',
      startedAt: 1,
      updatedAt: 1,
      sources: [],
      expected: null,
      read: 0,
      damaged: damagedZips([refused('export.zip'), refused('export.zip')]),
      state: 'partial-source',
    }
    expect(incompleteText(manifest).match(/ends early/g)).toHaveLength(1)
  })
})
