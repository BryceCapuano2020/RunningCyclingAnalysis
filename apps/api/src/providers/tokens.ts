import { toBase64Url } from '../util.ts'

/**
 * Provider tokens at rest (docs/design/garmin-sync.md decision 3): one AES-GCM ciphertext per link, under a key from the
 * Worker secret `PROVIDER_TOKEN_KEY`, with the account and provider as associated data, so a ciphertext copied to
 * another row does not open. The key lives apart from D1, so a database leak alone exposes no token.
 *
 * The secret is a comma-separated list of `id:key`, each key 32 random bytes in base64url. The first seals; every one
 * listed opens, so a key is rotated by putting a new one first and dropping the old once no row names it.
 */

export interface SealedTokens {
  /** base64url of the 12-byte nonce followed by the ciphertext and its tag. */
  ciphertext: string
  keyId: string
}

export interface TokenKeys {
  /** The id of the key that seals. */
  current: string
  keys: ReadonlyMap<string, Uint8Array>
}

const KEY_BYTES = 32
const NONCE_BYTES = 12
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/
const BASE64URL = /^[A-Za-z0-9_-]+$/

function fromBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text)) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    // A length no base64 text can have.
    return null
  }
}

/** The keys a secret lists, or null when it is unset or any entry is malformed: a bad secret seals nothing. */
export function parseTokenKeys(secret: string | undefined): TokenKeys | null {
  const entries = (secret ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (entries.length === 0) return null
  const keys = new Map<string, Uint8Array>()
  for (const entry of entries) {
    const at = entry.indexOf(':')
    const id = entry.slice(0, at)
    const key = at > 0 ? fromBase64Url(entry.slice(at + 1).replace(/=+$/, '')) : null
    if (!KEY_ID.test(id) || key?.length !== KEY_BYTES || keys.has(id)) return null
    keys.set(id, key)
  }
  return { current: entries[0]!.slice(0, entries[0]!.indexOf(':')), keys }
}

function requireKeys(secret: string | undefined): TokenKeys {
  const keys = parseTokenKeys(secret)
  if (keys === null) throw new Error('PROVIDER_TOKEN_KEY is not set or not valid')
  return keys
}

function associatedData(userId: string, provider: string): Uint8Array {
  return new TextEncoder().encode(`rca:provider-tokens:v1\u0000${provider}\u0000${userId}`)
}

async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage])
}

/** Seals a provider's tokens for one account under the current key. */
export async function sealTokens(
  secret: string | undefined,
  randomBytes: (length: number) => Uint8Array,
  userId: string,
  provider: string,
  tokens: unknown,
): Promise<SealedTokens> {
  const { current, keys } = requireKeys(secret)
  const nonce = randomBytes(NONCE_BYTES)
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: associatedData(userId, provider) },
    await aesKey(keys.get(current)!, 'encrypt'),
    new TextEncoder().encode(JSON.stringify(tokens)),
  )
  const out = new Uint8Array(NONCE_BYTES + sealed.byteLength)
  out.set(nonce)
  out.set(new Uint8Array(sealed), NONCE_BYTES)
  return { ciphertext: toBase64Url(out), keyId: current }
}

/** Opens one account's tokens. Throws when the key is not listed, or the ciphertext is not this account's. */
export async function openTokens(
  secret: string | undefined,
  userId: string,
  provider: string,
  sealed: SealedTokens,
): Promise<unknown> {
  const raw = requireKeys(secret).keys.get(sealed.keyId)
  if (raw === undefined) throw new Error('The key that sealed these tokens is not listed')
  const bytes = fromBase64Url(sealed.ciphertext)
  if (bytes === null || bytes.length <= NONCE_BYTES) throw new Error('Sealed tokens are malformed')
  const opened = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.slice(0, NONCE_BYTES),
      additionalData: associatedData(userId, provider),
    },
    await aesKey(raw, 'decrypt'),
    bytes.slice(NONCE_BYTES),
  )
  return JSON.parse(new TextDecoder().decode(opened)) as unknown
}
