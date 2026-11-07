import type { LiftSet } from '@rca/core/lift'

/** Why a request failed: 400 (the indexes it names), 401, 409 (the account's cap) or anything else. */
export type LiftFailure = 'invalid' | 'unauthorized' | 'cap' | 'other'

export class LiftTransportError extends Error {
  readonly kind: LiftFailure
  /** For `invalid`: the API's `refused` array, the sorted unique positions in the request's list the 400 names. Empty or missing names none, which holds every row of the request. */
  readonly refused: readonly number[]
  constructor(kind: LiftFailure, refused: readonly number[] = []) {
    super(`Lift request failed: ${kind}`)
    this.kind = kind
    this.refused = refused
  }
}

export interface LiftPutAnswer {
  liftRevision: number
  /** With `insertOnly`: the keys the account already held, which stayed. */
  skipped?: readonly string[]
}

export interface LiftPageAnswer {
  items: readonly LiftSet[]
  /** The cursor of the next page; null at the end. */
  next: string | null
  liftRevision: number
}

/**
 * What the sync engine needs of the server. Each method resolves on 2xx and throws a LiftTransportError otherwise
 * (any other thrown error counts as `other`). The real client is written apart from the engine.
 */
export interface LiftTransport {
  put(sets: readonly LiftSet[], options?: { insertOnly?: true }): Promise<LiftPutAnswer>
  remove(keys: readonly string[]): Promise<{ liftRevision: number }>
  /** `cursor` is null for the first page. */
  page(cursor: string | null): Promise<LiftPageAnswer>
}
