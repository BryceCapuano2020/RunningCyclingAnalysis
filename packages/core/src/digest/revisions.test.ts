import { describe, expect, it } from 'vitest'
import { CONSUMERS } from './consumers'
import { MODEL_REVISION } from './modelRevision'
import {
  OLDEST_COMPATIBLE_REVISION,
  REVISIONS,
  currentRevision,
  knows,
  missingFields,
  oldestCompatibleRevision,
  revisionStatus,
  withRevisionTable,
} from './revisions'
import type { RevisionDeclaration, RevisionStatus } from './revisions'

const declare = (
  revision: number,
  kind: RevisionDeclaration['kind'],
  adds: RevisionDeclaration['adds'] = [],
): RevisionDeclaration => ({ revision, kind, adds, changes: [], affects: [] })

/** Revision 3 adds a field and changes nothing else: older digests analyse as they are. */
const ADDITIVE: readonly RevisionDeclaration[] = [
  declare(1, 'exclusive'),
  declare(2, 'exclusive'),
  declare(3, 'additive', ['drift']),
]
/** Revision 3 changes values a little, so revision 2 is read beside it; revision 1 is still held. */
const MIXABLE: readonly RevisionDeclaration[] = [
  declare(1, 'exclusive'),
  declare(2, 'exclusive'),
  { ...declare(3, 'mixable'), affects: ['trend'], holdsBack: ['fitness'], bound: 'mixingStudy' },
]

function statuses(table: readonly RevisionDeclaration[]): RevisionStatus[] {
  return Array.from({ length: currentRevision(table) + 2 }, (_, i) => revisionStatus(i + 1, table))
}

describe('the revision table', () => {
  it('runs from 1 without gaps and ends at the revision this build writes', () => {
    expect(REVISIONS.map((r) => r.revision)).toEqual(REVISIONS.map((_, i) => i + 1))
    expect(REVISIONS.at(-1)?.revision).toBe(MODEL_REVISION)
  })

  it('names only consumers that exist', () => {
    for (const declaration of REVISIONS) {
      for (const name of [...declaration.affects, ...(declaration.holdsBack ?? [])]) {
        expect(Object.keys(CONSUMERS)).toContain(name)
      }
    }
  })

  it('declares revisions 1 to 7 exclusive, so nothing is compatible: a library holds one revision at a time', () => {
    expect(REVISIONS.map((r) => r.kind)).toEqual(Array<string>(7).fill('exclusive'))
  })

  it('declares what revision 7 adds and changes, and the readers the mixing study found it moves', () => {
    const seven = REVISIONS.at(-1)!
    expect(seven.revision).toBe(7)
    expect(seven.adds).toEqual(['temperature', 'athleteType', 'localDayShift'])
    expect(seven.affects).toEqual(['combine', 'trend', 'change', 'records', 'fitness'])
    expect(seven.holdsBack).toBeUndefined()
  })
})

describe('revisionStatus', () => {
  it('is stale below the current revision and newer above it, over the real table', () => {
    expect(statuses(REVISIONS)).toEqual([
      'stale',
      'stale',
      'stale',
      'stale',
      'stale',
      'stale',
      'current',
      'newer',
      'newer',
    ])
  })

  it('reads an additive bump as compatible with the revision before it only', () => {
    expect(statuses(ADDITIVE)).toEqual(['stale', 'compatible', 'current', 'newer', 'newer'])
    expect(revisionStatus(2, ADDITIVE)).toBe('compatible')
    expect(revisionStatus(1, ADDITIVE)).toBe('stale')
  })

  it('reads a mixable bump as compatible with the revision before it', () => {
    expect(statuses(MIXABLE)).toEqual(['stale', 'compatible', 'current', 'newer', 'newer'])
  })

  it('walks every step: one exclusive step on the way makes a digest stale', () => {
    const table = [
      declare(1, 'exclusive'),
      declare(2, 'additive'),
      declare(3, 'exclusive'),
      declare(4, 'additive'),
    ]
    expect(statuses(table)).toEqual(['stale', 'stale', 'compatible', 'current', 'newer', 'newer'])
  })

  it('holds out a revision the table does not know', () => {
    expect(revisionStatus(0)).toBe('stale')
    expect(revisionStatus(-1)).toBe('stale')
    expect(revisionStatus(2.5)).toBe('stale')
    expect(revisionStatus(Number.NaN)).toBe('stale')
  })

  it('gives the oldest revision the server accepts', () => {
    expect(OLDEST_COMPATIBLE_REVISION).toBe(MODEL_REVISION)
    expect(oldestCompatibleRevision(ADDITIVE)).toBe(2)
    expect(oldestCompatibleRevision(MIXABLE)).toBe(2)
  })
})

describe('what a digest knows', () => {
  it('knows a field from the revision that added it', () => {
    expect(knows({ modelRevision: 2 }, 'drift', ADDITIVE)).toBe(false)
    expect(knows({ modelRevision: 3 }, 'drift', ADDITIVE)).toBe(true)
    // A field no revision adds was always there.
    expect(knows({ modelRevision: 1 }, 'durability', ADDITIVE)).toBe(true)
  })

  it('lists the fields a rebuild would add', () => {
    expect(missingFields({ modelRevision: 2 }, ADDITIVE)).toEqual(['drift'])
    expect(missingFields({ modelRevision: 3 }, ADDITIVE)).toEqual([])
    expect(missingFields({ modelRevision: MODEL_REVISION })).toEqual([])
  })
})

describe('withRevisionTable', () => {
  it('changes what the defaults read for the length of the call only, even when it throws', () => {
    expect(revisionStatus(2)).toBe('stale')
    withRevisionTable(ADDITIVE, () => expect(revisionStatus(2)).toBe('compatible'))
    expect(() =>
      withRevisionTable(ADDITIVE, () => {
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(revisionStatus(2)).toBe('stale')
  })
})
