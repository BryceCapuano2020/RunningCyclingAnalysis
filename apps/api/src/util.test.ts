import { describe, expect, it } from 'vitest'
import { must, sha256Hex, toHex } from './util.ts'

describe('util', () => {
  it('encodes bytes as lowercase hex with leading zeros', () => {
    expect(toHex(new Uint8Array([0, 15, 255, 16]))).toBe('000fff10')
  })

  it('hashes strings and bytes identically', async () => {
    const text = 'abc'
    expect(await sha256Hex(text)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex(new TextEncoder().encode(text))).toBe(await sha256Hex(text))
  })

  it('returns a present value and throws for a missing one', () => {
    expect(must(0, 'x')).toBe(0)
    expect(() => must(undefined, 'activity')).toThrow('activity missing after write')
  })
})
