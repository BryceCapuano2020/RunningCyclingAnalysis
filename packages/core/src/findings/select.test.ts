import { describe, expect, it } from 'vitest'
import { FINDINGS } from './constants'
import { byRank, selectFindings } from './select'
import type { Finding, Kind } from './types'
import type { Sport } from '../types'

function finding(id: string, score: number, over: Partial<Finding> = {}): Finding {
  return {
    id,
    detector: id.split(':')[0]!,
    kind: 'efficiency',
    sports: ['run'],
    direction: 'neutral',
    effect: 0.05,
    window: { fromMs: 0, toMs: 1 },
    baseline: { fromMs: 0, toMs: 1 },
    headline: id,
    numbers: [],
    evidence: [],
    method: { test: 't', n: 1, exclusions: [] },
    confidence: 1,
    surprise: score,
    score,
    corroboratedBy: [],
    asOfMs: 0,
    firstSeenMs: 0,
    fingerprint: id,
    ...over,
  }
}

const kind = (k: Kind) => ({ kind: k })

describe('selectFindings', () => {
  it('ranks by score, then the newer first seen, then the id', () => {
    const list = [
      finding('c:run:x', 0.5, { firstSeenMs: 1, ...kind('pattern') }),
      finding('b:run:x', 0.5, { firstSeenMs: 2, ...kind('discipline') }),
      finding('a:run:x', 0.5, { firstSeenMs: 2, ...kind('durability') }),
      finding('d:run:x', 0.7, { ...kind('pattern') }),
    ]
    expect(selectFindings(list).map((f) => f.id)).toEqual([
      'd:run:x',
      'a:run:x',
      'b:run:x',
      'c:run:x',
    ])
    expect(selectFindings([...list].reverse()).map((f) => f.id)).toEqual([
      'd:run:x',
      'a:run:x',
      'b:run:x',
      'c:run:x',
    ])
    expect([list[0]!, list[1]!].sort(byRank)[0]!.id).toBe('b:run:x')
  })

  it('keeps one of an id, the best', () => {
    const found = selectFindings([finding('a:run:x', 0.5), finding('a:run:x', 0.9)])
    expect(found).toHaveLength(1)
    expect(found[0]!.score).toBe(0.9)
  })

  it('puts no kind twice in the top three unless the second scores 0.9', () => {
    const list = [
      finding('a:run:1', 0.85, kind('pattern')),
      finding('b:run:2', 0.8, kind('pattern')),
      finding('c:run:3', 0.7, kind('discipline')),
      finding('d:run:4', 0.6, kind('durability')),
      finding('e:run:5', 0.5, kind('pattern')),
    ]
    expect(selectFindings(list).map((f) => f.id)).toEqual([
      'a:run:1',
      'c:run:3',
      'd:run:4',
      'b:run:2',
      'e:run:5',
    ])
    const strong = [
      finding('a:run:1', 0.95, kind('pattern')),
      finding('b:run:2', 0.92, kind('pattern')),
      ...list.slice(2),
    ]
    expect(
      selectFindings(strong)
        .map((f) => f.id)
        .slice(0, 3),
    ).toEqual(['a:run:1', 'b:run:2', 'c:run:3'])
  })

  it('keeps the best same-sport efficiency finding and names the others as corroboration', () => {
    const list = [
      finding('same-hr:run:a', 0.9),
      finding('flat:run:b', 0.7),
      finding('same-hr-ride:ride:c', 0.6, { sports: ['ride' as Sport] }),
      finding('both:ride+run:d', 0.5, { sports: ['ride', 'run'] }),
      finding('pat:run:e', 0.4, kind('pattern')),
    ]
    const found = selectFindings(list)
    // The ride finding and the two-sport one are efficiency too, so the pattern is lifted over them.
    expect(found.map((f) => f.id)).toEqual([
      'same-hr:run:a',
      'pat:run:e',
      'same-hr-ride:ride:c',
      'both:ride+run:d',
    ])
    expect(found.find((f) => f.id === 'same-hr:run:a')!.corroboratedBy).toEqual(['flat:run:b'])
    expect(found.find((f) => f.id === 'flat:run:b')).toBeUndefined()
    expect(found.find((f) => f.id === 'both:ride+run:d')).toBeDefined()
    expect(list[0]!.corroboratedBy).toEqual([])
  })

  it('does not group efficiency findings that disagree: the opposite direction stands on its own', () => {
    const list = [
      finding('same-hr:run:a', 0.9, { direction: 'better' }),
      finding('flat:run:b', 0.7, { direction: 'worse' }),
      finding('flat2:run:c', 0.6, { direction: 'better' }),
    ]
    const found = selectFindings(list)
    expect(found.map((f) => f.id).sort()).toEqual(['flat:run:b', 'same-hr:run:a'])
    expect(found.find((f) => f.id === 'same-hr:run:a')!.corroboratedBy).toEqual(['flat2:run:c'])
    expect(found.find((f) => f.id === 'flat:run:b')!.corroboratedBy).toEqual([])
  })

  it('keeps 15 for each sport, and a finding of two sports while one has room', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      finding(`d${i}:run:x`, 0.9 - i * 0.01, kind('pattern')),
    )
    expect(selectFindings(many)).toHaveLength(FINDINGS.maxPerSport)
    const rides = Array.from({ length: 3 }, (_, i) =>
      finding(`r${i}:ride:x`, 0.2 - i * 0.01, { sports: ['ride'], ...kind('pattern') }),
    )
    const shared = finding('s:ride+run:x', 0.1, { sports: ['ride', 'run'], ...kind('pattern') })
    const found = selectFindings([...many, ...rides, shared])
    expect(found).toHaveLength(FINDINGS.maxPerSport + 3 + 1)
  })
})
