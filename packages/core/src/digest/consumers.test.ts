import { describe, expect, it } from 'vitest'
import type { ActivityDigest } from '../types'
import { CONSUMERS, orderedFor, readsRevision } from './consumers'
import type { Consumer } from './consumers'
import { orderedCurrent } from './ordered'
import { REVISIONS } from './revisions'
import type { RevisionDeclaration } from './revisions'

function digestOf(modelRevision: number, id: string, startMs = 0): ActivityDigest {
  return { id, modelRevision, startMs } as ActivityDigest
}

const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})
/** Revision 3 is mixable and holds the fitness card back: revision 2 is compatible with it. */
const TABLE: readonly RevisionDeclaration[] = [
  exclusive(1),
  exclusive(2),
  {
    revision: 3,
    kind: 'mixable',
    adds: [],
    changes: [],
    affects: ['trend'],
    holdsBack: ['fitness'],
  },
]

describe('orderedFor', () => {
  const library = [
    digestOf(3, 'c', 30),
    digestOf(2, 'b', 20),
    digestOf(1, 'a', 10),
    digestOf(4, 'd', 40),
  ]

  it('reads current digests only while every revision is exclusive, as orderedCurrent does', () => {
    const mixed = [
      digestOf(6, 'x', 2),
      digestOf(5, 'y', 1),
      digestOf(7, 'z', 3),
      digestOf(6, 'w', 0),
    ]
    // The rule before the table, written out: the digests of revision 6, by start time then id.
    const before = mixed
      .filter((d) => d.modelRevision === 6)
      .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
    for (const name of Object.keys(CONSUMERS) as Consumer[]) {
      expect(orderedFor(name, mixed)).toEqual(before)
    }
    expect(orderedCurrent(mixed)).toEqual(before)
    expect(orderedFor('combine', mixed).map((d) => d.id)).toEqual(['w', 'x'])
    expect(REVISIONS.at(-1)?.revision).toBe(6)
  })

  it('remembers an answer for the same digests without sharing the array a caller may change', () => {
    const digests = [digestOf(6, 'b', 2), digestOf(6, 'a', 1)]
    const first = orderedFor('combine', digests)
    first.pop()
    const second = orderedFor('trend', digests)
    expect(second.map((d) => d.id)).toEqual(['a', 'b'])
    expect(second).not.toBe(first)
    expect(second[0]).toBe(digests[1])
  })

  it('does not mix the answers of consumers that read different revisions of the same digests', () => {
    const digests = [digestOf(3, 'c', 3), digestOf(2, 'b', 2)]
    expect(orderedFor('trend', digests, TABLE).map((d) => d.id)).toEqual(['b', 'c'])
    expect(orderedFor('fitness', digests, TABLE).map((d) => d.id)).toEqual(['c'])
    expect(orderedFor('trend', digests, TABLE).map((d) => d.id)).toEqual(['b', 'c'])
  })

  it('adds compatible digests for a consumer that reads them, in canonical order', () => {
    expect(orderedFor('trend', library, TABLE).map((d) => d.id)).toEqual(['b', 'c'])
  })

  it('keeps a held-back consumer on current digests', () => {
    expect(orderedFor('fitness', library, TABLE).map((d) => d.id)).toEqual(['c'])
    expect(readsRevision('fitness', 2, TABLE)).toBe(false)
    expect(readsRevision('fitness', 3, TABLE)).toBe(true)
  })

  it('never reads a stale or a newer digest', () => {
    for (const name of Object.keys(CONSUMERS) as Consumer[]) {
      expect(orderedFor(name, library, TABLE).map((d) => d.id)).not.toContain('a')
      expect(orderedFor(name, library, TABLE).map((d) => d.id)).not.toContain('d')
    }
  })
})
