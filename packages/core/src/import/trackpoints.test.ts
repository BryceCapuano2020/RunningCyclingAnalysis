import { describe, expect, it } from 'vitest'
import { readNonNegative, readNumber, readPosition, trackFromPoints } from './trackpoints'

describe('readNumber', () => {
  it.each([
    ['12', 12],
    [' -3.5 ', -3.5],
    ['.5', 0.5],
    ['1e3', 1000],
  ])('reads the XML decimal %j as %d', (text, value) => {
    expect(readNumber(text)).toBe(value)
  })

  it.each([undefined, '', '   ', '0x2A', 'NaN', 'Infinity', '1e400', '1,5'])(
    'reads %j as no number',
    (text) => {
      expect(readNumber(text)).toBeUndefined()
    },
  )
})

describe('readNonNegative', () => {
  it('keeps zero and positive values and drops negative ones', () => {
    expect(readNonNegative('0')).toBe(0)
    expect(readNonNegative('180')).toBe(180)
    expect(readNonNegative('-0.5')).toBeUndefined()
    expect(readNonNegative('0x10')).toBeUndefined()
  })
})

describe('readPosition', () => {
  it('reads a position at the limits of latitude and longitude', () => {
    expect(readPosition('-90', '180')).toEqual({ lat: -90, lon: 180 })
  })

  it.each([
    ['90.5', '0'],
    ['0', '180.5'],
    ['0x1', '0'],
    [undefined, '0'],
  ])('refuses latitude %j and longitude %j', (lat, lon) => {
    expect(readPosition(lat, lon)).toBeUndefined()
  })
})

describe('trackFromPoints', () => {
  it('measures only the points that have a position', () => {
    const track = trackFromPoints(
      [
        { tMs: 0, position: { lat: 51, lon: 0 } },
        { tMs: 1000 },
        { tMs: 2000, position: { lat: 51.0001, lon: 0 } },
      ],
      12.5,
    )
    expect(Array.from(track.tMs)).toEqual([0, 2000])
  })

  it('is empty when no point has a position', () => {
    expect(trackFromPoints([{ tMs: 0 }], 12.5).tMs.length).toBe(0)
  })
})
