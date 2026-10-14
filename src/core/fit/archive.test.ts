import { gzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractFitFiles } from './archive'
import type { FitFile, FitSource } from './archive'

const FIT_A = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])
const FIT_B = new Uint8Array([14, 16, 0, 0, 5, 6, 7, 8, 46, 70, 73, 84, 1, 1])
const FIT_C = new Uint8Array([14, 16, 0, 0, 9, 9, 9, 9, 46, 70, 73, 84, 2, 2])
const TEXT = new TextEncoder().encode('not a fit file, just text')
const NOT_GZIP = new Uint8Array([1, 2, 3, 4, 5])

/** Pseudo-random bytes so stored (uncompressed) zip entries are large and easy to cut. */
function noise(length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = 12345
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
}

function chunkedSource(name: string, bytes: Uint8Array, size: number): FitSource {
  return {
    name,
    arrayBuffer: async () => bytes.slice().buffer,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += size) {
            controller.enqueue(bytes.slice(offset, offset + size))
          }
          controller.close()
        },
      }),
  }
}

async function collect(source: FitSource) {
  const files: FitFile[] = []
  const summary = await extractFitFiles(source, (file) => {
    files.push(file)
  })
  return { files, summary }
}

function namesOf(files: FitFile[]): string[] {
  return files.map((f) => f.fileName).sort()
}

function bytesOf(files: FitFile[], fileName: string): Uint8Array | undefined {
  return files.find((f) => f.fileName === fileName)?.bytes
}

/** A realistic export: nested folders, mixed case, gzip, GPX/TCX, text and macOS metadata. */
function exportZip(level: 0 | 6 = 6): Uint8Array<ArrayBuffer> {
  return zipSync(
    {
      'rides/': new Uint8Array(0),
      'rides/2024/Morning.fit': FIT_A,
      'rides/B.FIT': FIT_B,
      'rides/c.fit.gz': gzipSync(FIT_C),
      'routes/route.gpx.gz': gzipSync(TEXT),
      'routes/track.TCX': TEXT,
      'notes.txt': TEXT,
      '__MACOSX/._x.fit': TEXT,
      '__MACOSX/rides/._Morning.fit': TEXT,
    },
    { level },
  )
}

const EXPECTED_NAMES = ['rides/2024/Morning.fit', 'rides/B.FIT', 'rides/c.fit']

