import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { MAX_GARMIN_SUMMARY_BYTES, MAX_GARMIN_SUMMARY_OBJECTS, readGarminList } from './garminList'
import { realisticSummary, SUMMARY_START_MS, SUMMARY_STEP_MS } from './garminTestFiles'

/** The largest summary a real account is allowed: about 5,000 activities, 15.6 MiB, read from a zip. */

const COUNT = 5000
const READ_BUDGET_MS = 3000
const RETAINED_BUDGET_BYTES = 64 * 1024 * 1024

const host = globalThis as {
  gc?: () => void
  process?: { memoryUsage(): { heapUsed: number } }
}

describe('reading a summary at the size cap', () => {
  it('reads all 5,000 activities within its time budget, and keeps only the list', async () => {
    const text = realisticSummary(COUNT)
    expect(text.length).toBeGreaterThan(MAX_GARMIN_SUMMARY_BYTES * 0.9)
    expect(text.length).toBeLessThan(MAX_GARMIN_SUMMARY_BYTES)
    expect(text.split('{').length - 1).toBeLessThan(MAX_GARMIN_SUMMARY_OBJECTS / 5)
    const zip = new File(
      [
        new Uint8Array(
          zipSync({ 'DI_CONNECT/DI-Connect-Fitness/a_0_summarizedActivities.json': strToU8(text) }),
        ),
      ],
      'export.zip',
    )
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const started = performance.now()
    const list = await readGarminList(zip)
    const elapsed = performance.now() - started

    expect(list?.activities).toHaveLength(COUNT)
    expect(list?.activities[COUNT - 1]).toEqual({
      startMs: SUMMARY_START_MS + (COUNT - 1) * SUMMARY_STEP_MS,
      name: `Activity number ${COUNT - 1}`,
      sport: 'run',
    })
    expect(elapsed).toBeLessThan(READ_BUDGET_MS)
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      // Only the list survives a collection, not the text or the parsed tree.
      host.gc()
      expect(host.process.memoryUsage().heapUsed - heapBefore).toBeLessThan(RETAINED_BUDGET_BYTES)
    }
  }, 60_000)
})
