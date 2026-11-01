import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import { sha256TextHex } from './sha256Sync'

describe('sha256TextHex', () => {
  it('gives the known digests', () => {
    expect(sha256TextHex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256TextHex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('agrees with the browser’s SHA-256 for texts of every length around a block, and for non-ASCII', async () => {
    const encoder = new TextEncoder()
    for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 200]) {
      const text = 'activities/12345678.fit'.repeat(10).slice(0, length)
      expect(sha256TextHex(text), `${length}`).toBe(await sha256Hex(encoder.encode(text)))
    }
    const unicode = 'Wanderung am Äußeren Ring – 山'
    expect(sha256TextHex(unicode)).toBe(await sha256Hex(encoder.encode(unicode)))
  })
})
