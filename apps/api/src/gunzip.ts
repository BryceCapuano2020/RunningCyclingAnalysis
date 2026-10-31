import { HttpError } from './errors.ts'

/** How an upload's body is encoded: as the file itself, or gzipped (the client sends `Content-Encoding: gzip`). */
export type BodyEncoding = 'gzip' | null

/** The encoding the request names; anything the server does not read is refused. */
export function encodingOf(request: Request): BodyEncoding {
  const named = request.headers.get('content-encoding')?.trim().toLowerCase()
  if (named === undefined || named === '' || named === 'identity') return null
  if (named === 'gzip') return 'gzip'
  throw new HttpError(400, 'unsupported_encoding', 'Send the file as it is or gzipped')
}

/**
 * The bytes a gzip body holds, read in pieces and refused past `maxBytes`, so a small body that inflates
 * to a great one cannot fill the Worker's memory. A body that is not valid gzip is a client error.
 */
export async function gunzipCapped(compressed: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        throw new HttpError(
          413,
          'payload_too_large',
          `The file is larger than ${maxBytes} bytes once unzipped`,
        )
      }
      chunks.push(value)
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'bad_encoding', 'The body is not valid gzip')
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
