import { useCallback } from 'react'
import { uploadTitlesField } from '../uploadTitlesPreference'
import type { AthleteSettings } from '@rca/core/types'
import type { Account, Box } from './model'
import type { WorkerTransport } from './workerTransport'

interface AdoptionDeps {
  transport: WorkerTransport
  accountRef: Box<Account>
  settingsRef: Box<AthleteSettings>
}

/** Adds what this browser kept from before sign-in to the signed-in account, or removes it from this browser. */
export function useAdoptionActions({ transport, accountRef, settingsRef }: AdoptionDeps) {
  const { send } = transport
  const adoptDevice = useCallback(() => {
    const { status, me } = accountRef.current
    if (status !== 'signed-in' || me === null) return
    send({
      type: 'adoptDevice',
      userId: me.user.id,
      settings: settingsRef.current,
      ...uploadTitlesField(me.user.id),
    })
  }, [accountRef, send, settingsRef])
  const forgetDeviceLibrary = useCallback(
    () => send({ type: 'forgetDeviceLibrary', settings: settingsRef.current }),
    [send, settingsRef],
  )
  return { adoptDevice, forgetDeviceLibrary }
}
