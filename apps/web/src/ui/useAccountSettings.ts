import { useEffect } from 'react'
import { pullAccountSettings, pushAccountSettings } from './accountSettings'
import { onSettingsChosen } from './settingsChosen'
import { choicesSoFar, noteChoice, noteSettled, resetUnsent } from './settingsUnsent'
import type { SettingsField } from './settingsChosen'
import type { AccountStatus } from './useAccount'

/** How long a failed read waits before its one retry. */
export const SETTINGS_RETRY_MS = 2000

/**
 * Keeps the rides kept, the runs counted and the period in the account while signed in. The first time
 * this runs for an account it reads the account's settings into this browser's copy (the account wins) and
 * offers the copy's own choices to an account that has none. After that a choice is saved to the account as
 * the athlete makes it, and the browser's copy is what the analysis reads. Signed out nothing is sent. A read
 * that fails is tried once more; if it fails again, choices stay in this browser and nothing is sent, so a
 * stale copy cannot overwrite the account's. The browser's zone goes along with every signed-in
 * account's settings: the server computes the results of every account and cuts their days in it.
 */
export function useAccountSettings(status: AccountStatus, userId: string | null): void {
  const signedIn = status === 'signed-in' && userId !== null
  useEffect(() => {
    if (!signedIn) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let pulled = false
    const chosen = new Set<SettingsField>()
    // Saves run one at a time, each from the copy as it stands when it starts.
    let queue: Promise<unknown> = Promise.resolve()
    const save = () => {
      const at = choicesSoFar()
      queue = queue.then(
        () =>
          current
            ? pushAccountSettings(userId).then(
                () => noteSettled(at),
                () => undefined,
              )
            : undefined,
        () => undefined,
      )
    }
    const stop = onSettingsChosen((field) => {
      noteChoice()
      if (pulled) save()
      else chosen.add(field)
    })
    const pull = (retry: boolean) => {
      const at = choicesSoFar()
      pullAccountSettings(userId, chosen).then(
        () => {
          pulled = true
          noteSettled(at)
        },
        () => {
          if (current && retry) timer = setTimeout(() => pull(false), SETTINGS_RETRY_MS)
        },
      )
    }
    pull(true)
    return () => {
      current = false
      clearTimeout(timer)
      stop()
      resetUnsent()
    }
  }, [signedIn, userId])
}
