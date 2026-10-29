import { gzipSync, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import { expandsReason } from './archiveReasons'
import type { FitFile, FitSource } from './archive'
import { streamedZip, toZip64 } from './zipTestFiles'

// Records the entries whose start() ran. start() is what drains an entry the archive skips.
const unzipSpy = vi.hoisted(() => ({ started: [] as string[] }))

vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>()
  class SpyUnzip extends actual.Unzip {
    constructor(onFile: (file: import('fflate').UnzipFile) => void) {
      super((file) => {
        const start = file.start.bind(file)
        file.start = () => {
          unzipSpy.started.push(file.name)
          start()
        }
        onFile(file)
      })
    }
  }
  return { ...actual, Unzip: SpyUnzip }
})

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
const DAMAGED = 'Archive is damaged; some activities may be missing'

/** Offsets of the local file headers of a zip, in order. */
function localHeaderOffsets(zip: Uint8Array): number[] {
  const offsets: number[] = []
  for (let i = 0; i + 4 <= zip.length; i++) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x03 && zip[i + 3] === 0x04) {
      offsets.push(i)
    }
  }
  return offsets
}

async function collect(source: FitSource, limits: Partial<typeof DEFAULT_EXTRACT_LIMITS> = {}) {
  const files: FitFile[] = []
  const errors: { fileName: string; reason: string }[] = []
  const summary = await extractFitFiles(
    source,
    (file) => {
      files.push(file)
    },
    (fileName, rejection) => {
      errors.push({ fileName, reason: rejection.reason })
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

/** A realistic export: nested folders, mixed case, gzip, GPX/TCX, KML, text and macOS metadata. */
function exportZip(level: 0 | 6 = 6): Uint8Array<ArrayBuffer> {
  return zipSync(
    {
      'rides/': new Uint8Array(0),
      'rides/2024/Morning.fit': FIT_A,
      'rides/B.FIT': FIT_B,
      'rides/c.fit.gz': gzipSync(FIT_C),
      'routes/route.gpx.gz': gzipSync(TEXT),
      'routes/track.TCX': TEXT,
      'routes/map.kml': TEXT,
      'notes.txt': TEXT,
      '__MACOSX/._x.fit': TEXT,
      '__MACOSX/rides/._Morning.fit': TEXT,
    },
    { level },
  )
}

const EXPECTED_NAMES = [
  'rides/2024/Morning.fit',
  'rides/B.FIT',
  'rides/c.fit',
  'routes/route.gpx',
  'routes/track.TCX',
]

describe('extractFitFiles on single files', () => {
  it('delivers a .fit file unchanged, regardless of case', async () => {
    const { files, summary } = await collect(new File([FIT_A], 'RIDE.FIT'))
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
    expect(files).toEqual([{ fileName: 'RIDE.FIT', bytes: FIT_A }])
  })

  it('gunzips a .fit.gz file and drops the .gz from its name', async () => {
    const { files, summary } = await collect(new File([gzipSync(FIT_A)], 'ride.fit.gz'))
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
    expect(files).toEqual([{ fileName: 'ride.fit', bytes: FIT_A }])
  })

  it('keeps the upper-case name of a .FIT.GZ file', async () => {
    const { files } = await collect(new File([gzipSync(FIT_A)], 'RIDE.FIT.GZ'))
    expect(files.map((f) => f.fileName)).toEqual(['RIDE.FIT'])
  })

  it('skips a .fit.gz whose content is not gzip and reports it', async () => {
    const { files, summary, errors } = await collect(new File([NOT_GZIP], 'bad.fit.gz'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
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

  it('delivers a top-level GPX or TCX file like a FIT file, gunzipped and without its .gz', async () => {
    const gpx = await collect(new File([gzipSync(TEXT)], 'route.gpx.gz'))
    expect(gpx.files).toEqual([{ fileName: 'route.gpx', bytes: TEXT }])
    expect(gpx.summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
    const tcx = await collect(new File([TEXT], 'Track.TCX'))
    expect(tcx.files).toEqual([{ fileName: 'Track.TCX', bytes: TEXT }])
    expect(tcx.summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
  })

  it('counts a top-level file in a format this app does not read as skipped', async () => {
    const { files, summary, errors } = await collect(new File([TEXT], 'route.kml'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 1, notActivities: 0 })
    expect(errors).toEqual([])
  })

  it('ignores any other file type', async () => {
    const { files, summary } = await collect(new File([FIT_A], 'notes.txt'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
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
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
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
    expect(errors).toEqual([
      { fileName: 'b.fit', reason: 'Archive exceeds the 1-activity-file limit' },
    ])
  })

  it('bounds all ZIP headers, including non-FIT entries', async () => {
    const zip = zipSync({ 'notes.txt': TEXT, 'ride.fit': FIT_A })
    const { files, errors } = await collect(new File([zip], 'headers.zip'), {
      maxArchiveEntries: 1,
    })
    expect(files).toEqual([])
    expect(errors).toEqual([{ fileName: 'ride.fit', reason: 'Archive exceeds the 1-entry limit' }])
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
        reason: `Archive expands to more than ${FIT_A.length} bytes`,
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
        reason: 'Archive expands to more than 8 bytes',
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
  it('extracts the activity files of a mixed export and skips everything else', async () => {
    const { files, summary } = await collect(new File([exportZip()], 'export.zip'))
    expect(namesOf(files)).toEqual(EXPECTED_NAMES)
    expect(bytesOf(files, 'rides/2024/Morning.fit')).toEqual(FIT_A)
    expect(bytesOf(files, 'rides/B.FIT')).toEqual(FIT_B)
    expect(bytesOf(files, 'rides/c.fit')).toEqual(FIT_C)
    expect(summary).toEqual({ fitFiles: 5, otherActivityFiles: 1, notActivities: 0 })
  })

  it('handles uncompressed (stored) entries the same way', async () => {
    const { files, summary } = await collect(new File([exportZip(0)], 'stored.zip'))
    expect(namesOf(files)).toEqual(EXPECTED_NAMES)
    expect(summary).toEqual({ fitFiles: 5, otherActivityFiles: 1, notActivities: 0 })
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
      { fileName: 'cut.zip', reason: DAMAGED },
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
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
    expect(errors).toEqual([{ fileName: 'broken.zip', reason: 'Could not read archive' }])
  })

  it('skips a corrupt nested .fit.gz, reports it, and keeps the other entries', async () => {
    const zip = zipSync({ 'bad.fit.gz': NOT_GZIP, 'good.fit': FIT_A })
    const { files, summary, errors } = await collect(new File([zip], 'mixed.zip'))
    expect(files).toEqual([{ fileName: 'good.fit', bytes: FIT_A }])
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
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
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
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
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
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
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
  })

  it('reports a source that is cut off by the source-size limit, with the entry it cut', async () => {
    const zip = zipSync({ 'a.fit': noise(100) }, { level: 0 })
    const { files, errors } = await collect(chunkedSource('cut.zip', zip, 20), {
      maxSourceBytes: 50,
    })
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'a.fit', reason: 'Source exceeds the 50-byte limit' },
      { fileName: 'cut.zip', reason: 'Source exceeds the 50-byte limit' },
    ])
  })

  it('stops a zip bomb at the total limit and does not expand the rest of the archive', async () => {
    const megabyte = new Uint8Array(1024 ** 2)
    const entries: Record<string, Uint8Array> = {}
    for (let k = 0; k < 30; k++) entries[`bomb-${k}.fit`] = megabyte
    const zip = zipSync(entries, { level: 9 })
    const stream = {
      current: undefined as ReadableStream<Uint8Array> | undefined,
    }
    const source: FitSource = {
      name: 'bomb.zip',
      arrayBuffer: async () => zip.slice().buffer,
      stream: () => {
        stream.current = chunkedSource('bomb.zip', zip, 64 * 1024).stream()
        return stream.current
      },
    }
    const { files, errors } = await collect(source, { maxTotalDecompressedBytes: 3 * 1024 ** 2 })
    expect(files).toHaveLength(3)
    expect(errors).toEqual([
      { fileName: 'bomb-3.fit', reason: 'Archive expands to more than 3 MB' },
    ])
    expect(stream.current?.locked).toBe(false)
  })

  it('keeps the default total at 2 GB and each entry at 64 MB', () => {
    expect(DEFAULT_EXTRACT_LIMITS.maxTotalDecompressedBytes).toBe(2 * 1024 ** 3)
    expect(DEFAULT_EXTRACT_LIMITS.maxEntryBytes).toBe(64 * 1024 ** 2)
  })

  it('extracts FIT files from a zip nested inside a zip', async () => {
    const inner = zipSync({ 'a.fit': FIT_A, 'sub/B.FIT': FIT_B, 'notes.txt': TEXT, 'r.gpx': TEXT })
    const outer = zipSync({ 'rides/inner.zip': inner, 'top.fit': FIT_C })
    const { files, summary, errors } = await collect(new File([outer], 'outer.zip'))
    expect(namesOf(files)).toEqual([
      'rides/inner.zip/a.fit',
      'rides/inner.zip/r.gpx',
      'rides/inner.zip/sub/B.FIT',
      'top.fit',
    ])
    expect(bytesOf(files, 'rides/inner.zip/a.fit')).toEqual(FIT_A)
    expect(bytesOf(files, 'rides/inner.zip/sub/B.FIT')).toEqual(FIT_B)
    expect(summary).toEqual({ fitFiles: 4, otherActivityFiles: 0, notActivities: 0 })
    expect(errors).toEqual([])
  })

  it('extracts FIT files two levels deep', async () => {
    const level2 = zipSync({ 'deep.fit': FIT_A })
    const outer = zipSync({ 'l1.zip': zipSync({ 'l2.zip': level2 }) })
    const { files, errors } = await collect(new File([outer], 'outer.zip'))
    expect(namesOf(files)).toEqual(['l1.zip/l2.zip/deep.fit'])
    expect(errors).toEqual([])
  })

  it('reports a zip nested three levels deep and still reads the shallower files', async () => {
    const level3 = zipSync({ 'x.fit': FIT_A })
    const level2 = zipSync({ 'l3.zip': level3, 'ok.fit': FIT_B })
    const outer = zipSync({ 'l1.zip': zipSync({ 'l2.zip': level2 }) })
    const { files, errors } = await collect(new File([outer], 'outer.zip'))
    expect(namesOf(files)).toEqual(['l1.zip/l2.zip/ok.fit'])
    expect(errors).toEqual([
      { fileName: 'l1.zip/l2.zip/l3.zip', reason: 'Nested archives are too deep' },
    ])
  })

  it('reports a corrupt nested zip under its path and keeps the other entries', async () => {
    const outer = zipSync({ 'bad.zip': NOT_GZIP, 'ok.fit': FIT_A })
    const { files, errors } = await collect(new File([outer], 'outer.zip'))
    expect(namesOf(files)).toEqual(['ok.fit'])
    expect(errors).toEqual([{ fileName: 'bad.zip', reason: 'Could not read archive' }])
  })

  it('counts entries inside a nested zip against the same entry limit', async () => {
    const outer = zipSync({ 'inner.zip': zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B }) })
    const { files, errors } = await collect(new File([outer], 'outer.zip'), {
      maxArchiveEntries: 2,
    })
    expect(namesOf(files)).toEqual(['inner.zip/a.fit'])
    expect(errors).toEqual([
      { fileName: 'inner.zip/b.fit', reason: 'Archive exceeds the 2-entry limit' },
    ])
  })

  it('counts the entries of a nested zip as the archive streams them, in the order they come', async () => {
    const outer = zipSync({
      'inner.zip': zipSync({ 'b.fit': FIT_B }),
      'c.fit': FIT_C,
      'd.fit': FIT_A,
    })
    const { files, errors } = await collect(new File([outer], 'outer.zip'), {
      maxArchiveEntries: 2,
    })
    // inner.zip is the first entry and its b.fit the second, so c.fit is the one past the limit.
    expect(namesOf(files)).toEqual(['inner.zip/b.fit'])
    expect(errors).toEqual([{ fileName: 'c.fit', reason: 'Archive exceeds the 2-entry limit' }])
  })

  it('does not read a zip inside an archive that has already stopped, so it adds no error', async () => {
    const outer = zipSync({
      'c.fit': FIT_C,
      'd.fit': FIT_A,
      'inner.zip': zipSync({ 'b.fit': FIT_B, 'e.fit': FIT_A }),
    })
    const { files, errors } = await collect(new File([outer], 'outer.zip'), {
      maxArchiveEntries: 1,
    })
    expect(namesOf(files)).toEqual(['c.fit'])
    expect(errors).toEqual([{ fileName: 'd.fit', reason: 'Archive exceeds the 1-entry limit' }])
  })

  it('counts bytes inside a nested zip against the same total limit', async () => {
    const inner = zipSync({ 'a.fit': FIT_A })
    const outer = zipSync({ 'inner.zip': inner })
    const reason = `Archive expands to more than ${inner.length} bytes`
    const { files, errors } = await collect(new File([outer], 'outer.zip'), {
      maxTotalDecompressedBytes: inner.length,
    })
    expect(files).toEqual([])
    expect(errors).toEqual([{ fileName: 'inner.zip/a.fit', reason }])
  })

  it('reports a total limit in GB, MB or bytes', () => {
    expect(expandsReason(DEFAULT_EXTRACT_LIMITS.maxTotalDecompressedBytes)).toBe(
      'Archive expands to more than 2 GB',
    )
    expect(expandsReason(3 * 1024 ** 2)).toBe('Archive expands to more than 3 MB')
    expect(expandsReason(14)).toBe('Archive expands to more than 14 bytes')
  })

  it('uses no error handler unless one is given', async () => {
    const summary = await extractFitFiles(new File([TEXT], 'notes.bin'), () => undefined)
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
  })

  it('limits a single .fit file by the total and entry sizes', async () => {
    const total = await collect(new File([FIT_A], 'total.fit'), { maxTotalDecompressedBytes: 5 })
    expect(total.files).toEqual([])
    expect(total.errors).toEqual([
      { fileName: 'total.fit', reason: 'Archive expands to more than 5 bytes' },
    ])
    const entry = await collect(new File([FIT_A], 'entry.fit'), { maxEntryBytes: 5 })
    expect(entry.errors).toEqual([
      { fileName: 'entry.fit', reason: 'File exceeds the 5-byte limit' },
    ])
  })

  it('reserves room for the copy made when a single gzip file is joined', async () => {
    const { files, errors } = await collect(new File([gzipSync(FIT_A)], 'joined.fit.gz'), {
      maxBufferedBytes: 20,
    })
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'joined.fit.gz', reason: 'Buffered data exceeds the 20-byte limit' },
    ])
  })

  it('reserves room for the copy made when a zip entry is joined', async () => {
    const zip = zipSync({ 'a.fit': FIT_A }, { level: 0 })
    const { files, errors } = await collect(new File([zip], 'joined.zip'), { maxBufferedBytes: 20 })
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'a.fit', reason: 'Buffered data exceeds the 20-byte limit' },
    ])
  })

  it('applies the entry, total and buffer limits to a gzipped FIT inside a zip', async () => {
    const zip = zipSync({ 'bomb.fit.gz': gzipSync(new Uint8Array(10_000)) })
    const entry = await collect(new File([zip], 'gz.zip'), { maxEntryBytes: 1024 })
    expect(entry.errors).toEqual([
      { fileName: 'bomb.fit.gz', reason: 'Decompressed file exceeds the 1024-byte limit' },
    ])
    const total = await collect(new File([zip], 'gz.zip'), { maxTotalDecompressedBytes: 1000 })
    expect(total.files).toEqual([])
    expect(total.errors).toEqual([
      { fileName: 'bomb.fit.gz', reason: 'Archive expands to more than 1000 bytes' },
    ])
    const buffered = await collect(new File([zip], 'gz.zip'), { maxBufferedBytes: 1000 })
    expect(buffered.errors).toEqual([
      { fileName: 'bomb.fit.gz', reason: 'Buffered data exceeds the 1000-byte limit' },
    ])
  })

  it('enforces the entry, total and buffer limits on streamed zip entries', async () => {
    const zip = streamedZip({ 'big.fit': noise(5000) })
    const entry = await collect(new File([zip], 'streamed.zip'), { maxEntryBytes: 1000 })
    expect(entry.errors).toEqual([
      { fileName: 'big.fit', reason: 'Archive entry exceeds the 1000-byte limit' },
    ])
    const total = await collect(new File([zip], 'streamed.zip'), {
      maxTotalDecompressedBytes: 1000,
    })
    expect(total.errors).toEqual([
      { fileName: 'big.fit', reason: 'Archive expands to more than 1000 bytes' },
    ])
    const buffered = await collect(new File([zip], 'streamed.zip'), { maxBufferedBytes: 1000 })
    expect(buffered.errors).toEqual([
      { fileName: 'big.fit', reason: 'Buffered data exceeds the 1000-byte limit' },
    ])
  })

  it('reads a streamed zip entry, gzipped or not, with the same result', async () => {
    const zip = streamedZip({ 'a.fit': FIT_A, 'b.fit.gz': gzipSync(FIT_B) })
    const { files, errors } = await collect(new File([zip], 'streamed.zip'))
    expect(files).toEqual([
      { fileName: 'a.fit', bytes: FIT_A },
      { fileName: 'b.fit', bytes: FIT_B },
    ])
    expect(errors).toEqual([])
  })

  it('reports an entry left open when the stream fails part way through it', async () => {
    const zip = zipSync({ 'a.fit': noise(200) }, { level: 0 })
    const source: FitSource = {
      name: 'broken.zip',
      arrayBuffer: async () => zip.slice().buffer,
      stream: () => {
        let sent = false
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true
              controller.enqueue(zip.slice(0, 100))
              return
            }
            controller.error(new Error('network dropped'))
          },
        })
      },
    }
    const { files, errors } = await collect(source)
    expect(files).toEqual([])
    expect(errors).toEqual([
      { fileName: 'a.fit', reason: 'Could not read this file' },
      { fileName: 'broken.zip', reason: 'Could not read this file' },
    ])
  })

  it('reports a rejected entry even when the error handler throws', async () => {
    const zip = zipSync({ 'big.fit': noise(40) }, { level: 0 })
    await expect(
      extractFitFiles(
        new File([zip], 'handler.zip'),
        () => undefined,
        () => {
          throw new Error('log full')
        },
        { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 32 },
      ),
    ).rejects.toThrow('log full')
  })

  it('treats a zip with only a 4-byte header as unreadable, not empty', async () => {
    const { files, errors } = await collect(
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'stub.zip'),
    )
    expect(files).toEqual([])
    expect(errors).toEqual([{ fileName: 'stub.zip', reason: 'Could not read archive' }])
  })

  it('accepts an empty zip without reporting an error', async () => {
    const { files, summary, errors } = await collect(new File([zipSync({})], 'empty.zip'))
    expect(files).toEqual([])
    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
    expect(errors).toEqual([])
  })

  it('reports how many entries a corrupted local header in the middle costs', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B, 'c.fit': FIT_C }, { level: 0 })
    const second = localHeaderOffsets(zip)[1]!
    zip[second + 2] = 0
    const { files, errors } = await collect(new File([zip], 'mid.zip'))
    expect(namesOf(files)).toEqual(['a.fit', 'c.fit'])
    expect(errors).toEqual([
      {
        fileName: 'mid.zip',
        reason: '1 entries could not be read because the archive is damaged',
      },
    ])
  })

  it('gives the entries a damaged archive lost the corrupt code, with their count as the detail', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B, 'c.fit': FIT_C }, { level: 0 })
    const second = localHeaderOffsets(zip)[1]!
    zip[second + 2] = 0
    const rejected: { reason: string; code: string; detail?: string }[] = []
    await extractFitFiles(
      new File([zip], 'mid.zip'),
      () => undefined,
      (_fileName, rejection) => {
        rejected.push(rejection)
      },
      DEFAULT_EXTRACT_LIMITS,
    )
    expect(rejected).toEqual([
      {
        reason: '1 entries could not be read because the archive is damaged',
        code: 'corrupt',
        detail: '1',
      },
    ])
  })

  it('counts every entry a damaged archive lost, not just one', async () => {
    const zip = zipSync(
      { 'a.fit': FIT_A, 'b.fit': FIT_B, 'c.fit': FIT_C, 'd.fit': FIT_A },
      { level: 0 },
    )
    const offsets = localHeaderOffsets(zip)
    zip[offsets[1]! + 2] = 0
    zip[offsets[2]! + 2] = 0
    const rejected: { reason: string; code: string; detail?: string }[] = []
    await extractFitFiles(
      new File([zip], 'two-lost.zip'),
      () => undefined,
      (_fileName, rejection) => {
        rejected.push(rejection)
      },
      DEFAULT_EXTRACT_LIMITS,
    )
    expect(rejected).toEqual([
      {
        reason: '2 entries could not be read because the archive is damaged',
        code: 'corrupt',
        detail: '2',
      },
    ])
  })

  it('gives an entry over the byte limit the too-large code, with the limit in bytes as the detail', async () => {
    const rejected: { reason: string; code: string; detail?: string }[] = []
    await extractFitFiles(
      new File([zipSync({ 'a.fit': FIT_A })], 'big.zip'),
      () => undefined,
      (_fileName, rejection) => {
        rejected.push(rejection)
      },
      { ...DEFAULT_EXTRACT_LIMITS, maxEntryBytes: 10 },
    )
    expect(rejected).toEqual([
      { reason: 'Archive entry exceeds the 10-byte limit', code: 'too-large', detail: '10' },
    ])
  })

  it('trusts the headers of the directory over an end record whose count lies', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B }, { level: 0 })
    new DataView(zip.buffer, zip.byteOffset, zip.byteLength).setUint16(
      zip.length - 22 + 10,
      5,
      true,
    )
    const { files, errors } = await collect(new File([zip], 'lying.zip'))
    expect(namesOf(files)).toEqual(['a.fit', 'b.fit'])
    expect(errors).toEqual([])
  })

  it('reports a truncated zip as damaged, keeping the entries it has', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B }, { level: 0 })
    const { files, errors } = await collect(new File([zip.slice(0, zip.length - 10)], 't.zip'))
    expect(namesOf(files)).toEqual(['a.fit', 'b.fit'])
    expect(errors).toEqual([{ fileName: 't.zip', reason: DAMAGED }])
  })

  it('reports nothing for a valid zip', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B }, { level: 0 })
    const { errors } = await collect(new File([zip], 'valid.zip'))
    expect(errors).toEqual([])
  })

  it('reads a ZIP64 archive and reports nothing when it is intact', async () => {
    const { files, errors } = await collect(
      new File([toZip64(zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B }))], 'big.zip'),
    )
    expect(namesOf(files)).toEqual(['a.fit', 'b.fit'])
    expect(errors).toEqual([])
  })

  it('counts a lost entry in a ZIP64 archive from the ZIP64 record', async () => {
    const zip = zipSync({ 'a.fit': FIT_A, 'b.fit': FIT_B, 'c.fit': FIT_C }, { level: 0 })
    zip[localHeaderOffsets(zip)[1]! + 2] = 0
    const { files, errors } = await collect(new File([toZip64(zip)], 'big-mid.zip'))
    expect(namesOf(files)).toEqual(['a.fit', 'c.fit'])
    expect(errors).toEqual([
      {
        fileName: 'big-mid.zip',
        reason: '1 entries could not be read because the archive is damaged',
      },
    ])
  })

  it('reports damage when the ZIP64 locator or record is missing or unreadable', async () => {
    const zip = toZip64(zipSync({ 'a.fit': FIT_A }))
    const locator = zip.length - 22 - 20
    const recordAt = zip.length - 22 - 20 - 56
    const noLocator = zip.slice()
    noLocator[locator] = 0
    const badPointer = zip.slice()
    new DataView(badPointer.buffer).setBigUint64(locator + 8, BigInt(0xffffffff), true)
    const badRecord = zip.slice()
    badRecord[recordAt] = 0
    for (const broken of [noLocator, badPointer, badRecord]) {
      const { errors } = await collect(new File([broken], 'big-broken.zip'))
      expect(errors).toEqual([{ fileName: 'big-broken.zip', reason: DAMAGED }])
    }
  })

  it('reports damage when the end-of-central-directory record is gone', async () => {
    const zip = zipSync({ 'a.fit': FIT_A }, { level: 0 })
    zip[zip.length - 22] = 0
    const { files, errors } = await collect(new File([zip], 'no-end.zip'))
    expect(namesOf(files)).toEqual(['a.fit'])
    expect(errors).toEqual([{ fileName: 'no-end.zip', reason: DAMAGED }])
  })
})

describe('extractFitFiles drains skipped zip entries', () => {
  it('starts a skipped non-activity entry so its bytes are discarded, not buffered', async () => {
    unzipSpy.started.length = 0
    const zip = zipSync({
      'media/x.jpg': [noise(20 * 1024 * 1024), { level: 0 }],
      'activities/a.fit': FIT_A,
    })
    const { files, summary, errors } = await collect(new File([zip], 'export.zip'))
    expect(namesOf(files)).toEqual(['activities/a.fit'])
    expect(summary).toEqual({ fitFiles: 1, otherActivityFiles: 0, notActivities: 0 })
    expect(errors).toEqual([])
    expect(unzipSpy.started).toContain('media/x.jpg')
  })

  it('starts an oversized activity entry it rejects, so it is drained too', async () => {
    unzipSpy.started.length = 0
    const zip = zipSync({ 'activities/big.fit': [noise(20 * 1024), { level: 0 }] })
    const { errors } = await collect(new File([zip], 'big.zip'), { maxEntryBytes: 1024 })
    expect(errors).toEqual([
      {
        fileName: 'activities/big.fit',
        reason: 'Archive entry exceeds the 1024-byte limit',
      },
    ])
    expect(unzipSpy.started).toContain('activities/big.fit')
  })
})
