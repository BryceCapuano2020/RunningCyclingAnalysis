/** The chunks, in order, as one new array of `total` bytes. */
export function concat(chunks: Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
