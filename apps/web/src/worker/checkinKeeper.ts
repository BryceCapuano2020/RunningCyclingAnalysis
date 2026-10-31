import { beginImport, checkInBetween, endImport, usableBaseline } from '@rca/core/lookback'
import type { CheckIn, CheckInSnapshot, ImportEnd } from '@rca/core/lookback'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { NO_SEEN, readScope, writeScope } from './checkinMarks'
import type { ScopeRecords, SeenRecord, StoredMarks } from './checkinMarks'
import type { CheckinScope } from './checkinStore'

/**
 * What the page is told of "since your last import", beside the state: the check-in itself and whether the athlete
 * has seen it. The baseline and the snapshots stay in the worker.
 */
export interface CheckInView {
  checkIn: CheckIn | null
  /** Seen for this baseline: opened, hidden, or shown on two page loads. The row then gives up its place. */
  seen: boolean
  /** The athlete has opened or hidden "Your years", or been shown it on two page loads: it gives up its place. Absent is not. */
  lookBackSeen?: boolean
}

export const NO_CHECKIN: CheckInView = { checkIn: null, seen: false }

/** The two rows whose sightings are kept, the ways of seeing one, and how many page loads make a row seen. */
export type SeenRow = 'lookBack' | 'checkIn'
export type SeenEvent = 'open' | 'hide' | 'impression'
export const SEEN_AFTER_IMPRESSIONS = 2

/** The records of a scope held in memory, with whether storage took them (a session that stores nothing keeps them here only). */
interface Held extends ScopeRecords {
  stored: boolean
}

/**
 * The baseline of each scope and the flags on its rows. A scope's records are read once and kept; every change is
 * written under the epoch they were read with. The sample keeps nothing (`scope` null), and a scope whose storage
 * refuses behaves as a first visit that is remembered for the tab only.
 */
export class CheckInKeeper {
  private readonly held = new Map<CheckinScope, Held>()
  /** The library as it was before an import whose files are kept nowhere yet, and what it added: committed if they are kept. */
  private provisional: { before: CheckInSnapshot | null; added: number } | null = null
  private rebuiltAtMs: number | null = null
  private readonly now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  private async load(scope: CheckinScope, fresh = false): Promise<Held> {
    const known = this.held.get(scope)
    if (known !== undefined && !fresh) return known
    const read = await readScope(scope)
    const loaded: Held =
      read === null
        ? { marks: null, seen: NO_SEEN, epoch: 0, stored: false }
        : { ...read, stored: true }
    this.held.set(scope, loaded)
    return loaded
  }

  /** Forgets what the worker holds of a scope (it was cleared); the next use reads the store again. */
  forget(scope: CheckinScope): void {
    this.held.delete(scope)
  }

  /** Forgets everything held, as when the library on screen is another's. */
  forgetAll(): void {
    this.held.clear()
    this.provisional = null
  }

  /** Files analysed with no scope are not going to be kept: the snapshot that waited for them goes. */
  dropProvisional(): void {
    this.provisional = null
  }

  /** The model's last rebuild finished: a baseline from before it is not compared with. */
  async rebuilt(scope: CheckinScope | null): Promise<void> {
    this.rebuiltAtMs = this.now()
    if (scope === null) return
    const held = await this.load(scope)
    if (held.marks === null) return
    held.marks = { ...held.marks, rebuiltAtMs: this.rebuiltAtMs }
    await this.write(scope, held, { marks: held.marks })
  }

  private async write(
    scope: CheckinScope,
    held: Held,
    records: { marks?: StoredMarks | undefined; seen?: SeenRecord },
  ): Promise<void> {
    if (!held.stored) return
    const out: { marks?: StoredMarks; seen?: SeenRecord } = {}
    if (records.marks !== undefined) out.marks = records.marks
    if (records.seen !== undefined) out.seen = records.seen
    const result = await writeScope(scope, held.epoch, out)
    // Cleared under this tab: what it holds is not the scope's any more, and nothing of it is written.
    if (result === 'replaced') this.held.delete(scope)
  }

  /**
   * An import is about to keep files: `before` is the library as it stands, null when it is empty. With `scope` null
   * (files that are kept nowhere yet) the snapshot waits in memory for `adopt`; a second drop while it waits is part of
   * the same import, so the first library stands and the workouts add up. The records are read again, since another
   * tab may have moved them since this one loaded.
   */
  async begin(scope: CheckinScope | null, before: CheckInSnapshot | null): Promise<void> {
    if (scope === null) {
      this.provisional ??= { before, added: 0 }
      return
    }
    const held = await this.load(scope, true)
    held.marks = { ...beginImport(held.marks, before), ...rebuilt(held.marks) }
    await this.write(scope, held, { marks: held.marks })
  }

