import { deflateSync, Inflate, Unzip, zipSync } from 'fflate'
import type { UnzipFile, Zippable } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import type { FitFile } from './archive'
import { StoppableInflate } from './stoppableInflate'
import { discardingDecoder, registerDiscarder } from './unsupportedMethods'
import { newBudget, skipEntry, ZipRun } from './zipRun'
import type { Sink } from './zipRun'
import { StreamTail } from './streamTail'
import { streamedZip } from './zipTestFiles'
import { MAX_SKIPPED_ENTRY_FREE_BYTES, MAX_SKIPPED_INFLATE_RATIO } from '../import/limits'
import type { ExtractLimits } from './extractLimits'
import type { Rejection } from '../import/result'
import { MIB } from '../constants'

/** Sizes here are small on purpose: the limits are passed in, and the shipped ones are tested apart. */
const KIB = 1024
const FIT = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])

/** Pseudo-random bytes, which deflate hardly at all. */
function noise(length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = 12345
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
}

/** A zip as a source that streams in pieces of 64 KiB. */
function memorySource(zip: Uint8Array) {
  return {
    name: 'export.zip',
    arrayBuffer: async () => zip.slice().buffer,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let at = 0; at < zip.length; at += 64 * 1024) {
            controller.enqueue(zip.slice(at, at + 64 * 1024))
          }
          controller.close()
        },
      }),
  }
}

async function extract(zip: Uint8Array, limits: Partial<ExtractLimits> = {}) {
  const files: FitFile[] = []
  const errors: Array<{ fileName: string; rejection: Rejection }> = []
  await extractFitFiles(
    memorySource(zip),
    (file) => {
      files.push(file)
    },
    (fileName, rejection) => errors.push({ fileName, rejection }),
    { ...DEFAULT_EXTRACT_LIMITS, ...limits },
  )
  return { files, errors }
}

afterEach(() => vi.restoreAllMocks())

