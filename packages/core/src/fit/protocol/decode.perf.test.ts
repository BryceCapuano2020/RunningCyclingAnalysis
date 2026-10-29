import { describe, expect, it } from 'vitest'
import { definition, fitFile, int } from './fitBytes'
import { decodeFit, DEFAULT_MAX_RECORDS } from './decode'
import { MESG } from './profile'
import { parseFit } from '../parse'

const host = globalThis as {
  gc?: () => void
  process?: { memoryUsage(): { heapUsed: number } }
}

/** A file of one definition of 255 fields of no bytes, then `count` data messages of one byte each. */
function emptyMessages(globalNum: number, count: number): Uint8Array {
  const fields = Array.from({ length: 255 }, (_, k) => [k, 0, 0x02] as const)
  const data = [...definition(0, globalNum, fields)]
  for (let i = 0; i < count; i++) data.push(0)
  return fitFile(data)
}

describe('decodeFit performance on hostile files', () => {
  it.each([
    ['event', MESG.event],
    ['unknown', 999],
  ])('stops a 2 MB file of empty %s messages early, in time and in memory', (_name, globalNum) => {
    const file = emptyMessages(globalNum, 2_000_000)
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const start = performance.now()
    const result = decodeFit(file)
    const elapsed = performance.now() - start

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/^Message count exceeds/)
    expect(result.messageCount).toBeLessThan(600_000)
    expect(elapsed).toBeLessThan(2_000)
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      const kept = host.process.memoryUsage().heapUsed - heapBefore
      expect(kept).toBeLessThan(64 * 1024 ** 2)
    }
  })

  it('stops a file with more records than the grid has seconds at the limit, keeping no more', () => {
    const data = [...definition(0, MESG.record, [[253, 4, 0x86]])]
    for (let i = 0; i < 400_000; i++) data.push(0, ...int(1_100_000_000 + i, 4))
    const file = fitFile(data)
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const start = performance.now()
    const result = decodeFit(file)
    const elapsed = performance.now() - start

    expect(result.ok).toBe(false)
    expect(result.recordCount).toBe(DEFAULT_MAX_RECORDS + 1)
    expect(result.messages.records).toHaveLength(DEFAULT_MAX_RECORDS)
    expect(elapsed).toBeLessThan(2_000)
    const refused = parseFit(file, 'too-many.fit')
    expect(refused).toMatchObject({ ok: false, code: 'too-much-data' })
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      const kept = host.process.memoryUsage().heapUsed - heapBefore
      expect(kept).toBeLessThan(128 * 1024 ** 2)
    }
  })
})
