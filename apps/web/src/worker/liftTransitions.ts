import { exerciseKeyOf, LIFT_SET_ORDER } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'

/** Where a set stands against the account: confirmed, waiting to be sent, or waiting to be deleted. */
export type LiftRowState = 'synced' | 'put' | 'delete'

/**
 * One set in this browser (database `rca-lifts`), keyed `<scope>|<set key>`. The scope is `device` when signed out and
 * the user id when signed in. See docs/design/lift-data.md section 3.
 */
export interface LiftRow {
  id: string
  scope: string
  key: string
  /** The set as last logged here; for a `delete` row, the set that is going. */
  set: LiftSet
  state: LiftRowState
  /** Raised on each local change, so an answer applies only to the send it answers. */
  rev: number
  /** The last values the server confirmed, if any. */
  saved?: LiftSet
  /** The account revision of that confirmation (or of the pull that brought the row). */
  ackRevision?: number
  /** Failed sends since the row last changed or was confirmed. */
  attempts: number
}

/** What a transition makes of a row: a new row, null to remove it, undefined to leave it as it is. */
export type RowChange = LiftRow | null | undefined

export const DEVICE_SCOPE = 'device'

export const rowId = (scope: string, key: string) => `${scope}|${key}`

/** Local save: the row waits to be sent, with its confirmed values kept for a revert. */
export function saveSet(
  row: LiftRow | undefined,
  base: Pick<LiftRow, 'id' | 'scope' | 'key'>,
  set: LiftSet,
): LiftRow {
  const { saved, ackRevision } = row ?? {}
  return {
    ...base,
    set,
    state: 'put',
    rev: (row?.rev ?? 0) + 1,
    attempts: 0,
    ...(saved === undefined ? {} : { saved }),
    ...(ackRevision === undefined ? {} : { ackRevision }),
  }
}

/** Local delete: a set the account has waits to be removed there; one only this browser has is removed there too (a resend settles). */
export function deleteSet(row: LiftRow | undefined): RowChange {
  if (row === undefined || row.state === 'delete') return undefined
  return { ...row, state: 'delete', rev: row.rev + 1, attempts: 0 }
}

/** The server took the send of `rev`. A newer local change keeps the row as it is. */
export function ackRow(row: LiftRow | undefined, rev: number, liftRevision: number): RowChange {
  if (row === undefined || row.state === 'synced' || row.rev !== rev) return undefined
  if (row.state === 'delete') return null
  return { ...row, state: 'synced', saved: row.set, ackRevision: liftRevision, attempts: 0 }
}

/** The server refused the send of `rev` (400 naming the row): back to the confirmed values, or gone without any. */
export function refuseRow(row: LiftRow | undefined, rev: number): RowChange {
  if (row === undefined || row.state === 'synced' || row.rev !== rev) return undefined
  if (row.saved === undefined) return null
  return { ...row, state: 'synced', set: row.saved, attempts: 0 }
}

/** A send of `rev` failed: the row is held and its attempts count up. */
export function holdRow(row: LiftRow | undefined, rev: number): RowChange {
  if (row === undefined || row.state === 'synced' || row.rev !== rev) return undefined
  return { ...row, attempts: row.attempts + 1 }
}

/** A pull has the set: a row not waiting to be sent takes the server's values. */
export function pulledRow(
  row: LiftRow | undefined,
  base: Pick<LiftRow, 'id' | 'scope' | 'key'>,
  set: LiftSet,
  liftRevision: number,
): RowChange {
  if (row !== undefined && row.state !== 'synced') return undefined
  return {
    ...base,
    set,
    state: 'synced',
    rev: row?.rev ?? 0,
    saved: set,
    ackRevision: liftRevision,
    attempts: 0,
  }
}

/** A complete pull lacks the set: a synced row goes, unless it was confirmed at a newer revision than the pull. */
export function lackedRow(row: LiftRow, liftRevision: number): RowChange {
  if (row.state !== 'synced') return undefined
  return (row.ackRevision ?? 0) > liftRevision ? undefined : null
}

/** The set order a new set takes: one past the highest stored for its date and lift, delete rows counted. Null when no room is left. */
export function nextSetOrder(
  rows: readonly LiftRow[],
  set: Pick<LiftSet, 'date' | 'exercise' | 'equipment'>,
): number | null {
  const key = exerciseKeyOf(set)
  let last = 0
  for (const row of rows)
    if (row.set.date === set.date && exerciseKeyOf(row.set) === key)
      last = Math.max(last, row.set.setOrder)
  return last + 1 > LIFT_SET_ORDER.max ? null : last + 1
}