describe('extractFitFiles on single files', () => {
  it('delivers a .fit file unchanged, regardless of case', async () => {
    const { files, summary } = await collect(new File([FIT_A], 'RIDE.FIT'))
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0 })
    expect(files).toEqual([{ fileName: 'RIDE.FIT', bytes: FIT_A }])
  })

  it('gunzips a .fit.gz file and drops the .gz from its name', async () => {
    const { files, summary } = await collect(new File([gzipSync(FIT_A)], 'ride.fit.gz'))
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0 })
    expect(files).toEqual([{ fileName: 'ride.fit', bytes: FIT_A }])
  })

  it('keeps the upper-case name of a .FIT.GZ file', async () => {
    const { files } = await collect(new File([gzipSync(FIT_A)], 'RIDE.FIT.GZ'))
    expect(files.map((f) => f.fileName)).toEqual(['RIDE.FIT'])
  })

  it('skips a .fit.gz whose content is not gzip', async () => {
    const { files, summary } = await collect(new File([NOT_GZIP], 'bad.fit.gz'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('counts a top-level GPX or TCX file as skipped', async () => {
    const { files, summary } = await collect(new File([TEXT], 'route.gpx'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 1 })
  })

  it('ignores any other file type', async () => {
    const { files, summary } = await collect(new File([FIT_A], 'notes.txt'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('resolves with zero counts when the file cannot be read', async () => {
    const source: FitSource = {
      name: 'broken.fit',
      arrayBuffer: () => Promise.reject(new Error('read failed')),
      stream: () => new ReadableStream<Uint8Array>(),
    }
    const { files, summary } = await collect(source)
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('propagates an error thrown by the onFile callback', async () => {
    await expect(
      extractFitFiles(new File([FIT_A], 'a.fit'), () => {
        throw new Error('storage full')
      }),
    ).rejects.toThrow('storage full')
  })
})

describe('extractFitFiles on zip archives', () => {
  it('extracts the FIT files of a mixed export and skips everything else', async () => {
    const { files, summary } = await collect(new File([exportZip()], 'export.zip'))
    expect(namesOf(files)).toEqual(EXPECTED_NAMES)
    expect(bytesOf(files, 'rides/2024/Morning.fit')).toEqual(FIT_A)
    expect(bytesOf(files, 'rides/B.FIT')).toEqual(FIT_B)
    expect(bytesOf(files, 'rides/c.fit')).toEqual(FIT_C)
    expect(summary).toEqual({ fitFiles: 3, otherActivityFiles: 2 })
  })

  it('handles uncompressed (stored) entries the same way', async () => {
    const { files, summary } = await collect(new File([exportZip(0)], 'stored.zip'))
    expect(namesOf(files)).toEqual(EXPECTED_NAMES)
    expect(summary).toEqual({ fitFiles: 3, otherActivityFiles: 2 })
  })

  it('gives the same result when the zip arrives in 7-byte chunks', async () => {
    const zip = exportZip()
    const whole = await collect(new File([zip], 'export.zip'))
    const chunked = await collect(chunkedSource('export.zip', zip, 7))
    expect(namesOf(chunked.files)).toEqual(EXPECTED_NAMES)
    expect(chunked.files).toEqual(whole.files)
    expect(chunked.summary).toEqual(whole.summary)
  })

  it('keeps entries completed before a truncated zip ends', async () => {
    const first = noise(100)
    const second = noise(20000)
    const zip = zipSync({ 'a.fit': first, 'b.fit': second }, { level: 0 })
    const truncated = zip.slice(0, zip.length - 15000)
    const { files, summary } = await collect(chunkedSource('cut.zip', truncated, 512))
    expect(namesOf(files)).toEqual(['a.fit'])
    expect(bytesOf(files, 'a.fit')).toEqual(first)
    expect(summary.fitFiles).toBe(1)
  })

  it('resolves with zero counts for a corrupt zip', async () => {
    const { files, summary } = await collect(new File([NOT_GZIP], 'broken.zip'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('skips a corrupt nested .fit.gz and keeps the other entries', async () => {
    const zip = zipSync({ 'bad.fit.gz': NOT_GZIP, 'good.fit': FIT_A })
    const { files, summary } = await collect(new File([zip], 'mixed.zip'))
    expect(files).toEqual([{ fileName: 'good.fit', bytes: FIT_A }])
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0 })
  })

  it('skips an entry with an unsupported compression method', async () => {
    const zip = zipSync({ 'x.fit': noise(200), 'y.fit': FIT_B }, { level: 0 })
    // Change the local header method of the first entry (offset 8) to an unknown value.
    zip[8] = 99
    const { files, summary } = await collect(new File([zip], 'method.zip'))
    expect(namesOf(files)).toEqual(['y.fit'])
    expect(summary.fitFiles).toBe(1)
  })

  it('resolves with an empty summary when the zip has no FIT entries', async () => {
    const zip = zipSync({ 'readme.txt': TEXT })
    const { files, summary } = await collect(new File([zip], 'empty.zip'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('resolves when the stream fails part way through', async () => {
    const zip = exportZip()
    let sent = false
    const source: FitSource = {
      name: 'failing.zip',
      arrayBuffer: async () => zip.slice().buffer,
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true
              controller.enqueue(zip.slice(0, 40))
              return
            }
            controller.error(new Error('network dropped'))
          },
        }),
    }
    const { files, summary } = await collect(source)
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })

  it('resolves with zero counts when the stream cannot be opened', async () => {
    const source: FitSource = {
      name: 'locked.zip',
      arrayBuffer: async () => new ArrayBuffer(0),
      stream: () => {
        throw new Error('stream unavailable')
      },
    }
    const { files, summary } = await collect(source)
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
  })
})
