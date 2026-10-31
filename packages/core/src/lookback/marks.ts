import type { CheckInSnapshot } from './snapshot'

/**
 * Which snapshot "since your last import" compares with, and when it moves. The rule is pure: the store keeps the
 * `Marks` of a scope, the worker calls these at the start and the end of an import.
 */

/** What is kept for one scope (the device, or one account). */
export interface Marks {
  v: 1
  /** The library as it was before the last substantive import; null after a first import. */
  baseline: CheckInSnapshot | null
  /** When the last import was committed, in wall-clock milliseconds; null before the first. */
  lastImportAtMs: number | null
  /** The library as it was before the import now running; becomes the baseline when that import commits. */
  pending: CheckInSnapshot | null
}

/** Imports this close together, in a row, are one import: a first import made in several drops stays a first import. */
export const JOIN_WINDOW_MS = 6 * 3_600_000

/**
 * How an import ended, as far as the baseline is concerned. `accepted-partial` is "Use what I have" on an import that
 * stopped short; `interrupted` and `partial-source` are imports that stopped short and were not accepted.
 */
export interface ImportEnd {
  manifest: 'complete' | 'accepted-partial' | 'interrupted' | 'partial-source'
  /** Workouts the import added to the library. */
  added: number
}

/** An import is starting: remember the library as it is before any of its files is kept. */
export function beginImport(marks: Marks | null, before: CheckInSnapshot | null): Marks {
  return {
    v: 1,
    baseline: marks?.baseline ?? null,
    lastImportAtMs: marks?.lastImportAtMs ?? null,
    pending: before,
  }
}

/** Whether an import at `nowMs` is part of the one that ended at `lastMs` (never for a clock that went backwards). */
export const joins = (lastMs: number | null, nowMs: number): boolean =>
  lastMs !== null && nowMs - lastMs >= 0 && nowMs - lastMs < JOIN_WINDOW_MS

/**
 * An import ended. A complete import that added a workout commits, and so does a partial one the athlete accepted, at
 * that moment, from the snapshot taken when it began. One that stopped short and was not accepted moves nothing and
 * keeps its snapshot (a later complete import of the same files replaces it with its own). One that added nothing
 * moves nothing. A commit inside the join window leaves the baseline where it was.
 */
export function endImport(marks: Marks, end: ImportEnd, nowMs: number): Marks {
  const commits =
    end.added > 0 && (end.manifest === 'complete' || end.manifest === 'accepted-partial')
  if (!commits) return marks
  const baseline = joins(marks.lastImportAtMs, nowMs) ? marks.baseline : marks.pending
  return { v: 1, baseline, lastImportAtMs: nowMs, pending: null }
}

/**
 * The baseline to compare with, or null. A rebuild of the library (the updater's last completed run, `rebuiltAtMs`)
 * after the baseline was taken drops it: the next import writes a fresh one, so the check-in never sets one model
 * beside another.
 */
export function usableBaseline(
  marks: Marks | null,
  rebuiltAtMs: number | null,
): CheckInSnapshot | null {
  const baseline = marks?.baseline ?? null
  if (baseline === null) return null
  return rebuiltAtMs !== null && rebuiltAtMs > baseline.atMs ? null : baseline
}
