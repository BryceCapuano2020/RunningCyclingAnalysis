import { describe, expect, it } from 'vitest'
import { definition, fitFile, int } from './fitBytes'
import { decodeFit } from './decode'
import { MESG } from './profile'
import { parseFit } from '../parse'
import { buildFit, secondly } from '../fitTestFiles'
import { DEFAULT_PARSE_LIMITS } from '../../import/result'

const host = globalThis as {
  gc?: () => void
  process?: { memoryUsage(): { heapUsed: number } }
}

/** The limits the importer reads a file with. */
const LIMITS = {
  maxRecords: DEFAULT_PARSE_LIMITS.maxRecordMessages,
  maxMessages: DEFAULT_PARSE_LIMITS.maxMessages,
}

/** A file of one definition of 255 fields of no bytes, then `count` data messages of one byte each. */
function emptyMessages(globalNum: number, count: number): Uint8Array {
  const fields = Array.from({ length: 255 }, (_, k) => [k, 0, 0x02] as const)
  const data = [...definition(0, globalNum, fields)]
  for (let i = 0; i < count; i++) data.push(0)
  return fitFile(data)
}

/** A file of `count` record messages with a timestamp each, `perSecond` of them in each second. */
function records(count: number, perSecond: number): Uint8Array {
  const data = [...definition(0, MESG.record, [[253, 4, 0x86]])]
  for (let i = 0; i < count; i++) data.push(0, ...int(1_100_000_000 + Math.floor(i / perSecond), 4))
  return fitFile(data)
}

describe('FIT import performance on hostile files', () => {
  it.each([
    ['event', MESG.event],
    ['unknown', 999],
  ])('stops a 2 MB file of empty %s messages early, in time and in memory', (_name, globalNum) => {
    const file = emptyMessages(globalNum, 2_000_000)
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const start = performance.now()
    const result = decodeFit(file, LIMITS)
    const elapsed = performance.now() - start

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/^Message count exceeds/)
    expect(result.messageCount).toBe(LIMITS.maxMessages + 1)
    expect(elapsed).toBeLessThan(2_000)
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      const kept = host.process.memoryUsage().heapUsed - heapBefore
      expect(kept).toBeLessThan(64 * 1024 ** 2)
    }
    expect(parseFit(file, 'empty.fit')).toMatchObject({ ok: false, code: 'too-much-data' })
  })

  it('stops a file with more records than four times the grid at the limit, keeping no more', () => {
    const file = records(LIMITS.maxRecords + 100_000, 1)
    host.gc?.()
    const heapBefore = host.process?.memoryUsage().heapUsed

    const start = performance.now()
    const result = decodeFit(file, LIMITS)
    const elapsed = performance.now() - start

    expect(result.ok).toBe(false)
    expect(result.recordCount).toBe(LIMITS.maxRecords + 1)
    expect(result.messages.records).toHaveLength(LIMITS.maxRecords)
    expect(elapsed).toBeLessThan(2_000)
    if (host.gc !== undefined && heapBefore !== undefined && host.process !== undefined) {
      const kept = host.process.memoryUsage().heapUsed - heapBefore
      expect(kept).toBeLessThan(256 * 1024 ** 2)
    }
    expect(parseFit(file, 'too-many.fit')).toMatchObject({ ok: false, code: 'too-much-data' })
  })

  it('does not refuse a file with two records a second whose seconds fit the grid', () => {
    // 100,000 seconds at two records a second: 200,000 records, more than the grid has seconds, not more
    // than it has distinct ones.
    const startMs = Date.UTC(2024, 4, 1, 7, 30, 0)
    const twice = secondly(startMs, 100_000, { speed: 3, distance: 0, heartRate: 140 }).flatMap(
      (record, i) => [
        { ...record, distance: i * 3 },
        { ...record, distance: i * 3 + 1.5 },
      ],
    )
    const file = buildFit({
      sessions: [{ sport: 'running', startMs, durationS: 100_000, records: twice }],
    })
    const result = parseFit(file, 'two-hertz.fit')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.activities[0]!.n).toBeGreaterThan(99_000)
  })
})
