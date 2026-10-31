import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildFit, secondly } from './fit/fitTestFiles'
import { sha256Hex } from './sha256'
import type { FileId, HeldFiles } from './importHeld'
import { AnalysisSession } from './session'
import type { AthleteSettings } from './types'

/**
 * A re-import of an export the index knows, against the first import of it: every file is still read out of the zip and
 * hashed, none is parsed. The split is printed, so the case for skipping on the zip directory's entry (no read, no
 * inflate) can be made from numbers.
 */
const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const FILES = 400
const START_MS = Date.UTC(2023, 0, 2, 7, 0)
const DAY_MS = 86_400_000

function fitBytes(i: number): Uint8Array {
  const startMs = START_MS + i * DAY_MS
  return new Uint8Array(
    buildFit({
      sessions: [
        {
          sport: 'running',
          startMs,
          durationS: 900,
          records: secondly(startMs, 900, {
            speed: 3 + (i % 7) / 10,
            altitude: 50,
            heartRate: 150,
          }),
        },
      ],
    }),
  )
}

describe('re-importing an export the index knows', () => {
  it('is several times faster than the first import, and parses nothing', async () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < FILES; i++) entries[`activities/${i}.fit`] = fitBytes(i)
    const bytes = zipSync(entries, { level: 6 })
    const file = () => new File([new Uint8Array(bytes)], 'export.zip')

    const index = new Map<string, readonly string[]>()
    const id = (f: FileId) => `${f.hash}|${f.size}|${f.meta}`
    const held: HeldFiles = {
      skip: async (f) => index.get(id(f)) ?? null,
      note: (f, keys) => void index.set(id(f), keys),
    }
    const session = new AnalysisSession()
    const t0 = performance.now()
    await session.addFiles(
      [file()],
      SETTINGS,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      held,
    )
    const first = performance.now() - t0
    expect(index.size).toBe(FILES)

    const t1 = performance.now()
    await session.addFiles(
      [file()],
      SETTINGS,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      held,
    )
    const again = performance.now() - t1

    // The cost that is left: reading the zip's entries and hashing them, which skipping on the zip directory would avoid.
    const t2 = performance.now()
    for (const entry of Object.values(entries)) await sha256Hex(entry)
    const hashing = performance.now() - t2
    console.info(
      `re-import of ${FILES} files: first ${first.toFixed(0)} ms, again ${again.toFixed(0)} ms (of which hashing ${hashing.toFixed(0)} ms, the rest reading and inflating the zip)`,
    )
    expect(again).toBeLessThan(first / 3)
  })
})
