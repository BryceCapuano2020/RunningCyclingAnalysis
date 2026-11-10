import { useState } from 'react'
import { DEVICE_SCOPE } from '../../worker/liftTransitions'
import type { AccountStatus } from '../useAccount'
import { lastLiftAccount } from './lastAccount'

/**
 * The scope this browser's lift sets are read from: the account when signed in; while the account is not known yet,
 * the last one signed in here; the device when signed out.
 */
export function useLiftScope(status: AccountStatus, userId: string | null): string {
  // Read again whenever the status changes, so a lookup that lapses after a sign-in finds the account kept then.
  const [remembered, setRemembered] = useState({ status, id: lastLiftAccount() })
  if (remembered.status !== status) setRemembered({ status, id: lastLiftAccount() })
  if (status === 'signed-in' && userId !== null) return userId
  return status === 'signed-out' ? DEVICE_SCOPE : (remembered.id ?? DEVICE_SCOPE)
}
