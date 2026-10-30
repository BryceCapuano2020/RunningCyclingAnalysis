import type { Bindings } from '../env.ts'
import { isLocalDevelopment } from '../localDev.ts'
import { toHex } from '../util.ts'

/** The addresses in an ALLOWED_EMAILS value: trimmed, lower-cased, entries without an `@` dropped. */
export function parseAllowedEmails(raw: string | undefined): ReadonlySet<string> {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes('@'))
  return new Set(entries)
}

/**
 * What the sign-in needs to know about who may create an account. It is only asked when no account
 * exists yet; a Google identity or an email that already has one signs in without it.
 */
export interface SignupGate {
  /** True when a new account may be created for this verified email. */
  allows(email: string): boolean
  /**
   * A stable pseudonym for a Google subject, for counts that must outlive an account. Undefined when
   * the signing key is unusable (a misconfiguration the session code already refuses to run under).
   */
  identityKey(sub: string): Promise<string | undefined>
}

const MIN_KEY_BYTES = 32

/** An HMAC of the Google subject under the session signing key, so the stored code is not the subject. */
export async function identityKeyFor(
  signingKey: string | undefined,
  sub: string,
): Promise<string | undefined> {
  const secret = new TextEncoder().encode(signingKey ?? '')
  if (secret.byteLength < MIN_KEY_BYTES) return undefined
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`identity:google:${sub}`),
  )
  return toHex(new Uint8Array(mac))
}

/**
 * The gate for this request. A listed address may sign up anywhere. With no list, sign-up is open
 * only in local development and closed everywhere else, so a deployment missing the secret
 * admits nobody new instead of everybody.
 */
export function signupGate(env: Bindings, requestUrl: string): SignupGate {
  const allowed = parseAllowedEmails(env.ALLOWED_EMAILS)
  const open = allowed.size === 0 && isLocalDevelopment(env, requestUrl)
  return {
    allows: (email) => open || allowed.has(email.toLowerCase()),
    identityKey: (sub) => identityKeyFor(env.SESSION_SIGNING_KEY, sub),
  }
}
