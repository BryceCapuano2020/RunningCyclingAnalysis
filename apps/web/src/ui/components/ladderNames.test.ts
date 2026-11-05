import { describe, expect, it } from 'vitest'
import { aloneAlignment, nameWidthPx, namesFit } from './ladderNames'

/** Five synthetic bands on a 0 to 100 bar, the first three tenths wide and the rest a tenth each. */
const BANDS = [
  { name: 'Recreational', from: 0, to: 40 },
  { name: 'Local', from: 40, to: 60 },
  { name: 'Regional', from: 60, to: 75 },
  { name: 'National', from: 75, to: 90 },
  { name: 'World', from: 90, to: 100 },
]

describe('the level names line', () => {
  it('measures a name at the meta size, wider at a larger root text size', () => {
    expect(nameWidthPx('Local', 16)).toBeGreaterThan(0)
    expect(nameWidthPx('Local', 32)).toBeCloseTo(nameWidthPx('Local', 16) * 2, 5)
  })

  it('fits every name under its own tick on a wide bar, and not on a narrow one', () => {
    expect(namesFit(BANDS, 900, 16)).toBe(true)
    expect(namesFit(BANDS, 288, 16)).toBe(false)
  })

  it('needs every name to fit, so one long name in a narrow band is enough to name only the current level', () => {
    const tight = [...BANDS.slice(0, -1), { name: 'World', from: 98, to: 100 }]
    expect(namesFit(tight, 900, 16)).toBe(false)
  })

  it('centres a lone name on the mark, and holds it inside the bar near either end', () => {
    expect(aloneAlignment('Local', 50, 300, 16)).toBe('centre')
    expect(aloneAlignment('Recreational', 2, 300, 16)).toBe('start')
    expect(aloneAlignment('World', 99, 300, 16)).toBe('end')
  })
})
