import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../ui/components/stylesheet'
import { colour, declared, resolved } from './tokenSheet'

const tokensCss = await readStylesheet(import.meta.url, './tokens.css')
const darkRun = colour(
  resolved(
    new Map([
      ...declared(tokensCss, ':root'),
      ...declared(tokensCss, ":root:not([data-theme='light'])"),
    ]),
  ),
  'series-run',
)
/** The Node built-ins this test needs, named in variables so the browser build never resolves them. */
interface Node {
  readFileSync: (path: URL) => Uint8Array
  inflateSync: (data: Uint8Array) => Uint8Array
}
const [fsName, zlibName] = ['node:fs', 'node:zlib']
const fs = (await import(/* @vite-ignore */ fsName)) as Node
const zlib = (await import(/* @vite-ignore */ zlibName)) as Node
const publicFile = (name: string) =>
  fs.readFileSync(new URL(`../../public/${name}`, import.meta.url))
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/** Pixels of an 8-bit, non-interlaced RGB or RGBA PNG, as [r, g, b] triples. */
function pixels(png: Uint8Array): [number, number, number][] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  const channels = png[25] === 6 ? 4 : 3
  const chunks: number[] = []
  for (let at = 8; at < png.length; at += 12 + view.getUint32(at)) {
    if (text(png.subarray(at + 4, at + 8)) === 'IDAT') {
      chunks.push(...png.subarray(at + 8, at + 8 + view.getUint32(at)))
    }
  }
  const raw = zlib.inflateSync(Uint8Array.from(chunks))
  const stride = width * channels
  const rows: Uint8Array[] = []
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const row = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    const above = rows[y - 1]
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels]! : 0
      const up = above?.[i] ?? 0
      const upLeft = i >= channels ? (above?.[i - channels] ?? 0) : 0
      const predictor = [
        0,
        left,
        up,
        (left + up) >> 1,
        (() => {
          const p = left + up - upLeft
          const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)]
          return a <= b && a <= c ? left : b <= c ? up : upLeft
        })(),
      ][filter!]!
      row[i] = (row[i]! + predictor) & 255
    }
    rows.push(row)
  }
  return rows.flatMap((row) =>
    Array.from({ length: width }, (_, x): [number, number, number] => [
      row[x * channels]!,
      row[x * channels + 1]!,
      row[x * channels + 2]!,
    ]),
  )
}

const near = (pixel: number[], hex: string) =>
  [1, 3, 5].every((at, i) => Math.abs(pixel[i]! - parseInt(hex.slice(at, at + 2), 16)) <= 4)

describe('the brand icons carry the run colour of the dark theme', () => {
  it('draws the favicon with the token colour', () => {
    expect(text(publicFile('favicon.svg')).toLowerCase()).toContain(darkRun)
  })

  it.each(['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'social-card.png'])(
    'has the token colour in %s, and no crimson',
    (name) => {
      const found = pixels(publicFile(name))
      expect(found.filter((pixel) => near(pixel, darkRun)).length).toBeGreaterThan(50)
      expect(found.filter((pixel) => near(pixel, '#f0435f')).length).toBe(0)
    },
  )
})
