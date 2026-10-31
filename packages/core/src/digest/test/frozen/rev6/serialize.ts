import type { ActivityDigest } from './types'
import { readDigest } from './readDigest'

/** Frozen copy of parseDigest as revision 6 shipped it: the device library's reader. */
export function parseDigest(json: string): ActivityDigest {
  return readDigest(JSON.parse(json) as unknown, 'device')
}
