import { describe, expect, it } from 'vitest'
import { beginImport, endImport, joins, JOIN_WINDOW_MS, usableBaseline } from './marks'
import type { BaselineCheck, ImportEnd, Marks } from './marks'
import { ago, NOW, snap } from './test/snapshotFixture'

const before = snap({ run: [ago(30)] })
const earlier = snap({ run: [ago(90)] })
const HOUR = 3_600_000
const CHECK: BaselineCheck = { revision: 7, rebuiltAtMs: null }
const complete = (added: number): ImportEnd => ({ manifest: 'complete', added })
const none: Marks = { v: 1, baseline: null, lastImportAtMs: NOW, pending: null }

describe('the join window', () => {
  it('is 0 <= now - last < 6 hours, exactly, and never for a clock that went backwards', () => {
    expect(joins(NOW, NOW)).toBe(true)
    expect(joins(NOW, NOW + JOIN_WINDOW_MS - 1)).toBe(true)
    expect(joins(NOW, NOW + JOIN_WINDOW_MS)).toBe(false)
    expect(joins(NOW, NOW - 1)).toBe(false)
    expect(joins(null, NOW)).toBe(false)
  })
})

describe('rotation', () => {
  it('a first import leaves no baseline, and records when it was made', () => {
    const marks = endImport(beginImport(null, null), complete(5), NOW, CHECK)
    expect(marks).toEqual({ v: 1, baseline: null, lastImportAtMs: NOW, pending: null })
  })

  it('a later import sets the baseline to the library as it was before that import', () => {
    const next = endImport(beginImport(none, before), complete(2), NOW + 7 * HOUR, CHECK)
    expect(next).toEqual({ v: 1, baseline: before, lastImportAtMs: NOW + 7 * HOUR, pending: null })
  })

  it('drops of one first import stay one import, and a drop soon after a check-in keeps its baseline', () => {
    const first = endImport(beginImport(null, null), complete(5), NOW, CHECK)
    const second = endImport(beginImport(first, before), complete(5), NOW + HOUR, CHECK)
    expect(second.baseline).toBeNull()
    expect(second.lastImportAtMs).toBe(NOW + HOUR)
    const kept: Marks = { v: 1, baseline: earlier, lastImportAtMs: NOW, pending: null }
    const joined = endImport(beginImport(kept, before), complete(1), NOW + 2 * HOUR, CHECK)
    expect(joined.baseline).toBe(earlier)
  })

  it('a drop soon after takes the new snapshot when the baseline can no longer be used', () => {
    const kept: Marks = { v: 1, baseline: earlier, lastImportAtMs: NOW, pending: null }
    const [rebuilt, newModel] = [
      { ...CHECK, rebuiltAtMs: NOW + 1 },
      { ...CHECK, revision: 8 },
    ]
    for (const check of [rebuilt, newModel]) {
      const next = endImport(beginImport(kept, before), complete(1), NOW + 2 * HOUR, check)
      expect(next.baseline).toBe(before)
    }
  })

  it('a partial import the athlete accepted commits then, from the snapshot taken when it began', () => {
    const started = beginImport(none, before)
    const stopped = endImport(started, { manifest: 'interrupted', added: 3 }, NOW + 8 * HOUR, CHECK)
    expect(stopped).toBe(started)
    const accepted = endImport(
      stopped,
      { manifest: 'accepted-partial', added: 3 },
      NOW + 9 * HOUR,
      CHECK,
    )
    expect(accepted.baseline).toBe(before)
    expect(accepted.pending).toBeNull()
  })

  it('moves nothing for a partial source or an import that added nothing', () => {
    const kept: Marks = { v: 1, baseline: earlier, lastImportAtMs: NOW, pending: null }
    const started = beginImport(kept, before)
    const partial: ImportEnd = { manifest: 'partial-source', added: 4 }
    expect(endImport(started, partial, NOW + 9 * HOUR, CHECK)).toBe(started)
    expect(endImport(started, complete(0), NOW + 9 * HOUR, CHECK)).toBe(started)
    expect(started.pending).toBe(before)
    expect(started.baseline).toBe(earlier)
  })
})

describe('the baseline in use', () => {
  const marks: Marks = { v: 1, baseline: before, lastImportAtMs: NOW, pending: null }

  it('is dropped by a rebuild after it was taken', () => {
    expect(usableBaseline(marks, CHECK)).toBe(before)
    expect(usableBaseline(marks, { ...CHECK, rebuiltAtMs: NOW - 1 })).toBe(before)
    expect(usableBaseline(marks, { ...CHECK, rebuiltAtMs: NOW })).toBe(before)
    expect(usableBaseline(marks, { ...CHECK, rebuiltAtMs: NOW + 1 })).toBeNull()
    expect(usableBaseline(null, CHECK)).toBeNull()
  })

  it('is dropped when it was taken at another model revision, so two models are never set side by side', () => {
    expect(usableBaseline(marks, { ...CHECK, revision: 8 })).toBeNull()
    expect(usableBaseline({ ...marks, baseline: snap({}, { revision: 6 }) }, CHECK)).toBeNull()
  })
})
