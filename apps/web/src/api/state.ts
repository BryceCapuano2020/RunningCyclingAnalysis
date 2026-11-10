import { snapshotContentHash } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { ApiRequestError, readJson, request } from './client'

/** A snapshot is about 1.8 MB at 2,000 activities (docs/design/server-compute.md, section 2). */
const BODY_LIMIT = 16 * 1024 * 1024

const NUMBER_FIELDS = ['schemaVersion', 'modelRevision', 'libraryVersion', 'nowMs'] as const
const TEXT_FIELDS = ['zone', 'buildSha'] as const

/** The wire shape, checked before anything reads the state inside it. */
const SnapshotWire = {
  parse(value: unknown): StateSnapshot {
    const found = value as Record<string, unknown> | null
    if (
      found === null ||
      typeof found !== 'object' ||
      NUMBER_FIELDS.some((key) => typeof found[key] !== 'number') ||
      TEXT_FIELDS.some((key) => typeof found[key] !== 'string') ||
      typeof found['state'] !== 'object' ||
      found['state'] === null
    ) {
      throw new TypeError('not a snapshot')
    }
    return found as unknown as StateSnapshot
  },
}

/**
 * The server's snapshot of the signed-in account's results, or null when the server has none to give this account:
 * `GET /api/state` answers 404 when server results are off for it (and for any account with no snapshot yet), and 304
 * when the copy the device holds (`held`) is still the latest. The response is `no-store`, so the browser sends no
 * conditional header of its own: the tag is computed here from `held`. Any other failure throws; the caller treats it
 * as null. A snapshot of another shape comes back as it is for the caller to refuse.
 */
export async function getServerSnapshot(
  userId: string,
  held: StateSnapshot | null = null,
): Promise<StateSnapshot | null> {
  const headers: Record<string, string> = {}
  if (held !== null) headers['If-None-Match'] = `"${await snapshotContentHash(held)}"`
  let response: Response
  try {
    response = await request('GET', '/api/state', undefined, userId, undefined, { headers })
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 304)) {
      return null
    }
    throw error
  }
  return readJson(response, SnapshotWire, BODY_LIMIT)
}
