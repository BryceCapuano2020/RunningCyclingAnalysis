import type { Dispatch, SetStateAction } from 'react'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import type { WorkerRequest, WorkerResponse } from '../../worker/protocol'
import type { AccountController } from '../useAccount'

/** 'loaded' is the only state in which an import may be sent to the signed-in library. */
export type LibraryStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export type Account = Pick<AccountController, 'status' | 'me'> &
  Partial<
    Pick<AccountController, 'flushProfileWrites' | 'markExpired' | 'refresh' | 'sessionExpired'>
  >

/** A ref shared by the pieces of useAnalysis. The hook that creates it sets the first value. */
export interface Box<T> {
  current: T
}

export type Setter<T> = Dispatch<SetStateAction<T>>

export type SetError = (message: string | null, issue?: SyncIssueCode | null) => void

/** The files an import has read, and how many it holds in all when that is known before reading. */
export interface ImportProgress {
  filesRead: number
  /** Null when the total is not known, such as for a zip that holds another zip. */
  filesTotal: number | null
}

export interface ErrorNotice {
  message: string
  issue: SyncIssueCode | null
}

/** A deletion from the account library or from the library kept in this browser. */
export function isDeletion(kind: WorkerRequest['type']): boolean {
  return kind === 'deleteActivity' || kind === 'deleteDeviceActivity'
}

/** A request the worker has not answered yet. `notice` is the confirmation shown on success. */
export interface Pending {
  kind: WorkerRequest['type']
  notice?: string
  /** Receives the worker's answer, or null when the worker is dropped before answering. */
  settle?: (message: WorkerResponse | null) => void
}

export const EMPTY_SESSION: SessionState = {
  result: null,
  rejected: [],
  unsupportedFiles: 0,
  isSample: false,
  totalActivities: 0,
  rangeDays: null,
  syncIssues: [],
  outdatedActivities: 0,
  incompatibleActivities: 0,
  hiddenDuplicates: 0,
  trend: [],
}
