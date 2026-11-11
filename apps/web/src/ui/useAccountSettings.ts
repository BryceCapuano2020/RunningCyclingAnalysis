import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError } from '../api/apiError'
import { pullAccountSettings } from './accountSettings'
import { onSettingsChosen } from './settingsChosen'
import { addUnsent, clearUnsent, unsentFields } from './settingsUnsent'
import { tellOtherTabs, useTabMessages } from './tabSync'
import type { SettingsField } from './settingsChosen'
import type { AccountStatus } from './useAccount'

/** How long a failed read or save waits before its first retry; each failure in a row doubles it, up to `SETTINGS_RETRY_MAX_MS`. */
export const SETTINGS_RETRY_MS = 2000
export const SETTINGS_RETRY_MAX_MS = 60_000

/** What the page says while a choice is not in the account. */
export const CHOICE_NOT_SAVED =
  'Your last choice is not saved to your account yet. It saves when the connection returns.'
/** What it says when the session has ended: the choice saves once the athlete signs in again. */
export const CHOICE_SIGNED_OUT =
  'Your last choice is not saved to your account. Sign in again to save it.'
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

/** The session ended: a 401 or a 403. */
const sessionEnded = (error: unknown): boolean =>
  error instanceof ApiRequestError && (error.status === 401 || error.status === 403)

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
  const [why, setWhy] = useState<'refused' | 'session' | null>(null)
  const signedIn = status === 'signed-in' && userId !== null
  const [notSaved, setNotSaved] = useState(false)
  // Another tab saved settings: the copy it sent is the one in this browser, so what this tab still held back is in the account too.
  const savedElsewhere = useRef<(() => void) | null>(null)
  useTabMessages(
    useCallback((message) => {
      if (message.type === 'settings') savedElsewhere.current?.()
    }, []),
  )
  useEffect(() => {
    if (!signedIn) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let pulled = false
    let failures = 0
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
      queue = queue.then(() =>
        current
          ? // Every save reads the account first and sends what this browser chose and the account does not hold yet, from
            // every tab (the set is in localStorage), so a device open for days does not put its old copy over another
            // device's newer choice and one tab's save does not put back another's. A choice made meanwhile stays unsent.
            ((fields: ReadonlySet<SettingsField>) =>
              pullAccountSettings(userId, fields).then(
                () => {
                  failures = 0
                  clearUnsent(userId, fields)
                  setNotSaved(unsentFields(userId).size > 0)
                  setWhy(null)
                  // The server's results changed with it: this tab and the others ask for them again.
                  tellOtherTabs({ type: 'settings' })
                },
                (error: unknown) => {
                  setNotSaved(true)
                  if (refused(error)) setWhy('refused')
                  else if (sessionEnded(error)) setWhy('session')
                  else if (worthRetrying(error)) retry(save)
                },
              ))(unsentFields(userId))
          : undefined,
      )
    }
    const stop = onSettingsChosen((field) => {
      addUnsent(userId, field)
      setWhy(null)
      if (pulled) save()
      else setNotSaved(true)
    })
    const pull = () => {
      const fields = unsentFields(userId)
      pullAccountSettings(userId, fields).then(
        (wrote) => {
          pulled = true
          clearUnsent(userId, fields)
          failures = 0
          setNotSaved(unsentFields(userId).size > 0)
          if (wrote) tellOtherTabs({ type: 'settings' })
        },
        (error: unknown) => {
          if (current && worthRetrying(error)) retry(pull)
        },
      )
    }
    savedElsewhere.current = () => {
      if (!pulled) return
      // The other tab cleared the fields it sent; any left are still this browser's to save.
      const left = unsentFields(userId).size
      setNotSaved(left > 0)
      if (left === 0) {
        failures = 0
        clearTimeout(timer)
        setWhy(null)
      }
    }
    pull()
    return () => {
      savedElsewhere.current = null
      current = false
      clearTimeout(timer)
      stop()
    }
  }, [signedIn, userId])
  const unsaved = notSaved && signedIn
  const notice = !unsaved
    ? ''
    : why === 'refused'
      ? CHOICE_REFUSED
      : why === 'session'
        ? CHOICE_SIGNED_OUT
        : CHOICE_NOT_SAVED
  return { notSaved: unsaved, notice }
}
