import { describe, expect, it } from 'vitest'
import { MODEL_REVISION } from './digest/modelRevision'
import { AnalysisSession } from './session'
import type { SessionState } from './sessionState'
import {
  STATE_SNAPSHOT_VERSION,
  fromSnapshot,
  ANALYSIS_REVISION,
  snapshotIsCurrent,
  toSnapshot,
  type SnapshotMeta,
} from './stateSnapshot'
import { snapshotCorpus } from './test/snapshotCorpus'

const META: SnapshotMeta = {
  libraryVersion: 3,
  nowMs: 1_750_000_000_000,
  zone: 'UTC',
  buildSha: 'abc123',
}
const corpus = snapshotCorpus()

function stateOf({ digests, settings, nowMs }: (typeof corpus)[number]): SessionState {
  const session = new AnalysisSession()
  session.clock = () => nowMs
  return session.loadDigests(digests, settings)
}

describe('StateSnapshot', () => {
  it('is version 2 and carries the model revision and the meta it was given', () => {
    const snapshot = toSnapshot(stateOf(corpus[0]!), META)
    expect(STATE_SNAPSHOT_VERSION).toBe(2)
    expect(snapshot).toMatchObject({ schemaVersion: 2, modelRevision: MODEL_REVISION, ...META })
  })

  it('round trips every synthetic library without losing a field, through its JSON text', () => {
    const tags = new Set<string>()
    for (const library of corpus) {
      const state = stateOf(library)
      const snapshot = toSnapshot(state, META)
      const text = JSON.stringify(snapshot)
      for (const tag of ['Map', 'Set', 'NaN']) if (text.includes(`"$":"${tag}"`)) tags.add(tag)
      expect(fromSnapshot(JSON.parse(text))).toStrictEqual(state)
      expect(JSON.stringify(toSnapshot(fromSnapshot(snapshot), META))).toBe(text)
    }
    // Each kind of value JSON cannot hold appears in the corpus, so the round trip has been tested on it.
    expect([...tags].sort()).toEqual(['Map', 'NaN', 'Set'])
  })

  it('keeps the values JSON loses: undefined, negative zero, infinities, NaN, Maps and Sets', () => {
    const odd = {
      a: undefined,
      b: [-0, NaN, Infinity, -Infinity, 0, 1.5],
      c: new Map<unknown, unknown>([
        [1, new Set(['x'])],
        ['k', { n: NaN }],
      ]),
    } as unknown as SessionState
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(odd, META))))
    expect(back).toStrictEqual(odd)
    expect(Object.is((back as unknown as { b: number[] }).b[0], -0)).toBe(true)
  })

  it('refuses a value a state does not hold, and the key it reserves', () => {
    const bad = (value: unknown) => () => toSnapshot(value as SessionState, META)
    expect(bad({ at: new Date(0) })).toThrow('cannot hold a object value at state.at')
    expect(bad({ run: () => 1 })).toThrow('state.run')
    expect(bad({ nested: [{ $: 'Map' }] })).toThrow('reserved key')
    expect(() =>
      fromSnapshot({ ...toSnapshot(stateOf(corpus[0]!), META), state: { $: 'Date' } }),
    ).toThrow('unknown tag')
  })

  it('is current only for this build: its shape and its model', () => {
    const snapshot = toSnapshot(stateOf(corpus[0]!), META)
    expect(snapshotIsCurrent(snapshot)).toBe(true)
    expect(snapshotIsCurrent({ ...snapshot, schemaVersion: STATE_SNAPSHOT_VERSION + 1 })).toBe(
      false,
    )
    expect(snapshotIsCurrent({ ...snapshot, modelRevision: MODEL_REVISION - 1 })).toBe(false)
  })

  it('is stale when made under another analysis revision, or before the revision was recorded', () => {
    const snapshot = toSnapshot(stateOf(corpus[0]!), META)
    expect(snapshot.analysisRevision).toBe(ANALYSIS_REVISION)
    expect(snapshotIsCurrent({ ...snapshot, analysisRevision: ANALYSIS_REVISION - 1 })).toBe(false)
    const { analysisRevision: _dropped, ...before } = snapshot
    expect(snapshotIsCurrent(before)).toBe(false)
  })
})
