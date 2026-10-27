import { describe, expect, it } from 'vitest'

/** The bytes of a file in apps/web/public. The module name is a variable so the browser build never resolves it. */
async function publicFile(name: string): Promise<Uint8Array> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFileSync: (path: URL) => Uint8Array
  }
  return new Uint8Array(fs.readFileSync(new URL(`../public/${name}`, import.meta.url)))
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('favicon.ico', () => {
  // Browsers ask for /favicon.ico whatever the page declares. A file here is served as a static
  // asset; without one the Worker answers 404 and the request is logged as an error.
  it('is a single 32 by 32 icon whose image is a PNG of that size', async () => {
    const bytes = await publicFile('favicon.ico')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    expect(view.getUint16(0, true)).toBe(0)
    expect(view.getUint16(2, true)).toBe(1)
    expect(view.getUint16(4, true)).toBe(1)
    expect([bytes[6], bytes[7]]).toEqual([32, 32])

    const length = view.getUint32(14, true)
    const offset = view.getUint32(18, true)
    expect(offset + length).toBe(bytes.byteLength)
    expect(Array.from(bytes.slice(offset, offset + 8))).toEqual(PNG_SIGNATURE)
    expect([view.getUint32(offset + 16), view.getUint32(offset + 20)]).toEqual([32, 32])
  })
})
