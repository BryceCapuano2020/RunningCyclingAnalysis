import { gzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
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

const DECOMPRESS = 'Could not decompress this file'

async function collect(source: FitSource, limits: Partial<typeof DEFAULT_EXTRACT_LIMITS> = {}) {
  const files: FitFile[] = []
  const errors: { fileName: string; reason: string }[] = []
  const summary = await extractFitFiles(
    source,
    (file) => {
      files.push(file)
    },
    (fileName, reason) => {
      errors.push({ fileName, reason })
    },
    { ...DEFAULT_EXTRACT_LIMITS, ...limits },
  )
  return { files, summary, errors }
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

  it('skips a .fit.gz whose content is not gzip and reports it', async () => {
    const { files, summary, errors } = await collect(new File([NOT_GZIP], 'bad.fit.gz'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
    expect(errors).toEqual([{ fileName: 'bad.fit.gz', reason: DECOMPRESS }])
  })

  it('reports a .fit.gz cut short part way through', async () => {
    const truncated = gzipSync(FIT_A).slice(0, 12)
    const { files, errors } = await collect(new File([truncated], 'cut.fit.gz'))
    expect(files).toEqual([])
    expect(errors).toEqual([{ fileName: 'cut.fit.gz', reason: DECOMPRESS }])
  })

  it('reports nothing for a .fit.gz that decompresses', async () => {
    const { errors } = await collect(new File([gzipSync(FIT_A)], 'ride.fit.gz'))
    expect(errors).toEqual([])
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
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('read failed'))
          },
        }),
    }
    const { files, summary, errors } = await collect(source)
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
    expect(errors).toEqual([{ fileName: 'broken.fit', reason: 'Could not read this file' }])
  })

  it('reports unsupported source formats', async () => {
    const { errors } = await collect(new File([FIT_A], 'activity.bin'))
    expect(errors).toEqual([{ fileName: 'activity.bin', reason: 'Unsupported file format' }])
  })

  it('bounds source, entry, decompressed, count and retained-buffer sizes', async () => {
    const bomb = gzipSync(noise(10_000))
    const { files: sourceFiles, errors: sourceErrors } = await collect(
      new File([FIT_A], 'source.fit'),
      { maxSourceBytes: 5 },
    )
    expect(sourceFiles).toEqual([])
    expect(sourceErrors).toEqual([
      { fileName: 'source.fit', reason: 'Source exceeds the 5-byte limit' },
    ])

    const { files: gzipFiles, errors: gzipErrors } = await collect(
      new File([bomb], 'bomb.fit.gz'),
      { maxEntryBytes: 1024 },
    )
    expect(gzipFiles).toEqual([])
    expect(gzipErrors).toEqual([
      { fileName: 'bomb.fit.gz', reason: 'Decompressed file exceeds the 1024-byte limit' },
    ])

    const zip = zipSync({ 'a.fit': noise(40), 'b.fit': noise(40) }, { level: 0 })
    const { files, errors } = await collect(new File([zip], 'limited.zip'), { maxEntryBytes: 32 })
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'a.fit', reason: 'Archive entry exceeds the 32-byte limit' },
      { fileName: 'b.fit', reason: 'Archive entry exceeds the 32-byte limit' },
    ])
  })

  it('enforces a small per-source file-count quota', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B })
    const { files, errors } = await collect(new File([zip], 'count.zip'), {
      ...DEFAULT_EXTRACT_LIMITS,
      maxFitFiles: 1,
    })
    expect(files).toHaveLength(1)
    expect(errors).toEqual([{ fileName: 'b.fit', reason: 'Archive exceeds the 1-FIT-file limit' }])
  })

  it('bounds all ZIP headers, including non-FIT entries', async () => {
    const zip = zipSync({ 'notes.txt': TEXT, 'ride.fit': FIT_A })
    const { files, errors } = await collect(new File([zip], 'headers.zip'), {
      maxArchiveEntries: 1,
    })
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'headers.zip', reason: 'Archive exceeds the 1-entry limit' },
    ])
  })

  it('enforces aggregate decompressed and retained-buffer quotas', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B })
    const total = await collect(new File([zip], 'total.zip'), {
      maxTotalDecompressedBytes: FIT_A.length,
    })
    expect(total.files).toHaveLength(1)
    expect(total.errors).toEqual([
      {
        fileName: 'b.fit',
        reason: `Total decompressed data exceeds the ${FIT_A.length}-byte limit`,
      },
    ])

    const buffered = await collect(new File([zip], 'buffered.zip'), { maxBufferedBytes: 5 })
    expect(buffered.files).toEqual([])
    expect(buffered.errors).toEqual([
      { fileName: 'a.fit', reason: 'Buffered data exceeds the 5-byte limit' },
      { fileName: 'b.fit', reason: 'Buffered data exceeds the 5-byte limit' },
    ])

    const singleGzip = await collect(new File([gzipSync(FIT_A)], 'single.fit.gz'), {
      maxTotalDecompressedBytes: 8,
    })
    expect(singleGzip.files).toEqual([])
    expect(singleGzip.errors).toEqual([
      {
        fileName: 'single.fit.gz',
        reason: 'Total decompressed data exceeds the 8-byte limit',
      },
    ])
  })

  it('propagates an error thrown by the onFile callback', async () => {
    await expect(
      extractFitFiles(new File([FIT_A], 'a.fit'), () => {
        throw new Error('storage full')
      }),
    ).rejects.toThrow('storage full')
  })

  it('cancels and releases an archive reader when a sink throws', async () => {
    const zip = zipSync({ 'a.fit': FIT_A })
    let stream: ReadableStream<Uint8Array> | undefined
    let canceled = false
    const source: FitSource = {
      name: 'sink.zip',
      stream: () => {
        stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(zip)
          },
          cancel() {
            canceled = true
          },
        })
        return stream
      },
      arrayBuffer: async () => zip.slice().buffer,
    }
    await expect(
      extractFitFiles(source, () => {
        throw new Error('storage full')
      }),
    ).rejects.toThrow('storage full')
    expect(canceled).toBe(true)
    expect(stream?.locked).toBe(false)
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

  it('keeps entries completed before a truncated zip ends and reports the cut one', async () => {
    const first = noise(100)
    const second = noise(20000)
    const zip = zipSync({ 'a.fit': first, 'b.fit': second }, { level: 0 })
    const truncated = zip.slice(0, zip.length - 15000)
    const { files, summary, errors } = await collect(chunkedSource('cut.zip', truncated, 512))
    expect(namesOf(files)).toEqual(['a.fit'])
    expect(bytesOf(files, 'a.fit')).toEqual(first)
    expect(summary.fitFiles).toBe(1)
    expect(errors).toEqual([
      { fileName: 'b.fit', reason: 'File is incomplete or corrupt' },
      { fileName: 'cut.zip', reason: 'Could not read archive' },
    ])
  })

  it('reports an entry whose compressed data is corrupt', async () => {
    const zip = zipSync({ 'x.fit': noise(500) })
    // The first byte of the deflate data (offset 30 plus the 5-byte name) with an invalid block type.
    zip[35] = 0xff
    const { files, errors } = await collect(new File([zip], 'corrupt-deflate.zip'))
    expect(files).toEqual([])
    expect(errors).toEqual([{ fileName: 'x.fit', reason: DECOMPRESS }])
  })

  it('resolves with zero counts for a corrupt zip', async () => {
    const { files, summary, errors } = await collect(new File([NOT_GZIP], 'broken.zip'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
    expect(errors).toEqual([{ fileName: 'broken.zip', reason: 'Could not read archive' }])
  })

  it('skips a corrupt nested .fit.gz, reports it, and keeps the other entries', async () => {
    const zip = zipSync({ 'bad.fit.gz': NOT_GZIP, 'good.fit': FIT_A })
    const { files, summary, errors } = await collect(new File([zip], 'mixed.zip'))
    expect(files).toEqual([{ fileName: 'good.fit', bytes: FIT_A }])
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0 })
    expect(errors).toEqual([{ fileName: 'bad.fit.gz', reason: DECOMPRESS }])
  })

  it('reports a nested .fit.gz under its path inside the zip', async () => {
    const zip = zipSync({ 'rides/2024/bad.fit.gz': NOT_GZIP, 'rides/ok.fit': FIT_A })
    const { errors } = await collect(new File([zip], 'paths.zip'))
    expect(errors).toEqual([{ fileName: 'rides/2024/bad.fit.gz', reason: DECOMPRESS }])
  })

  it('reports no errors for a clean export', async () => {
    const { errors } = await collect(new File([exportZip()], 'export.zip'))
    expect(errors).toEqual([])
  })

  it('skips an entry with an unsupported compression method', async () => {
    const zip = zipSync({ 'x.fit': noise(200), 'y.fit': FIT_B }, { level: 0 })
    // Change the local header method of the first entry (offset 8) to an unknown value.
    zip[8] = 99
    const { files, summary, errors } = await collect(new File([zip], 'method.zip'))
    expect(namesOf(files)).toEqual(['y.fit'])
    expect(summary.fitFiles).toBe(1)
    expect(errors).toEqual([{ fileName: 'x.fit', reason: 'Unsupported compression method' }])
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
    const { files, summary, errors } = await collect(source)
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0 })
    expect(errors).toEqual([{ fileName: 'failing.zip', reason: 'Could not read this file' }])
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
