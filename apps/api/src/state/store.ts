import { snapshotContentHash } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'

/** The snapshot's content hash, which is the ETag; the browser computes the same one (core/stateSnapshot). */
export const contentHash = snapshotContentHash

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
