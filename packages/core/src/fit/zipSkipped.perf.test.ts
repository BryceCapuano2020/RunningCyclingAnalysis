import { zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { MIB } from '../constants'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import { StoppableInflate } from './stoppableInflate'

const FIT = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])

/** A real bomb at the size the limits were set against: 100 MiB of zeros in under a megabyte of zip. */
describe('a skipped entry of 100 MiB of zeros', () => {
  it('is stopped by the limits a build ships with, and the file after it is read', async () => {
    const stop = vi.spyOn(StoppableInflate.prototype, 'terminate')
    const zip = zipSync({ 'media/zeros.bin': new Uint8Array(100 * MIB), 'a.fit': FIT })
    expect(zip.length).toBeLessThan(1 * MIB)
    const files: string[] = []
    await extractFitFiles(
      {
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
      },
      (file) => {
        files.push(file.fileName)
      },
      () => undefined,
      DEFAULT_EXTRACT_LIMITS,
    )
    expect(stop).toHaveBeenCalledTimes(1)
    expect(files).toEqual(['a.fit'])
  })
})
