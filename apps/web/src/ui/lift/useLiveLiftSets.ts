import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LiftSet } from '@rca/core/lift'
import { createLiftTransport } from '../../api/lifts'
import { liftsExist, openLiftStore } from '../../worker/liftStore'
import { createLiftSync } from '../../worker/liftSync'
import type { LiftTransport } from '../../worker/liftTransport'
import type { LiftRow } from '../../worker/liftTransitions'
import { useTabMessages } from '../tabSync'
import type { TabMessage } from '../tabSync'
import type { AccountStatus } from '../useAccount'
import { useLiftScope } from './liftScope'
import { onLiftsCleared } from './liftsCleared'

/** What the lift reads need of the account: who is signed in, if anyone. */
export interface LiftSummaryAccount {
  status: AccountStatus
  userId: string | null
}

const ignore = () => undefined

/**
 * The live lift sets of this browser's scope (deleted rows left out), for pages that show them. Reads the same scope as the
 * lift log. Signed in, it syncs once when it opens, as the Lift page does, so a browser that has not opened Lift yet still
 * has the account's sets; signed out it never writes or makes the database. It reads again when another tab wrote or Remove
 * all cleared the store. `sets` is null until the first read answers.
 */
export function useLiveLiftSets(
  account: LiftSummaryAccount,
  transportFor: (userId: string) => LiftTransport = createLiftTransport,
): readonly LiftSet[] | null {
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
  // Signed in: one sync on opening (a flush, then a pull while this engine has pulled nothing), then a read of what it wrote.
  const { status, userId } = account
  // The first transport factory is kept, so a caller that passes a new function each render does not sync again.
  const [transport] = useState(() => transportFor)
  useEffect(() => {
    if (status !== 'signed-in' || userId === null) return
    let live = true
    const store = openLiftStore(userId)
    createLiftSync({ store, transport: transport(userId) })
      .sync()
      .then(() => (live ? reload() : undefined))
      .catch(ignore)
      .finally(() => store.close())
    return () => {
      live = false
    }
  }, [status, userId, transport, reload])
  useTabMessages(
    useCallback(
      (message: TabMessage) => {
        if (message.type === 'lifts') void reload().catch(ignore)
      },
      [reload],
    ),
  )
  useEffect(() => onLiftsCleared(() => void reload().catch(ignore)), [reload])

  return useMemo(
    () =>
      read !== null && read.scope === scope
        ? read.rows.filter((row) => row.state !== 'delete').map((row) => row.set)
        : null,
    [read, scope],
  )
}

async function readRows(scope: string): Promise<LiftRow[]> {
  const store = openLiftStore(scope)
  try {
    return await store.list()
  } finally {
    store.close()
  }
}
