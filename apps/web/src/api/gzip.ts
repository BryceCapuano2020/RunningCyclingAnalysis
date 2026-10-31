/**
 * The bytes gzipped, or null where the browser cannot (no CompressionStream) or the gzip is not smaller. An original
 * is a FIT file, which gzips to about two thirds, and the server stores and counts what it is sent.
 */
export async function gzipSmaller(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(new CompressionStream('gzip'))
    const zipped = new Uint8Array(await new Response(stream).arrayBuffer())
    return zipped.byteLength < bytes.byteLength ? zipped : null
  } catch {
    return null
  }
}
