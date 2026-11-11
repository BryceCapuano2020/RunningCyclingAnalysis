import { useEffect, useState } from 'react'
import { pullAccountSettings, pushAccountSettings } from './accountSettings'
import { onSettingsChosen } from './settingsChosen'
import { tellOtherTabs } from './tabSync'
import type { SettingsField } from './settingsChosen'
import type { AccountStatus } from './useAccount'

/** How long a failed read or save waits before its first retry; each failure in a row doubles it, up to `SETTINGS_RETRY_MAX_MS`. */
export const SETTINGS_RETRY_MS = 2000
export const SETTINGS_RETRY_MAX_MS = 60_000

/** What the page says while a choice is not in the account. */
export const CHOICE_NOT_SAVED =
  'Your last choice is not saved to your account yet. It saves when the connection returns.'

/** The wait before the retry that follows `failures` failures in a row. */
export const retryWaitMs = (failures: number): number =>
  Math.min(SETTINGS_RETRY_MS * 2 ** Math.max(0, failures - 1), SETTINGS_RETRY_MAX_MS)

/**
 * Keeps the rides kept, the runs counted and the period in the account while signed in. The first time
 * this runs for an account it reads the account's settings into this browser's copy (the account wins) and
 * offers the copy's own choices to an account that has none. After that a choice is saved to the account as
 * the athlete makes it, and the browser's copy is what the analysis reads. Signed out nothing is sent. A read
 * or a save that fails is tried again, after waits that double, for as long as the page is open; until a read
 * has answered nothing is sent, so a stale copy cannot overwrite the account's. `notSaved` is true while a
 * choice the athlete made is not in the account yet, so the page can say so. The browser's zone goes along
 * with every signed-in account's settings: the server computes the results of every account and cuts their
 * days in it.
 */
export function useAccountSettings(
  status: AccountStatus,
  userId: string | null,
): { notSaved: boolean; notice: string } {
  const signedIn = status === 'signed-in' && userId !== null
  const [notSaved, setNotSaved] = useState(false)
  useEffect(() => {
    if (!signedIn) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let pulled = false
    let failures = 0
    const chosen = new Set<SettingsField>()
    // Saves run one at a time, each from the copy as it stands when it starts.
    let queue: Promise<unknown> = Promise.resolve()
    const retry = (again: () => void) => {
      failures++
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (current) again()
      }, retryWaitMs(failures))
    }
    const save = () => {
      queue = queue.then(
        () =>
          current
            ? pushAccountSettings(userId).then(
                () => {
                  failures = 0
                  setNotSaved(false)
                  // The server's results changed with it: this tab and the others ask for them again.
                  tellOtherTabs({ type: 'settings' })
                },
                () => {
                  setNotSaved(true)
                  retry(save)
                },
              )
            : undefined,
        () => undefined,
      )
    }
    const stop = onSettingsChosen((field) => {
      if (pulled) save()
      else {
        chosen.add(field)
        setNotSaved(true)
      }
    })
    const pull = () => {
      pullAccountSettings(userId, chosen).then(
        (wrote) => {
          pulled = true
          failures = 0
          setNotSaved(false)
          if (wrote) tellOtherTabs({ type: 'settings' })
        },
        () => {
          if (current) retry(pull)
        },
      )
    }
    pull()
    return () => {
      current = false
      clearTimeout(timer)
      stop()
    }
  }, [signedIn, userId])
  const unsaved = notSaved && signedIn
  return { notSaved: unsaved, notice: unsaved ? CHOICE_NOT_SAVED : '' }
}
