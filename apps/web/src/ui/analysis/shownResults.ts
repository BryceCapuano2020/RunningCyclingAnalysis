import { useMemo, useState } from 'react'
import type { ImportFacts, IndexFacts, SessionState } from '@rca/core/session'
import type { LiftResults } from '@rca/core/lift'
import { liftOfSnapshot } from '@rca/core/stateSnapshot'
import type { AccountResults } from './accountResults'
import type { ImportState } from './importState'
import { EMPTY_SESSION } from './model'

/**
 * The server's state with what only the browser knows laid over it: the last import's facts (refused files, unsaved activities) and the
 * worker's index (the library's age and size). For the same digests and no import they are what the state already holds, so the layer
 * changes nothing (held by the equivalence test).
 */
export function layerState(
  state: SessionState,
  facts: ImportFacts | null,
  index: IndexFacts | null,
): SessionState {
  return { ...state, ...facts, ...index }
}

/** What the page shows. */
interface Shown {
  state: SessionState
  /** The account's lift results (L3); null signed out, and before the server has answered. */
  lift: LiftResults | null
  /** The account's results are a copy made on an earlier day. */
  stale: boolean
}

/**
 * What the page shows: for an account, the server's state with what only the browser knows laid over it. The refused files and unsaved
 * activities of the last import come from its `facts`; the library's age and size from the worker's index, which is current the moment a
 * delete or an update ends, where a snapshot may be a moment behind. An expired session keeps the account's results until a state of the
 * device's own arrives (a file dropped after the expiry is analysed here), which is then the one shown.
 */
export function useShownResults(
  results: AccountResults | null,
  signedIn: boolean,
  expired: boolean,
  device: Pick<ImportState, 'state' | 'facts' | 'index'>,
): Shown {
  const keeps = useKeepsAccount(!signedIn && expired, device.state)
  const shows = signedIn || (keeps && results !== null)
  const held = shows ? results : null
  const lift = useMemo(() => (held === null ? null : liftOfSnapshot(held.snapshot)), [held])
  const state = useMemo(
    () => layerState(held?.state ?? EMPTY_SESSION, device.facts, device.index),
    [held, device.facts, device.index],
  )
  return { state: shows ? state : device.state, lift, stale: held?.stale === true }
}

/**
 * Whether an expired session still shows the account's results: until a state of the device's own arrives, which is then the one shown.
 */
function useKeepsAccount(expired: boolean, deviceState: SessionState): boolean {
  const [atExpiry, setAtExpiry] = useState<SessionState | null>(null)
  if (expired && atExpiry === null) setAtExpiry(deviceState)
  else if (!expired && atExpiry !== null) setAtExpiry(null)
  return expired && deviceState === atExpiry
}
