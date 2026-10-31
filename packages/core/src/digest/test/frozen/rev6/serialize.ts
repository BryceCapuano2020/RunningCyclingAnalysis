import type { ActivityDigest } from './types'
import { readDigest } from './readDigest'

/** Frozen copy of parseDigest as revision 6 shipped it: the device library's reader. */
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
