import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractFitFiles } from './archive'

/** Memory held while many zips nested in a zip are read: what one needs is let go when it is done. */

const MIB = 1024 * 1024
const COUNT = 5000
/** The zips are junk: 80 KB of zeros each, which deflates to nothing and is no zip. */
const JUNK_BYTES = 80_000

const host = globalThis as {
  gc?: () => void
  process?: { memoryUsage(): { heapUsed: number; arrayBuffers: number } }
}

/** What the process holds after a collection: heap and array buffers. */
function held(): number {
  host.gc?.()
  const { heapUsed, arrayBuffers } = host.process!.memoryUsage()
  return heapUsed + arrayBuffers
}

describe('reading zips nested in a zip', () => {
  it.skipIf(host.gc === undefined)(
    `holds no more after ${COUNT} junk zips than after a fifth of them`,
    async () => {
      const entries: Record<string, Uint8Array> = {}
      for (let i = 0; i < COUNT; i++) entries[`n${i}.zip`] = new Uint8Array(JUNK_BYTES)
      const outer = new Uint8Array(zipSync(entries))
      const samples: number[] = []
      let errors = 0
      await extractFitFiles(
        new File([outer], 'outer.zip'),
        () => undefined,
        () => {
          errors++
          if (errors === COUNT / 5 || errors === COUNT) samples.push(held())
        },
      )

      expect(outer.length).toBeLessThan(2 * MIB)
      expect(errors).toBe(COUNT)
      const [early, late] = samples as [number, number]
      // Each leaked zip held about 80 KB of its end: 431 MiB of growth before they were let go, none after.
      expect(late - early).toBeLessThan(16 * MIB)
    },
    120_000,
  )
})
