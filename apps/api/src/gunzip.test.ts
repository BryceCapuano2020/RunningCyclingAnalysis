import { describe, expect, it } from 'vitest'
import { encodingOf, gunzipCapped } from './gunzip.ts'

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

describe('gunzipCapped', () => {
  it('gives back the bytes a gzip body holds', async () => {
    const file = new Uint8Array(5000).map((_, i) => i % 11)
    expect(await gunzipCapped(await gzipped(file), 5000)).toEqual(file)
  })

  it('refuses a body that unzips past the cap', async () => {
    const zipped = await gzipped(new Uint8Array(100_000))
    expect(zipped.byteLength).toBeLessThan(1000)
    await expect(gunzipCapped(zipped, 99_999)).rejects.toMatchObject({
      status: 413,
      code: 'payload_too_large',
    })
  })

  it('refuses bytes that are not gzip, and a gzip body cut short', async () => {
    await expect(gunzipCapped(new TextEncoder().encode('not gzip'), 1000)).rejects.toMatchObject({
      status: 400,
      code: 'bad_encoding',
    })
    const zipped = await gzipped(new Uint8Array(4000).map((_, i) => (i * 7) % 251))
    await expect(
      gunzipCapped(zipped.slice(0, zipped.byteLength - 20), 10_000),
    ).rejects.toMatchObject({ status: 400, code: 'bad_encoding' })
  })
})
