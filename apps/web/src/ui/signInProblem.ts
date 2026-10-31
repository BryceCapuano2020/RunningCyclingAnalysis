import { useEffect, useState } from 'react'
import { hashQuery } from './route'

/**
 * What the app says when a sign-in was refused and the browser was sent back with the reason in the address
 * (`#/?signin=rate_limited`). Only a code the app knows is worded; any other is the general line, so the
 * address can never put its own text on the page.
 */
const REASONS: Record<string, string> = {
  rate_limited:
    'Too many sign-in attempts from this network just now. Wait a minute and try again.',
  oauth_denied: 'Google sign-in was cancelled. You can try again when you are ready.',
  oauth_state_mismatch:
    'That sign-in could not be matched to this browser, or it expired. Start it again.',
  read_only:
    'Signing in is switched off for a while while the service is looked after. You can use the app without an account: your analysis stays on this device.',
  service_unavailable: 'Sign-in is unavailable right now. Try again shortly.',
  not_on_list:
    'Creating an account is by invitation while the app is in testing, and the Google account you used is not on the list, so nothing was created. If you were invited, ask the person who invited you to add the address of this Google account, then try again. You can also use the app without an account: your analysis stays on this device.',
  signup_limit:
    'This Google account has created several accounts today, and deleted them again. Try again after midnight UTC.',
  account_deleting:
    'Deleting the account has not finished yet. Try signing in again in a few minutes.',
  account_conflict:
    'The email address is already linked to a different Google account. Sign in with that account instead.',
}

export const SIGN_IN_FAILED = 'Sign-in could not be completed. Try again.'

/** The line for a refusal code from the address, or null when the address carries none. */
export function signInProblemText(hash: string): string | null {
  const code = hashQuery(hash).get('signin')
  if (code === null) return null
  return Object.hasOwn(REASONS, code) ? (REASONS[code] as string) : SIGN_IN_FAILED
}

/**
 * The reason a sign-in was refused, read once from the address on arrival and then taken out of it, so a
 * reload does not repeat it. It goes when the visitor moves to another page.
 */
export function useSignInProblem(): string | null {
  const [text, setText] = useState(() => signInProblemText(window.location.hash))
  useEffect(() => {
    if (text !== null && hashQuery(window.location.hash).has('signin')) {
      window.history.replaceState(null, '', '#/')
    }
    const leave = () => setText(null)
    window.addEventListener('hashchange', leave)
    return () => window.removeEventListener('hashchange', leave)
  }, [text])
  return text
}