describe('a skipped zip entry that inflates past its budget', () => {
  it('is stopped once it has passed its free bytes at a ratio no real file has', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = zipSync({ 'media/zeros.bin': new Uint8Array(1 * MIB), 'a.fit': FIT })
    const { files, errors } = await extract(zip, { maxSkippedEntryFreeBytes: 64 * KIB })
    expect(stop).toHaveBeenCalledTimes(1)
    // It is not an error: the import never wanted the entry, and the file after it is read.
    expect(errors).toEqual([])
    expect(files.map((f) => f.fileName)).toEqual(['a.fit'])
  })

  it('is left alone when it stays inside its free bytes, however well it compresses', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = zipSync({ 'media/zeros.bin': new Uint8Array(256 * KIB), 'a.fit': FIT })
    await extract(zip, { maxSkippedEntryFreeBytes: 512 * KIB })
    expect(stop).not.toHaveBeenCalled()
  })

  it('is left alone past its free bytes when it does not compress like that', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = zipSync({ 'media/noise.bin': noise(256 * KIB), 'a.fit': FIT })
    await extract(zip, { maxSkippedEntryFreeBytes: 128 * KIB })
    expect(stop).not.toHaveBeenCalled()
  })

  it('is stopped inside a zip nested in the export too', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const inner = zipSync({ 'media/zeros.bin': new Uint8Array(1 * MIB), 'b.fit': FIT })
    const outer = zipSync({ 'inner.zip': [inner, { level: 0 }], 'a.fit': FIT })
    const { files } = await extract(outer, { maxSkippedEntryFreeBytes: 64 * KIB })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(files.map((f) => f.fileName).sort()).toEqual(['a.fit', 'inner.zip/b.fit'])
  })

  it('counts against a total for the whole source, names the entry, and reads the files after it', async () => {
    const zip = zipSync({
      'a.fit': FIT,
      'media/one.bin': new Uint8Array(512 * KIB),
      'media/two.bin': new Uint8Array(512 * KIB),
      'media/three.bin': new Uint8Array(512 * KIB),
      'b.fit': FIT,
    })
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    // The free bytes are the whole entry and the ratio is high, so only the total can stop it.
    const { files, errors } = await extract(zip, {
      maxSkippedEntryFreeBytes: 100 * MIB,
      maxSkippedGlobalFreeBytes: 100 * MIB,
      maxSkippedInflateBytes: 768 * KIB,
    })
    // Skipping costs nothing once the budget is out, and a skipped entry is not wanted: both fit files are read.
    expect(files.map((f) => f.fileName).sort()).toEqual(['a.fit', 'b.fit'])
    expect(errors.map((e) => e.fileName)).toEqual(['media/two.bin'])
    expect(errors[0]!.rejection.code).toBe('too-large')
    // The entry that ran it out was stopped. The ones after it were started stopped, so there was nothing to stop.
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('inflates nothing of the skipped entries after the budget has run out, not even their first piece', async () => {
    const entries: Zippable = { 'a.fit': FIT }
    for (let i = 0; i < 6; i++) entries[`media/${i}.bin`] = new Uint8Array(512 * KIB)
    // Stored, so that the only thing reaching the inflater is a skipped entry.
    entries['b.fit'] = [FIT, { level: 0 }]
    const inflate = vi.spyOn(Inflate.prototype, 'push')
    let atExhaustion = -1
    const files: string[] = []
    await extractFitFiles(
      memorySource(zipSync(entries)),
      (file) => {
        files.push(file.fileName)
      },
      () => {
        atExhaustion = inflate.mock.calls.length
      },
      {
        ...DEFAULT_EXTRACT_LIMITS,
        maxSkippedEntryFreeBytes: 100 * MIB,
        maxSkippedInflateBytes: 768 * KIB,
      },
    )
    expect(atExhaustion).toBeGreaterThan(0)
    // No piece of any later entry reached the inflater.
    expect(inflate.mock.calls.length).toBe(atExhaustion)
    expect(files.sort()).toEqual(['a.fit', 'b.fit'])
  })

  it('adds up many entries that each stay under their own allowance, by the ratio of the whole', async () => {
    const entries: Record<string, Uint8Array> = { 'a.fit': FIT }
    for (let i = 0; i < 12; i++) entries[`media/${i}.bin`] = new Uint8Array(256 * KIB)
    entries['b.fit'] = FIT
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const { files, errors } = await extract(zipSync(entries), {
      maxSkippedEntryFreeBytes: 1 * MIB,
      maxSkippedGlobalFreeBytes: 1 * MIB,
      maxSkippedGlobalRatio: 20,
    })
    expect(files.map((f) => f.fileName).sort()).toEqual(['a.fit', 'b.fit'])
    expect(errors).toHaveLength(1)
    expect(errors[0]!.rejection.reason).toMatch(/far more than they are compressed/)
    // From the entry that ran it out on, the rest were started stopped.
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('stops a bomb in a zip written with data descriptors, where the headers give no size', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = streamedZip({ 'media/zeros.bin': new Uint8Array(2 * MIB), 'a.fit': FIT })
    const { files } = await extract(zip, { maxSkippedEntryFreeBytes: 256 * KIB })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(files.map((f) => f.fileName)).toEqual(['a.fit'])
  })

  it('does not count a stored entry, however long', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = zipSync({
      'media/video.mp4': [new Uint8Array(2 * MIB), { level: 0 }],
      'a.fit': FIT,
    })
    const { files, errors } = await extract(zip, {
      maxSkippedEntryFreeBytes: 128 * KIB,
      maxSkippedInflateBytes: 128 * KIB,
    })
    expect(stop).not.toHaveBeenCalled()
    expect(errors).toEqual([])
    expect(files.map((f) => f.fileName)).toEqual(['a.fit'])
  })
})

/** The zip with the method of one entry rewritten, in its local header and in the central directory. */
function withMethod(zip: Uint8Array, name: string, method: number): Uint8Array {
  const out = zip.slice()
  const view = new DataView(out.buffer)
  const bytes = new TextEncoder().encode(name)
  for (let i = 0; i + 46 < out.length; i++) {
    const signature = view.getUint32(i, true)
    const nameAt = signature === 0x04034b50 ? i + 30 : signature === 0x02014b50 ? i + 46 : -1
    if (nameAt < 0 || !bytes.every((b, k) => out[nameAt + k] === b)) continue
    view.setUint16(i + (signature === 0x04034b50 ? 8 : 10), method, true)
  }
  return out
}

