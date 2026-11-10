import { describe, expect, it } from 'vitest'
import { formatLoad } from './load'

describe('formatLoad', () => {
  it('keeps a barbell step in kilograms and drops trailing zeros', () => {
    expect(formatLoad(62.5, 'metric')).toBe('62.5 kg')
    expect(formatLoad(100, 'metric')).toBe('100 kg')
    expect(formatLoad(1234.25, 'metric')).toBe('1,234.25 kg')
  })

  it('reads a load saved from whole pounds back as those pounds', () => {
    expect(formatLoad(102.06, 'imperial')).toBe('225 lb')
    expect(formatLoad(20, 'imperial')).toBe('44.1 lb')
  })

  it('is a dash for no number', () => {
    expect(formatLoad(Number.NaN, 'metric')).toBe('—')
  })
})
