import { describe, expect, it } from 'vitest'
import { parseIsoTime, ZONELESS } from './time'

const MS = Date.UTC(2024, 4, 1, 7, 30)

describe('parseIsoTime', () => {
  it.each([
    ['2024-05-01T07:30:00Z', MS],
    ['2024-05-01T07:30:00.250Z', MS + 250],
    ['2024-05-01T08:30:00+01:00', MS],
    ['2024-05-01T05:30:00-02:00', MS],
  ])('reads %s as the instant it names, with either policy', (text, ms) => {
    expect(parseIsoTime(text, 'utc')).toBe(ms)
    expect(parseIsoTime(text, 'refuse')).toBe(ms)
  })

  it('keeps a year below 100 as written instead of mapping it to the 1900s', () => {
    expect(parseIsoTime('0050-01-01T00:00:00Z', 'utc')).toBe(Date.parse('0050-01-01T00:00:00Z'))
  })

  it('reads a time with no zone as UTC under the utc policy', () => {
    expect(parseIsoTime('2024-05-01T07:30:00', 'utc')).toBe(MS)
    expect(parseIsoTime('2024-05-01T07:30:00.5', 'utc')).toBe(MS + 500)
  })

  it('refuses a time with no zone under the refuse policy', () => {
    expect(parseIsoTime('2024-05-01T07:30:00', 'refuse')).toBe(ZONELESS)
    expect(parseIsoTime('2024-05-01T07:30:00.5', 'refuse')).toBe(ZONELESS)
  })

  it.each([
    '',
    'not a time',
    '2024-05-01T07:30',
    '2024-05-01',
    '2024-02-30T07:30:00Z',
    '2024-05-01T25:00:00Z',
    '2024-05-01T07:30:00+24:00',
  ])('rejects %s under both policies', (text) => {
    expect(parseIsoTime(text, 'utc')).toBeUndefined()
    expect(parseIsoTime(text, 'refuse')).toBeUndefined()
  })
})