/** The bytes a decoder was pushed. */
function pushedBytes(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.reduce((n, [chunk]) => n + (chunk as Uint8Array).length, 0)
}

describe('an entry in a compression method this build cannot read', () => {
  const junk = noise(200 * 1024)

  // 99 is WinZip's AES wrapper; 100 and 65535 are numbers nobody has assigned.
  describe.each([99, 100, 65535])('method %i', (method) => {
    it('is drained and not held, when the import skips it', async () => {
      const push = vi.spyOn(discardingDecoder(method).prototype, 'push')
      const zip = withMethod(
        zipSync({ 'media/secret.bin': [junk, { level: 0 }], 'a.fit': FIT }),
        'media/secret.bin',
        method,
      )
      const { files, errors } = await extract(zip)
      expect(files.map((f) => f.fileName)).toEqual(['a.fit'])
      expect(errors).toEqual([])
      // Every byte of its input went to the decoder that drops it.
      expect(pushedBytes(push)).toBeGreaterThanOrEqual(junk.length)
    })

    it('is reported once and drained too, when it is an activity file', async () => {
      const push = vi.spyOn(discardingDecoder(method).prototype, 'push')
      const zip = withMethod(
        zipSync({ 'rides/lost.fit': [junk, { level: 0 }], 'a.fit': FIT }),
        'rides/lost.fit',
        method,
      )
      const { files, errors } = await extract(zip)
      expect(files.map((f) => f.fileName)).toEqual(['a.fit'])
      expect(errors.map((e) => e.fileName)).toEqual(['rides/lost.fit'])
      expect(pushedBytes(push)).toBeGreaterThanOrEqual(junk.length)
    })
  })

  it('has one decoder for each method, made as it is named, and none for stored or deflate', () => {
    expect(discardingDecoder(7).compression).toBe(7)
    expect(discardingDecoder(7)).toBe(discardingDecoder(7))
    const unzip = new Unzip(() => undefined)
    const register = vi.spyOn(unzip, 'register')
    registerDiscarder(unzip, 0)
    registerDiscarder(unzip, 8)
    expect(register).not.toHaveBeenCalled()
    registerDiscarder(unzip, 40000)
    expect(register).toHaveBeenCalledWith(discardingDecoder(40000))
  })
})

describe('StoppableInflate', () => {
  const gz = deflateSync(new Uint8Array(1 * MIB))

  /** Output a decoder gives, in the pieces it gives it. */
  function collect(decoder: StoppableInflate) {
    const seen = { bytes: 0, errors: 0, final: false }
    decoder.ondata = (error, data, final) => {
      if (error) seen.errors++
      seen.bytes += data.length
      seen.final ||= final
    }
    return seen
  }

  it('inflates what it is given, as fflate does', () => {
    const decoder = new StoppableInflate()
    const seen = collect(decoder)
    decoder.push(gz, true)
    expect(seen).toEqual({ bytes: 1 * MIB, errors: 0, final: true })
  })

  it('gives corrupt data as an error of the entry, not a throw', () => {
    const decoder = new StoppableInflate()
    const seen = collect(decoder)
    expect(() => decoder.push(new Uint8Array([255, 255, 255, 255]), false)).not.toThrow()
    expect(seen.errors).toBe(1)
  })

  it('ignores every push after it is stopped, and gives nothing more', () => {
    const decoder = new StoppableInflate()
    const seen = collect(decoder)
    decoder.push(gz.subarray(0, 20), false)
    const before = seen.bytes
    decoder.terminate()
    decoder.push(gz.subarray(20), true)
    decoder.push(new Uint8Array([255, 255, 255, 255]), true)
    expect(seen.bytes).toBe(before)
    expect(seen.errors).toBe(0)
    expect(seen.final).toBe(false)
  })
})

