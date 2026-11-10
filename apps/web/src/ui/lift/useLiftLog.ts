import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Me } from '@rca/contract'
import { exerciseKeyOf, liftSetKey } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { createLiftTransport } from '../../api/lifts'
import { openLiftStore } from '../../worker/liftStore'
import { createLiftSync } from '../../worker/liftSync'
import type { LiftSync } from '../../worker/liftSync'
import type { LiftTransport } from '../../worker/liftTransport'
import { DEVICE_SCOPE } from '../../worker/liftTransitions'
import type { LiftRow } from '../../worker/liftTransitions'
import { tellOtherTabs, useTabMessages } from '../tabSync'
import type { TabMessage } from '../tabSync'
import type { AccountStatus } from '../useAccount'
import { groupDays, recentLifts } from './liftDays'
import { lastLiftAccount } from './lastAccount'
import { onLiftsCleared } from './liftsCleared'

/** The least time between two reads of the account that a tab coming into view makes. */
const RE_ASK_FLOOR_MS = 30_000

/** The parts of the account controller the log reads. */
export interface LiftLogAccount {
  status: AccountStatus
  /** Who is signed in, once confirmed. */
  userId: string | null
  /** `/api/me`'s `liftRevision`: a change means another device wrote. */
  liftRevision?: number
  /** Reads `/api/me` again. Rejects when the server cannot be reached. */
  refresh: () => Promise<Me | null>
  /** Ends the session after a send was refused as signed out. */
  markExpired: () => void
}

export interface LiftLogOptions {
  /** The server client; the real one unless a test brings its own. */
  transportFor?: (userId: string) => LiftTransport
}

/** A set to log: the set order is assigned by `save`. */
export type NewLiftSet = Omit<LiftSet, 'setOrder'>

/** What the sends have said, for the page's status rows. */
export interface LiftSendStatus {
  /** Sets the server refused since the log opened. */
  refused: number
  /** Sets are waiting for room under the account's cap. */
  full: boolean
}

/**
 * The lift log of this browser's scope: the account when signed in; while the account is not known yet, the last one
 * signed in here; the device when signed out. Writes go to the store at once. Once the account is confirmed they are
 * sent after each write, on coming online, after a failed send's wait, when the tab comes into view and when the
 * account's revision moves. See docs/design/lift-logger.md.
 */