  /**
   * An import ended with `end`. A complete one that added a workout, or a partial one the athlete accepted, moves the
   * baseline (see `endImport`); any other moves nothing. Returns nothing: the page asks for the view.
   */
  async settle(scope: CheckinScope | null, end: ImportEnd): Promise<void> {
    if (scope === null) return
    const held = await this.load(scope, true)
    if (held.marks === null) return
    // Accepting an import that is no longer waiting (it was settled, or a reload lost it) must not move the baseline.
    if (
      end.manifest === 'accepted-partial' &&
      held.marks.pending === null &&
      held.marks.lastImportAtMs !== null
    ) {
      return
    }
    const next = endImport(held.marks, end, this.now(), this.check(held.marks))
    if (next === held.marks) return
    held.marks = { ...next, ...rebuilt(held.marks) }
    await this.write(scope, held, { marks: held.marks })
  }

  /** Files that were kept nowhere added this many workouts. */
  noteProvisionalAdded(added: number): void {
    if (this.provisional !== null) this.provisional.added += added
  }

  /** Those files are now kept under `scope`: the snapshot taken before them is committed there. */
  async adopt(scope: CheckinScope): Promise<void> {
    const waiting = this.provisional
    this.provisional = null
    if (waiting === null) return
    await this.begin(scope, waiting.before)
    await this.settle(scope, { manifest: 'complete', added: waiting.added })
  }

  private check(marks: StoredMarks | null) {
    return {
      revision: MODEL_REVISION,
      rebuiltAtMs: Math.max(this.rebuiltAtMs ?? 0, marks?.rebuiltAtMs ?? 0) || null,
    }
  }

  /**
   * The check-in for the library as it stands: baseline against `live`, null without a baseline of this model. The
   * live snapshot is made only when there is a baseline to compare with.
   */
  async view(scope: CheckinScope | null, live: () => CheckInSnapshot | null): Promise<CheckInView> {
    if (scope === null) return NO_CHECKIN
    const held = await this.load(scope)
    const lookBackSeen = seenLookBack(held.seen)
    const none: CheckInView = lookBackSeen ? { ...NO_CHECKIN, lookBackSeen } : NO_CHECKIN
    const baseline = usableBaseline(held.marks, this.check(held.marks))
    if (baseline === null) return none
    const now = live()
    if (now === null) return none
    const view: CheckInView = {
      checkIn: checkInBetween(baseline, now),
      seen: seenFor(held.seen, baseline),
    }
    return lookBackSeen ? { ...view, lookBackSeen } : view
  }

  /**
   * The athlete opened, hid or was shown a row. Idempotent for the first two; an impression counts once a page load.
   * A check-in's sightings belong to the baseline it was told against: a new baseline starts them again. Returns
   * whether the row asked about is now seen.
   */
  async markSeen(scope: CheckinScope | null, row: SeenRow, event: SeenEvent): Promise<boolean> {
    if (scope === null) return false
    const held = await this.load(scope)
    const at = this.now()
    const seen = structuredClone(held.seen)
    if (row === 'lookBack') {
      const part = seen.lookBack
      if (event === 'open') part.openedAtMs ??= at
      else if (event === 'hide') part.hiddenAtMs ??= at
      else {
        part.impressions++
        part.lastAtMs = at
      }
    } else {
      const baseline = usableBaseline(held.marks, this.check(held.marks))
      if (baseline === null) return false
      if (seen.checkIn.forBaselineAtMs !== baseline.atMs) {
        seen.checkIn = {
          forBaselineAtMs: baseline.atMs,
          impressions: 0,
          openedAtMs: null,
          hiddenAtMs: null,
        }
      }
      if (event === 'open') seen.checkIn.openedAtMs ??= at
      else if (event === 'hide') seen.checkIn.hiddenAtMs ??= at
      else seen.checkIn.impressions++
    }
    held.seen = seen
    await this.write(scope, held, { seen })
    if (row === 'lookBack') return seenLookBack(seen)
    const baseline = usableBaseline(held.marks, this.check(held.marks))
    return baseline !== null && seenFor(seen, baseline)
  }
}

/** Whether "Your years" has been opened, hidden or shown on enough page loads; it belongs to the scope, not to a baseline. */
function seenLookBack(seen: SeenRecord): boolean {
  const part = seen.lookBack
  return (
    part.openedAtMs !== null ||
    part.hiddenAtMs !== null ||
    part.impressions >= SEEN_AFTER_IMPRESSIONS
  )
}

/** Whether the check-in against `baseline` has been opened, hidden or shown on enough page loads. */
function seenFor(seen: SeenRecord, baseline: CheckInSnapshot): boolean {
  const part = seen.checkIn
  return (
    part.forBaselineAtMs === baseline.atMs &&
    (part.openedAtMs !== null ||
      part.hiddenAtMs !== null ||
      part.impressions >= SEEN_AFTER_IMPRESSIONS)
  )
}

/** The part of a stored record that is not in `Marks`, carried over when marks are rewritten. */
function rebuilt(marks: StoredMarks | null): { rebuiltAtMs?: number } {
  return marks?.rebuiltAtMs === undefined ? {} : { rebuiltAtMs: marks.rebuiltAtMs }
}
