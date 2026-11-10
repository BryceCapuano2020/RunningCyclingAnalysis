import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { toHex } from '../util.ts'

/**
 * What the athlete sees, hashed: the shape and model, the zone and the state. The instant, the counter and the build are not
 * in it, so a recompute that changes no figure has the same hash and writes nothing (decision 9). The hash is the ETag.
 */
export async function contentHash(snapshot: StateSnapshot): Promise<string> {
  const { libraryVersion: _version, nowMs: _now, buildSha: _build, ...content } = snapshot
  const text = JSON.stringify(content)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toHex(new Uint8Array(digest)).slice(0, 32)
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The snapshot as the gzipped JSON the object holds and `GET /api/state` serves. */
export async function encodeSnapshot(snapshot: StateSnapshot): Promise<Uint8Array> {
  const body = new Blob([JSON.stringify(snapshot)]).stream()
  return collect(body.pipeThrough(new CompressionStream('gzip')))
}

/** The JSON text of a stored object, for a client that did not say it reads gzip. */
export function inflate(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return body.pipeThrough(new DecompressionStream('gzip'))
}
