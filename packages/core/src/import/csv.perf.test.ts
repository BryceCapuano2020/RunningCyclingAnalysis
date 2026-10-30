import { describe, expect, it } from 'vitest'
import { readCsvRows } from './csv'

/** The field a hostile list could hold, at the size it was measured at: kept out of the unit run. */
describe('readCsvRows on a 32 MiB field', () => {
  const huge = 'y'.repeat(32 * 1024 * 1024)
  const read = (text: string) => {
    const rows: string[][] = []
    const wellFormed = readCsvRows(text, 256, (f) => rows.push(f) > 0)
    return { rows, wellFormed }
  }

  it('refuses it in a line, in a quoted field and as a last field with no line break', () => {
    expect(read(`a,${huge}\n`)).toEqual({ rows: [], wellFormed: false })
    expect(read(`a,"${huge}"\n`)).toEqual({ rows: [], wellFormed: false })
    expect(read(`a,${huge}`)).toEqual({ rows: [], wellFormed: false })
  })
})
