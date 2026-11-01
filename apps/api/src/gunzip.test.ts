import { describe, expect, it } from 'vitest'
import { encodingOf, gunzipDigest } from './gunzip.ts'

async function gzipped(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const request = (encoding?: string) =>
  new Request('https://x.test/', {
    method: 'PUT',
    headers: encoding === undefined ? {} : { 'content-encoding': encoding },
  })

describe('encodingOf', () => {
  it('reads no encoding, identity and gzip, and refuses the rest', () => {
    expect(encodingOf(request())).toBeNull()
    expect(encodingOf(request('identity'))).toBeNull()
    expect(encodingOf(request(' GZip '))).toBe('gzip')
    expect(() => encodingOf(request('br'))).toThrowError(/gzipped/)
    expect(() => encodingOf(request('gzip, br'))).toThrowError(/gzipped/)
  })
})

describe('gunzipDigest', () => {
  const hexOf = async (bytes: Uint8Array) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')

  it('gives the hash and size of the file a gzip body holds', async () => {
    const file = new Uint8Array(5000).map((_, i) => (i * 7) % 251)
    expect(await gunzipDigest(await gzipped(file), 5000)).toEqual({
      hash: await hexOf(file),
      size: 5000,
    })
  })

  it('refuses a body that unzips past the cap', async () => {
    const zipped = await gzipped(new Uint8Array(100_000))
    expect(zipped.byteLength).toBeLessThan(1000)
    await expect(gunzipDigest(zipped, 99_999, 1_000_000)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    })
  })

  it('refuses a body that inflates past the ratio, however small the cap allows', async () => {
    const zipped = await gzipped(new Uint8Array(1_000_000))
    await expect(gunzipDigest(zipped, 50_000_000)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    })
    // A file that gzips to a third is far inside it.
    let state = 7
    const file = Uint8Array.from({ length: 30_000 }, () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      return (state >> 16) % 16
    })
    await expect(gunzipDigest(await gzipped(file), 50_000_000)).resolves.toMatchObject({
      size: 30_000,
    })
  })

  it('refuses bytes that are not gzip, and a gzip body cut short', async () => {
    await expect(gunzipDigest(new TextEncoder().encode('not gzip'), 1000)).rejects.toMatchObject({
      status: 400,
      code: 'bad_encoding',
    })
    const zipped = await gzipped(new Uint8Array(4000).map((_, i) => (i * 7) % 251))
    await expect(
      gunzipDigest(zipped.slice(0, zipped.byteLength - 20), 10_000),
    ).rejects.toMatchObject({ status: 400, code: 'bad_encoding' })
  })
})
