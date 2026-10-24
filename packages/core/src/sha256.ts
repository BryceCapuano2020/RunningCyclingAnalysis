/** Lowercase hex SHA-256 of bytes: the file hash that identifies an activity's original file. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Every file byte array here is backed by a plain ArrayBuffer, never a SharedArrayBuffer.
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
