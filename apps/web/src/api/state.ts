import { StateSnapshotSchema } from '@rca/contract'
import { STATE_SNAPSHOT_VERSION, snapshotContentHash } from '@rca/core/stateSnapshot'
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
    // A snapshot of this build's shape is read whole, so its check-in and lift results are checked against the contract before
    // anything reads them. One of another shape is left for the caller to refuse, as it is not read.
    if (found['schemaVersion'] === STATE_SNAPSHOT_VERSION) StateSnapshotSchema.parse(found)
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

/**
 * What `GET /api/state` said. `unchanged` is a 304: the copy held is the latest. `nowMs` is the instant the stored snapshot
 * was computed for (`X-State-Now`, sent with a 304 too), null when the server names none. `current` is false when the server
 * served the stored snapshot because it was busy computing (`X-State-Current: 0`): ask again in a few seconds.
 * `computing` is a 202, with no snapshot yet; `none` is a 404.
 */
export type StateRead =
  | { kind: 'snapshot'; snapshot: StateSnapshot; nowMs: number | null; current: boolean }
  | { kind: 'unchanged'; nowMs: number | null; current: boolean }
  | { kind: 'computing'; retryAfterMs: number }
  | { kind: 'none' }

/** Seconds a 202 without a Retry-After header asks for, as the server's own default. */
const COMPUTING_RETRY_MS = 2_000

function headerNumber(response: Response, name: string): number | null {
  const value = Number(response.headers.get(name))
  return response.headers.has(name) && Number.isFinite(value) ? value : null
}

/**
 * The server's answer for the signed-in account, with what the page acts on besides the snapshot (see `StateRead`). The tag is
 * computed from `held`, as for `getServerSnapshot`. Any other failure throws.
 */
export async function readServerState(
  userId: string,
  held: StateSnapshot | null = null,
): Promise<StateRead> {
  const headers: Record<string, string> = {}
  if (held !== null) headers['If-None-Match'] = `"${await snapshotContentHash(held)}"`
  let response: Response
  try {
    response = await request('GET', '/api/state', undefined, userId, undefined, {
      headers,
      notModified: true,
    })
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return { kind: 'none' }
    throw error
  }
  const nowMs = headerNumber(response, 'X-State-Now')
  const current = response.headers.get('X-State-Current') !== '0'
  if (response.status === 304) return { kind: 'unchanged', nowMs, current }
  if (response.status === 202) {
    await response.body?.cancel().catch(() => undefined)
    const seconds = headerNumber(response, 'Retry-After')
    return {
      kind: 'computing',
      retryAfterMs: seconds === null ? COMPUTING_RETRY_MS : seconds * 1000,
    }
  }
  return {
    kind: 'snapshot',
    snapshot: await readJson(response, SnapshotWire, BODY_LIMIT),
    nowMs,
    current,
  }
}
