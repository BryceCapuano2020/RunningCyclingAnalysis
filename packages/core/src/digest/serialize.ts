import type { ActivityDigest } from '../types'
import { readDigest } from './readDigest'

/** Writes a digest as JSON. Non-finite numbers become null and are restored by parseDigest. */
export function serializeDigest(digest: ActivityDigest): string {
  return JSON.stringify(digest, (_key, value: unknown) =>
    typeof value === 'number' && !Number.isFinite(value) ? null : value,
  )
}

/**
 * Reads a digest written by serializeDigest, as the device library keeps it: under the rules of the
 * device view (see DigestRules). Throws an Error naming the offending field when the JSON is not a
 * version 1 digest.
 */
export function parseDigest(json: string): ActivityDigest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`parseDigest: not JSON (${reason})`, { cause: error })
  }
  return readDigest(parsed, 'device')
}