export function useLiftLog(account: LiftLogAccount, options: LiftLogOptions = {}) {
  const { status, userId, liftRevision } = account
  const [transportFor] = useState(() => options.transportFor ?? createLiftTransport)
  const latest = useRef(account)
  useEffect(() => {
    latest.current = account
  })
  const confirmed = status === 'signed-in' && userId !== null
  // Read again whenever the status changes, so a lookup that lapses after a sign-in finds the account kept then.
  const [remembered, setRemembered] = useState({ status, id: lastLiftAccount() })
  if (remembered.status !== status) setRemembered({ status, id: lastLiftAccount() })
  const scope = confirmed
    ? userId
    : status === 'signed-out'
      ? DEVICE_SCOPE
      : (remembered.id ?? DEVICE_SCOPE)
  const store = useMemo(() => openLiftStore(scope), [scope])
  useEffect(() => () => store.close(), [store])
  const engine = useMemo(
    () => (confirmed ? createLiftSync({ store, transport: transportFor(userId) }) : null),
    [store, confirmed, userId, transportFor],
  )
  const [read, setRead] = useState<{ scope: string; rows: LiftRow[] } | null>(null)
  const [sent, setSent] = useState<LiftSendStatus & { scope: string }>({
    scope,
    refused: 0,
    full: false,
  })

  // What an answer that comes late must not write: the scope it was asked for is no longer the one on screen.
  const scopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
  }, [scope])
  const alive = useRef<LiftSync | null>(null)
  useEffect(() => {
    alive.current = engine
    return () => {
      if (alive.current === engine) alive.current = null
    }
  }, [engine])

  const reload = useCallback(async () => {
    const rows = await store.list()
    if (scopeRef.current === scope) setRead({ scope, rows })
  }, [store, scope])

  // Writes wait for one another, so two quick saves never take the same set order.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const askedAt = useRef(-Infinity)

  const syncNow = useCallback(
    async (seen?: number) => {
      if (engine === null) return
      clearTimeout(retry.current)
      try {
        const { flush } = await engine.sync(seen ?? latest.current.liftRevision)
        // The scope changed, or the hook closed, while it ran: the answer belongs to no one.
        if (alive.current !== engine) return
        if (flush.unauthorized) latest.current.markExpired()
        setSent((was) => ({
          scope,
          refused: (was.scope === scope ? was.refused : 0) + flush.refused,
          full: flush.capped > 0,
        }))
        clearTimeout(retry.current)
        if (flush.retryInMs !== null)
          retry.current = setTimeout(() => {
            if (alive.current === engine) void syncNow().catch(() => undefined)
          }, flush.retryInMs)
      } finally {
        await reload()
      }
    },
    [engine, reload, scope],
  )
  const trySync = useCallback(
    () => void syncNow(liftRevision).catch(() => undefined),
    [syncNow, liftRevision],
  )

  useEffect(() => {
    let live = true
    store.list().then(
      (rows) => live && setRead({ scope, rows }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [store, scope])

  // On opening, and when the account's revision moves (the engine pulls only if it differs from the last pull).
  useEffect(() => {
    trySync()
    return () => clearTimeout(retry.current)
  }, [trySync])

  // Another tab wrote to the store.
  useTabMessages(
    useCallback(
      (message: TabMessage) => {
        if (message.type === 'lifts') void reload().catch(() => undefined)
      },
      [reload],
    ),
  )

  // Remove all in this tab cleared the store from the worker.
  useEffect(() => onLiftsCleared(() => void reload().catch(() => undefined)), [reload])

  useEffect(() => {
    if (engine === null) return
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      // The revision of another device's write comes with the account, which a lifter with no activity library
      // never reads otherwise.
      let seen: number | undefined
      if (Date.now() - askedAt.current >= RE_ASK_FLOOR_MS) {
        askedAt.current = Date.now()
        seen = (await latest.current.refresh().catch(() => null))?.liftRevision
      }
      await syncNow(seen).catch(() => undefined)
    }
    const onVisibleEvent = () => void onVisible()
    window.addEventListener('online', trySync)
    document.addEventListener('visibilitychange', onVisibleEvent)
    return () => {
      window.removeEventListener('online', trySync)
      document.removeEventListener('visibilitychange', onVisibleEvent)
    }
  }, [engine, syncNow, trySync])

  const write = useCallback(
    <R>(work: () => Promise<R>): Promise<R> => {
      const run = queue.current.then(work, work)
      queue.current = run.catch(() => undefined)
      return run.then(async (result) => {
        await reload()
        tellOtherTabs({ type: 'lifts' })
        trySync()
        return result
      })
    },
    [reload, trySync],
  )

  /** Logs a set at the next set order of its date and lift. Resolves the set as kept, or null when the lift has no room or storage refused. */
  const save = useCallback(
    (draft: NewLiftSet): Promise<LiftSet | null> => write(() => store.saveNext(draft)),
    [store, write],
  )
  /**
   * Replaces `previous` with `next`. A change of day, lift or equipment changes the key, so the old set is removed and
   * the new one takes the next set order there. Resolves the set as kept, or null.
   */
  const update = useCallback(
    (previous: LiftSet, next: NewLiftSet): Promise<LiftSet | null> =>
      write(async () => {
        const sameLift =
          next.date === previous.date && exerciseKeyOf(next) === exerciseKeyOf(previous)
        if (sameLift) {
          const set: LiftSet = { ...next, setOrder: previous.setOrder }
          return (await store.save(set)) ? set : null
        }
        const set = await store.saveNext(next)
        if (set !== null) await store.remove(liftSetKey(previous))
        return set
      }),
    [store, write],
  )
  /** Deletes a set by its key (`LoggedSet.key`). */
  const remove = useCallback(
    (key: string): Promise<void> => write(() => store.remove(key)),
    [store, write],
  )

  const rows = read !== null && read.scope === scope ? read.rows : null
  const days = useMemo(() => groupDays(rows ?? []), [rows])
  const recent = useMemo(() => recentLifts(rows ?? []), [rows])
  // A signed-out log has no server to wait for.
  const pendingCount =
    scope === DEVICE_SCOPE ? 0 : (rows ?? []).filter((row) => row.state !== 'synced').length

  return {
    days,
    save,
    update,
    remove,
    pendingCount,
    recentLifts: recent,
    ready: rows !== null,
    refused: sent.scope === scope ? sent.refused : 0,
    full: sent.scope === scope && sent.full,
  }
}
