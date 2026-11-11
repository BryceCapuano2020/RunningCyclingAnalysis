import { describe, expect, it } from 'vitest'
import { toBase64Url } from '../util.ts'
import { openTokens, parseTokenKeys, sealTokens } from './tokens.ts'

const key = (fill: number) => toBase64Url(new Uint8Array(32).fill(fill))
const KEYS = `k2:${key(2)},k1:${key(1)}`
let counter = 0
const randomBytes = (length: number) => {
  counter += 1
  const bytes = new Uint8Array(length)
  bytes[0] = counter
  return bytes
}
const TOKENS = { accessToken: 'access-synthetic', refreshToken: 'refresh-synthetic' }

describe('provider token sealing', () => {
  it('opens what it sealed, under the first key, and never stores the token as text', async () => {
    const sealed = await sealTokens(KEYS, randomBytes, 'user-1', 'garmin', TOKENS)
    expect(sealed.keyId).toBe('k2')
    expect(sealed.ciphertext).not.toContain('synthetic')
    expect(await openTokens(KEYS, 'user-1', 'garmin', sealed)).toEqual(TOKENS)
  })

  it('opens a token sealed under an older key still listed, so the key can be rotated', async () => {
    const old = await sealTokens(`k1:${key(1)}`, randomBytes, 'user-1', 'garmin', TOKENS)
    expect(await openTokens(KEYS, 'user-1', 'garmin', old)).toEqual(TOKENS)
  })

  it('refuses a ciphertext moved to another account or provider', async () => {
    const sealed = await sealTokens(KEYS, randomBytes, 'user-1', 'garmin', TOKENS)
    await expect(openTokens(KEYS, 'user-2', 'garmin', sealed)).rejects.toThrow()
  })

  it('refuses a key id no longer listed, and a changed ciphertext', async () => {
    const sealed = await sealTokens(KEYS, randomBytes, 'user-1', 'garmin', TOKENS)
    await expect(openTokens(`k3:${key(3)}`, 'user-1', 'garmin', sealed)).rejects.toThrow()
    const flipped = { ...sealed, ciphertext: `${sealed.ciphertext.slice(0, -2)}AA` }
    await expect(openTokens(KEYS, 'user-1', 'garmin', flipped)).rejects.toThrow()
  })

  it('uses a fresh nonce each time', async () => {
    const a = await sealTokens(KEYS, randomBytes, 'user-1', 'garmin', TOKENS)
    const b = await sealTokens(KEYS, randomBytes, 'user-1', 'garmin', TOKENS)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('reads a key with base64 padding, as basenc writes it', () => {
    expect(parseTokenKeys(`k1:${key(1)}=`)?.keys.get('k1')).toEqual(new Uint8Array(32).fill(1))
  })

  it.each([
    ['unset', undefined],
    ['blank', ' '],
    ['a key with no id', key(1)],
    ['a short key', `k1:${toBase64Url(new Uint8Array(16))}`],
    ['one id twice', `k1:${key(1)},k1:${key(2)}`],
    ['a key that is not base64', 'k1:short'],
  ])('reads %s as no keys', (_label, value) => {
    expect(parseTokenKeys(value)).toBeNull()
  })
})