describe('skipEntry', () => {
  /** A file whose output the test pushes, and a record of what was done to it. */
  function fakeFile() {
    const file = {
      ondata: (() => undefined) as UnzipFile['ondata'],
      start: vi.fn(),
      terminate: vi.fn(),
    }
    return Object.assign(file, { name: 'x', compression: 8 }) as unknown as UnzipFile & typeof file
  }
  const data = (n: number) => new Uint8Array(n)

  function run(limits: Partial<ExtractLimits> = {}) {
    const sink: Sink = {
      summary: { fitFiles: 0, otherActivityFiles: 0, notActivities: 0 },
      onFile: () => undefined,
      onError: () => undefined,
      limits: { ...DEFAULT_EXTRACT_LIMITS, ...limits },
      listed: undefined,
    }
    return new ZipRun(sink, newBudget())
  }

  it('takes the free bytes and the ratio from the limits a build ships with', () => {
    expect(MAX_SKIPPED_ENTRY_FREE_BYTES).toBe(16 * MIB)
    expect(MAX_SKIPPED_INFLATE_RATIO).toBe(100)
    expect(DEFAULT_EXTRACT_LIMITS.maxSkippedEntryFreeBytes).toBe(MAX_SKIPPED_ENTRY_FREE_BYTES)
    expect(DEFAULT_EXTRACT_LIMITS.maxSkippedInflateRatio).toBe(MAX_SKIPPED_INFLATE_RATIO)
  })

  it('stops an entry at the limits a build ships with, one byte past its free bytes at a bomb ratio', () => {
    // Output is only counted, so a length stands for 16 MiB of zeros without making them.
    const bytes = (n: number) => ({ length: n }) as Uint8Array<ArrayBuffer>
    const tail = new StreamTail()
    const file = fakeFile()
    skipEntry(file, run(), tail, () => undefined)
    tail.push(new Uint8Array(20 * 1024))
    file.ondata(null, bytes(MAX_SKIPPED_ENTRY_FREE_BYTES), false)
    expect(file.terminate).not.toHaveBeenCalled()
    file.ondata(null, bytes(1), false)
    expect(file.terminate).toHaveBeenCalledTimes(1)
  })

  it('judges the ratio against the bytes the source streamed since the entry began, not before', () => {
    const limits = { maxSkippedEntryFreeBytes: 1000, maxSkippedInflateRatio: 10 }
    for (const [streamed, stopped] of [
      [100, true], // 1,100 out of 100 in is 11 to 1
      [200, false], // 1,100 out of 200 in is 5.5 to 1
    ] as const) {
      const tail = new StreamTail()
      tail.push(new Uint8Array(5000)) // the source had streamed this much before the entry began
      const file = fakeFile()
      skipEntry(file, run(limits), tail, () => undefined)
      tail.push(new Uint8Array(streamed))
      file.ondata(null, data(900), false)
      file.ondata(null, data(200), false)
      expect(file.terminate).toHaveBeenCalledTimes(stopped ? 1 : 0)
    }
  })

  it('stops an entry past its free bytes at more than the ratio, once', () => {
    const tail = new StreamTail()
    const file = fakeFile()
    skipEntry(
      file,
      run({ maxSkippedEntryFreeBytes: 1000, maxSkippedInflateRatio: 10 }),
      tail,
      () => undefined,
    )
    tail.push(new Uint8Array(100))
    file.ondata(null, data(1000), false)
    expect(file.terminate).not.toHaveBeenCalled()
    file.ondata(null, data(1), false)
    expect(file.terminate).toHaveBeenCalledTimes(1)
    file.ondata(null, data(5000), false)
    expect(file.terminate).toHaveBeenCalledTimes(1)
  })

  it('stops an entry whose decoder fails, once', () => {
    const file = fakeFile()
    skipEntry(file, run(), new StreamTail(), () => undefined)
    file.ondata(Object.assign(new Error('corrupt'), { code: 0 }), data(0), false)
    file.ondata(null, data(10), false)
    expect(file.terminate).toHaveBeenCalledTimes(1)
  })

  it('stops an entry as soon as the archive has stopped', () => {
    const zipRun = run()
    const file = fakeFile()
    skipEntry(file, zipRun, new StreamTail(), () => undefined)
    zipRun.budget.abort = { reason: 'stopped', code: 'too-large' }
    file.ondata(null, data(10), false)
    expect(file.terminate).toHaveBeenCalledTimes(1)
  })
})
