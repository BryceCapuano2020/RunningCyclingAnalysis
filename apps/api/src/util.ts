export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

/** For reads that the code has just written and so must exist. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} missing after write`)
  return value
}

export function fromBase64UrlUtf8(input: string): string {
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
