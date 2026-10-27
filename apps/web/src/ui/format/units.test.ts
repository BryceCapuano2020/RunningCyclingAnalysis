import { describe, expect, it } from 'vitest'
import { MIB, GIB } from '@rca/core/constants'
import { megabytes, sizeText } from './units'

describe('sizeText: a size a person can read as a limit', () => {
  it('gives a whole number of gigabytes in GB', () => {
    expect(sizeText(2 * GIB)).toBe('2 GB')
  })

  it('gives anything short of a whole gigabyte in MB', () => {
    expect(sizeText(64 * MIB)).toBe('64 MB')
    expect(sizeText(GIB + 512 * MIB)).toBe('1,536 MB')
  })

  it('groups megabytes from a thousand on', () => {
    expect(sizeText(1500 * MIB)).toBe('1,500 MB')
  })

  it('rounds a size that is not a whole number of megabytes', () => {
    expect(sizeText(3 * GIB + 1)).toBe('3,072 MB')
  })
})

describe('megabytes', () => {
  it('counts whole megabytes, rounded', () => {
    expect(megabytes(64 * MIB)).toBe(64)
    expect(megabytes(MIB + MIB / 2)).toBe(2)
  })
})
