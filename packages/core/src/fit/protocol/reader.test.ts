import { describe, expect, it } from 'vitest'
import { definition, fitFile, int } from './fitBytes'
import { scanFit } from './reader'
import type { FitMessage } from './reader'

const RECORD = 20
const TIMESTAMP_FIELD = [253, 4, 0x86] as const
const HEART_RATE = [3, 1, 0x02] as const

/** Scans a file and returns its messages with the scan report. */
function scan(bytes: Uint8Array) {
  const messages: FitMessage[] = []
  const report = scanFit(bytes, (message) => {
    messages.push(message)
    return true
  })
  return { messages, report }
}

describe('FIT file framing', () => {
  it('reads a 12-byte header with no header CRC', () => {
    const file = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150], { headerSize: 12 })
    const { messages, report } = scan(file)
    expect(report.errors).toEqual([])
    expect(report.crcValid).toBe(true)
    expect(messages.map((m) => m.values.get(3))).toEqual([150])
  })

  it('accepts a 14-byte header whose CRC is zero, which means not checked', () => {
    const file = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150], { headerCrc: 0 })
    expect(scan(file).report.errors).toEqual([])
  })

  it('reports a header CRC that does not match', () => {
    const file = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150], { headerCrc: 0x1234 })
    expect(scan(file).report.errors).toContain('Header checksum mismatch')
  })

  it('reports a file CRC that does not match, with the records still read', () => {
    const file = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150])
    file[file.length - 1] = file[file.length - 1]! ^ 0xff
    const { report } = scan(file)
    expect(report.crcValid).toBe(false)
    expect(report.errors).toEqual(['Checksum mismatch'])
  })

  it('reports a file that ends inside its data section as truncated', () => {
    const file = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150, 0, 151])
    const cut = file.slice(0, file.length - 5)
    const { report } = scan(cut)
    expect(report.errors).toContain('File is truncated')
    expect(report.crcValid).toBe(false)
  })

  it('reports a data message for a local message type that was never defined', () => {
    const { report, messages } = scan(fitFile([0, 150]))
    expect(report.errors).toEqual(['A message uses a local message type that was never defined'])
    expect(messages).toEqual([])
  })

  it('stops at the first error and reads nothing after it', () => {
    const data = [...definition(0, RECORD, [HEART_RATE]), 0, 150, 7, 0, 0, 0, 0, 0, 0]
    const { messages, report } = scan(fitFile(data))
    expect(messages.length).toBe(1)
    expect(report.errors.length).toBe(1)
  })

  it('reports trailing bytes after a chained second file as a warning and does not decode it', () => {
    const first = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 150])
    const second = fitFile([...definition(0, RECORD, [HEART_RATE]), 0, 99])
    const chained = Uint8Array.from([...first, ...second])
    const { messages, report } = scan(chained)
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual(['trailing data'])
    expect(report.crcValid).toBe(true)
    expect(messages.map((m) => m.values.get(3))).toEqual([150])
  })

  it('rejects a header size other than 12 or 14', () => {
    const file = fitFile([])
    file[0] = 13
    expect(scan(file).report.errors).toEqual(['Unsupported FIT header size'])
  })

  it('reports bytes without the .FIT signature as not a FIT file', () => {
    const file = fitFile([])
    file[8] = 0
    expect(scan(file).report.errors).toEqual(['Not a FIT file'])
  })
})

describe('record headers', () => {
  it('expands a compressed timestamp from the last full timestamp, rolling over 5 bits', () => {
    // Full timestamp 1000 (low five bits 8). Offset 10 is 2 later; offset 5 rolls over to 27 later.
    const data = [
      ...definition(0, RECORD, [TIMESTAMP_FIELD]),
      ...definition(1, RECORD, [HEART_RATE]),
      0,
      ...int(1000, 4),
      0xa0 | 10,
      140,
      0xa0 | 5,
      141,
    ]
    const times = scan(fitFile(data)).messages.map((m) => m.values.get(253))
    expect(times).toEqual([1000, 1002, 1029])
  })

  it('uses bit 4 of the compressed-header offset, so an offset of 20 is 12 s after 8', () => {
    // Full timestamp 1000 (low five bits 8). Offset 20 uses bit 4, so the step is (20 - 8) = 12.
    const data = [
      ...definition(0, RECORD, [TIMESTAMP_FIELD]),
      ...definition(1, RECORD, [HEART_RATE]),
      0,
      ...int(1000, 4),
      0xa0 | 20,
      140,
    ]
    const times = scan(fitFile(data)).messages.map((m) => m.values.get(253))
    expect(times).toEqual([1000, 1012])
  })

  it('reads a definition whose fields end exactly at the end of the data', () => {
    const { messages, report } = scan(fitFile(definition(0, RECORD, [HEART_RATE])))
    expect(report.errors).toEqual([])
    expect(report.crcValid).toBe(true)
    expect(messages).toEqual([])
  })

  it('reads a compressed header only after a full timestamp has been seen', () => {
    const data = [...definition(1, RECORD, [HEART_RATE]), 0xa0 | 4, 140]
    const { messages, report } = scan(fitFile(data))
    expect(report.errors).toEqual([])
    expect(messages[0]?.values.get(253)).toBeUndefined()
    expect(messages[0]?.values.get(3)).toBe(140)
  })

  it('skips developer field bytes, which are not interpreted', () => {
    const data = [
      ...definition(2, RECORD, [HEART_RATE], { dev: [[0, 2, 0]] }),
      2,
      120,
      0xaa,
      0xbb,
      2,
      130,
      0xcc,
      0xdd,
    ]
    const { messages, report } = scan(fitFile(data))
    expect(report.errors).toEqual([])
    expect(messages.map((m) => m.values.get(3))).toEqual([120, 130])
  })

  it('reads big-endian definitions and data', () => {
    const power = [7, 2, 0x84] as const
    const data = [...definition(0, RECORD, [power], { endian: 'big' }), 0, ...int(300, 2, 'big')]
    const { messages } = scan(fitFile(data))
    expect(messages.map((m) => m.values.get(7))).toEqual([300])
  })

  it('does not read past the end of the data when a definition runs off the end', () => {
    const { report } = scan(fitFile([0x40, 0, 0, 0x14]))
    expect(report.errors.length).toBeGreaterThan(0)
  })
})
