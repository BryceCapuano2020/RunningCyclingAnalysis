import { describe, expect, it } from 'vitest'
import { beginImport, endImport, joins, JOIN_WINDOW_MS, usableBaseline } from './marks'
import type { Marks } from './marks'
import { ago, NOW, snap } from './test/snapshotFixture'

const before = snap({ run: [ago(30)] })
const earlier = snap({ run: [ago(90)] })
const HOUR = 3_600_000

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
    const marks = endImport(beginImport(null, null), { manifest: 'complete', added: 5 }, NOW)
    expect(marks).toEqual({ v: 1, baseline: null, lastImportAtMs: NOW, pending: null })
  })

  it('a later import sets the baseline to the library as it was before that import', () => {
    const marks: Marks = { v: 1, baseline: null, lastImportAtMs: NOW, pending: null }
    const next = endImport(
      beginImport(marks, before),
      { manifest: 'complete', added: 2 },
      NOW + 7 * HOUR,
    )
    expect(next).toEqual({ v: 1, baseline: before, lastImportAtMs: NOW + 7 * HOUR, pending: null })
  })

  it('drops of one first import stay one import, and a drop soon after a check-in keeps its baseline', () => {
    const first = endImport(beginImport(null, null), { manifest: 'complete', added: 5 }, NOW)
    const second = endImport(
      beginImport(first, before),
      { manifest: 'complete', added: 5 },
      NOW + HOUR,
    )
    expect(second.baseline).toBeNull()
    expect(second.lastImportAtMs).toBe(NOW + HOUR)
    const kept: Marks = { v: 1, baseline: earlier, lastImportAtMs: NOW, pending: null }
    const joined = endImport(
      beginImport(kept, before),
      { manifest: 'complete', added: 1 },
      NOW + 2 * HOUR,
    )
    expect(joined.baseline).toBe(earlier)
  })

  it('a partial import the athlete accepted commits then, from the snapshot taken when it began', () => {
    const started = beginImport(
      { v: 1, baseline: null, lastImportAtMs: NOW, pending: null },
      before,
    )
    const stopped = endImport(started, { manifest: 'interrupted', added: 3 }, NOW + 8 * HOUR)
    expect(stopped).toBe(started)
    const accepted = endImport(stopped, { manifest: 'accepted-partial', added: 3 }, NOW + 9 * HOUR)
    expect(accepted.baseline).toBe(before)
    expect(accepted.pending).toBeNull()
  })

  it('moves nothing for a partial source or an import that added nothing', () => {
    const started = beginImport(
      { v: 1, baseline: earlier, lastImportAtMs: NOW, pending: null },
      before,
    )
    expect(endImport(started, { manifest: 'partial-source', added: 4 }, NOW + 9 * HOUR)).toBe(
      started,
    )
    expect(endImport(started, { manifest: 'complete', added: 0 }, NOW + 9 * HOUR)).toBe(started)
    expect(started.pending).toBe(before)
    expect(started.baseline).toBe(earlier)
  })
})

describe('the baseline in use', () => {
  const marks: Marks = { v: 1, baseline: before, lastImportAtMs: NOW, pending: null }

  it('is dropped by a rebuild after it was taken, so two models are never set side by side', () => {
    expect(usableBaseline(marks, null)).toBe(before)
    expect(usableBaseline(marks, NOW - 1)).toBe(before)
    expect(usableBaseline(marks, NOW)).toBe(before)
    expect(usableBaseline(marks, NOW + 1)).toBeNull()
    expect(usableBaseline(null, null)).toBeNull()
  })
})
