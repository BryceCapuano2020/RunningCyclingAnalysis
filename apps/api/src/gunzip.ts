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

/** The most a gzip body may inflate to, as a multiple of its own size. A FIT file gzips to about a third. */
export const MAX_INFLATE_RATIO = 50

/** Workerd's streaming digest, which the runtime provides and Node does not. */
interface DigestStreamLike extends WritableStream<Uint8Array> {
  readonly digest: Promise<ArrayBuffer>
}
type DigestStreamConstructor = new (algorithm: string) => DigestStreamLike

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * What a gzip body holds, as the SHA-256 and the size of the file it unzips to, read in pieces so the file itself is
 * not kept: each piece goes to the hash as it comes (where the runtime has a streaming digest; elsewhere the pieces are
 * kept and hashed at the end). A body is refused when it unzips past `maxBytes` or past `maxRatio` times its own size, so
 * a small body that inflates to a great one cannot spend the Worker's memory or time. A body that is not valid gzip is a
 * client error.
 */
export async function gunzipDigest(
  compressed: Uint8Array,
  maxBytes: number,
  maxRatio = MAX_INFLATE_RATIO,
): Promise<{ hash: string; size: number }> {
  const limit = Math.min(maxBytes, compressed.byteLength * maxRatio)
  const Digest = (crypto as unknown as { DigestStream?: DigestStreamConstructor }).DigestStream
  const digest = Digest === undefined ? null : new Digest('SHA-256')
  const writer = digest?.getWriter()
  const kept: Uint8Array[] = []
  const reader = new Blob([compressed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        throw new HttpError(
          413,
          'payload_too_large',
          size > maxBytes
            ? `The file is larger than ${maxBytes} bytes once unzipped`
            : 'The file unzips to far more than it was sent as',
        )
      }
      if (writer === undefined) kept.push(value)
      else await writer.write(value)
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    void writer?.abort().catch(() => undefined)
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'bad_encoding', 'The body is not valid gzip')
  }
  if (digest !== null && writer !== undefined) {
    await writer.close()
    return { hash: toHex(new Uint8Array(await digest.digest)), size }
  }
  const whole = new Uint8Array(size)
  let offset = 0
  for (const chunk of kept) {
    whole.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { hash: toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', whole))), size }
}
