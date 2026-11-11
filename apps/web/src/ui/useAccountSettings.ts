import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../api/apiError'
import { pullAccountSettings, pushAccountSettings } from './accountSettings'
import { onSettingsChosen } from './settingsChosen'
import { tellOtherTabs, useTabMessages } from './tabSync'
import type { SettingsField } from './settingsChosen'
import type { AccountStatus } from './useAccount'

/** How long a failed read or save waits before its first retry; each failure in a row doubles it, up to `SETTINGS_RETRY_MAX_MS`. */
export const SETTINGS_RETRY_MS = 2000
export const SETTINGS_RETRY_MAX_MS = 60_000

/** What the page says while a choice is not in the account. */
export const CHOICE_NOT_SAVED =
  'Your last choice is not saved to your account yet. It saves when the connection returns.'
/** What it says when the account refused the choice, which trying again does not change. */
export const CHOICE_REFUSED =
  'Your account did not accept your last choice. It stays on this device.'

/**
 * Whether a failure is worth trying again: no connection, a timeout, too many requests or a server error. Anything else is an answer
 * (the account refused it, or the session ended), and sending the same thing again changes nothing.
 */
function worthRetrying(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return true
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
}

/** A refusal of the settings themselves: a 400 or a 413. */
const refused = (error: unknown): boolean =>
  error instanceof ApiRequestError && (error.status === 400 || error.status === 413)

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
  const [refusedChoice, setRefused] = useState(false)
  const signedIn = status === 'signed-in' && userId !== null
  const [notSaved, setNotSaved] = useState(false)
  // Another tab saved settings: the copy it sent is the one in this browser, so what this tab still held back is in the account too.
  const savedElsewhere = useRef<() => void>(() => undefined)
  useTabMessages(
    useCallback((message) => {
      if (message.type === 'settings') savedElsewhere.current()
    }, []),
  )
  useEffect(() => {
    if (!signedIn) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let pulled = false
    let failures = 0
    const chosen = new Set<SettingsField>()
    // The fields this device chose since the account last held them: a retry reads the account again and sends only these over it.
    const pending = new Set<SettingsField>()
    // Saves run one at a time, each from the copy as it stands when it starts.
    let queue: Promise<unknown> = Promise.resolve()
    const retry = (again: () => void) => {
      failures++
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (current) again()
      }, retryWaitMs(failures))
    }
    const save = (retrying = false) => {
      queue = queue.then(
        () =>
          current
            ? (retrying ? pullAccountSettings(userId, pending) : pushAccountSettings(userId)).then(
                () => {
                  failures = 0
                  pending.clear()
                  setNotSaved(false)
                  setRefused(false)
                  // The server's results changed with it: this tab and the others ask for them again.
                  tellOtherTabs({ type: 'settings' })
                },
                (error: unknown) => {
                  setNotSaved(true)
                  if (refused(error)) setRefused(true)
                  else if (worthRetrying(error)) retry(() => save(true))
                },
              )
            : undefined,
        () => undefined,
      )
    }
    const stop = onSettingsChosen((field) => {
      pending.add(field)
      setRefused(false)
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
          pending.clear()
          failures = 0
          setNotSaved(false)
          if (wrote) tellOtherTabs({ type: 'settings' })
        },
        (error: unknown) => {
          if (current && worthRetrying(error)) retry(pull)
        },
      )
    }
    savedElsewhere.current = () => {
      if (!pulled) return
      failures = 0
      clearTimeout(timer)
      pending.clear()
      setNotSaved(false)
      setRefused(false)
    }
    pull()
    return () => {
      savedElsewhere.current = () => undefined
      current = false
      clearTimeout(timer)
      stop()
    }
  }, [signedIn, userId])
  const unsaved = notSaved && signedIn
  const notice = !unsaved ? '' : refusedChoice ? CHOICE_REFUSED : CHOICE_NOT_SAVED
  return { notSaved: unsaved, notice }
}
