import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildLiftState } from '@rca/core/lift'
import type { LiftState } from '@rca/core/lift'
import type { AthleteSettings } from '@rca/core/athlete'
import { liftsExist, openLiftStore } from '../../worker/liftStore'
import type { LiftRow } from '../../worker/liftTransitions'
import { useTabMessages } from '../tabSync'
import type { TabMessage } from '../tabSync'
import type { AccountStatus } from '../useAccount'
import { useLiftScope } from './liftScope'
import { onLiftsCleared } from './liftsCleared'

/** What the summary reads of the account: who is signed in, if anyone. */
export interface LiftSummaryAccount {
  status: AccountStatus
  userId: string | null
}

const ignore = () => undefined

const NONE: LiftState = { revision: 0, lifts: [], weeks: [] }

/**
 * The lift estimates of this browser's scope, for pages that only read them (the Balance hero). Reads the same scope
 * as the lift log and builds core's `buildLiftState`; it never writes, syncs or makes the database. It reads again
 * when another tab wrote or Remove all cleared the store. `ready` is false until the first read answers.
 */
export function useLiftSummary(account: LiftSummaryAccount, settings: AthleteSettings) {
  const scope = useLiftScope(account.status, account.userId)
  const [read, setRead] = useState<{ scope: string; rows: LiftRow[] } | null>(null)
  const scopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
  }, [scope])

  const reload = useCallback(async () => {
    // A store that does not exist is not opened: opening would make it.
    const rows = (await liftsExist()) ? await readRows(scope) : []
    if (scopeRef.current === scope) setRead({ scope, rows })
  }, [scope])

  useEffect(() => {
    void reload().catch(ignore)
  }, [reload])
  useTabMessages(
    useCallback(
      (message: TabMessage) => {
        if (message.type === 'lifts') void reload().catch(ignore)
      },
      [reload],
    ),
  )
  useEffect(() => onLiftsCleared(() => void reload().catch(ignore)), [reload])

  const rows = read !== null && read.scope === scope ? read.rows : null
  const state = useMemo(
    () =>
      rows === null
        ? NONE
        : buildLiftState(
            rows.filter((row) => row.state !== 'delete').map((row) => row.set),
            settings,
          ),
    [rows, settings],
  )
  return { lifts: state.lifts, ready: rows !== null }
}

async function readRows(scope: string): Promise<LiftRow[]> {
  const store = openLiftStore(scope)
  try {
    return await store.list()
  } finally {
    store.close()
  }
}
