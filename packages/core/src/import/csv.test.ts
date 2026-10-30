import { describe, expect, it } from 'vitest'
import { readCsvRows } from './csv'
import { MAX_CSV_FIELD_CHARS } from './limits'

/** A cell cap small enough to write a row past it by hand. */
const CAP = 3

/** The rows of some text, and whether the text read as well formed. The default cap is no cap. */
function rowsOf(
  text: string,
  maxCells = Number.POSITIVE_INFINITY,
): { rows: string[][]; wellFormed: boolean } {
  const rows: string[][] = []
  const wellFormed = readCsvRows(text, maxCells, (fields) => {
    rows.push(fields)
    return true
  })
  return { rows, wellFormed }
}

describe('readCsvRows', () => {
  it('reads each line as a row of fields', () => {
    expect(rowsOf('a,b,c\n1,2,3\n').rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('accepts CRLF and CR line endings, and no final line break', () => {
    expect(rowsOf('a,b\r\n1,2\r3,4').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('keeps commas, line breaks and doubled quotes inside a quoted field', () => {
    expect(rowsOf('id,name\r\n1,"Run, ""hard""\nthen easy"\r\n').rows).toEqual([
      ['id', 'name'],
      ['1', 'Run, "hard"\nthen easy'],
    ])
  })

  it('drops a leading byte order mark', () => {
    expect(rowsOf('﻿Activity ID,Filename\n1,activities/1.fit\n').rows).toEqual([
      ['Activity ID', 'Filename'],
      ['1', 'activities/1.fit'],
    ])
  })

  it('keeps empty fields and skips blank lines', () => {
    expect(rowsOf('a,,c\n\n1,\n').rows).toEqual([
      ['a', '', 'c'],
      ['1', ''],
    ])
  })

  it('reads a quote that does not open a field as an ordinary character', () => {
    expect(rowsOf('5" run,ride\n').rows).toEqual([['5" run', 'ride']])
  })

  it('returns no rows for empty text, which is well formed', () => {
    expect(rowsOf('')).toEqual({ rows: [], wellFormed: true })
  })

  it('reports text that ends inside a quoted field as not well formed', () => {
    expect(rowsOf('a,"unclosed\n1,2\n').wellFormed).toBe(false)
    expect(rowsOf('a,"closed"\n').wellFormed).toBe(true)
  })

  it('stops when the row callback says so, and that is not a failure', () => {
    let seen = 0
    const wellFormed = readCsvRows('a\nb\nc\n', Number.POSITIVE_INFINITY, () => {
      seen++
      return seen < 2
    })
    expect(seen).toBe(2)
    expect(wellFormed).toBe(true)
  })

  it('keeps a row of exactly the cap, including one that ends the text', () => {
    expect(rowsOf('a,b,c\n1,2,3', CAP)).toEqual({
      rows: [
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ],
      wellFormed: true,
    })
  })

  it('reports a row with more cells than the cap as not well formed, and does not deliver it', () => {
    expect(rowsOf('a,b,c\n1,2,3,4\n5,6,7\n', CAP)).toEqual({
      rows: [['a', 'b', 'c']],
      wellFormed: false,
    })
  })

  it('reports a last row one cell past the cap as not well formed when it has no line break', () => {
    expect(rowsOf('a,b,c,d', CAP)).toEqual({ rows: [], wellFormed: false })
  })

  it('stops at the cap on a 32 MiB row of commas, so it never reads the rest of the row', () => {
    let seen = 0
    const wellFormed = readCsvRows(','.repeat(32 * 1024 * 1024), CAP, () => {
      seen++
      return true
    })
    expect(wellFormed).toBe(false)
    expect(seen).toBe(0)
  })
})

const BYTE_ORDER_MARK = 0xfeff

/** The reader as it was before fields were cut in slices, one character at a time: the reference the slicing reader must match. */
function readCsvRowsByCharacter(
  text: string,
  maxCells: number,
  onRow: (fields: string[]) => boolean,
): boolean {
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === ',') {
      if (!addCell(row, field, maxCells)) return false
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (!addCell(row, field, maxCells)) return false
      if (!isBlank(row) && !onRow(row)) return true
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (quoted) return false
  if (field !== '' || row.length > 0) {
    if (!addCell(row, field, maxCells)) return false
    if (!isBlank(row)) onRow(row)
  }
  return true
}

/** Adds a cell to a row, or returns false when the row already holds the most cells it may. */
function addCell(row: string[], field: string, maxCells: number): boolean {
  if (row.length >= maxCells) return false
  row.push(field)
  return true
}

function isBlank(cells: string[]): boolean {
  return cells.length === 1 && cells[0] === ''
}

/** mulberry32: a seeded generator with a full 32-bit state, so the texts are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('readCsvRows against the reader that built fields a character at a time', () => {
  const ALPHABET = ['a', 'b', ' ', ',', '"', '"', '\n', '\r', '\r\n', '\ufeff']

  function run(reader: typeof readCsvRows, text: string, stopAfter: number) {
    const rows: string[][] = []
    const wellFormed = reader(text, 4, (fields) => {
      rows.push(fields)
      return rows.length < stopAfter
    })
    return { rows, wellFormed }
  }

  it('reads 60,000 distinct random texts of commas, quotes and line breaks the same way', () => {
    const next = random(0x5eed)
    const texts = new Set<string>()
    while (texts.size < 60_000) {
      const length = Math.floor(next() * 40)
      let text = ''
      for (let i = 0; i < length; i++) text += ALPHABET[Math.floor(next() * ALPHABET.length)]!
      texts.add(text)
    }
    expect(texts.size).toBeGreaterThanOrEqual(50_000)
    let n = 0
    for (const text of texts) {
      const stopAfter = 1 + (n++ % 4)
      expect(run(readCsvRows, text, stopAfter), JSON.stringify(text)).toEqual(
        run(readCsvRowsByCharacter, text, stopAfter),
      )
    }
  })
})

describe('readCsvRows field cap', () => {
  const read = (text: string) => rowsOf(text)

  it('reads a field of exactly the cap and refuses one character more', () => {
    const edge = 'x'.repeat(MAX_CSV_FIELD_CHARS)
    expect(read(`${edge},b\n`).rows).toEqual([[edge, 'b']])
    expect(read(`${edge}x,b\n`)).toEqual({ rows: [], wellFormed: false })
    expect(read(`"${edge}",b\n`).rows).toEqual([[edge, 'b']])
    expect(read(`"${edge}x",b\n`)).toEqual({ rows: [], wellFormed: false })
  })

  it('refuses a field made of doubled quotes past the cap without keeping a piece for each', () => {
    const flood = `"${'""'.repeat(MAX_CSV_FIELD_CHARS + 1)}"`
    expect(read(flood)).toEqual({ rows: [], wellFormed: false })
  })

  it('refuses a field past a smaller cap the caller gives, however it is written', () => {
    const huge = 'y'.repeat(4096)
    const readWith = (text: string) => {
      const rows: string[][] = []
      const wellFormed = readCsvRows(text, 9, (f) => rows.push(f) > 0, 1024)
      return { rows, wellFormed }
    }
    expect(readWith(`a,${huge}\n`)).toEqual({ rows: [], wellFormed: false })
    expect(readWith(`a,"${huge}"\n`)).toEqual({ rows: [], wellFormed: false })
    expect(readWith(`a,${huge}`)).toEqual({ rows: [], wellFormed: false })
    // The same field is read under the cap it fits.
    expect(readWith(`a,${'y'.repeat(1024)}\n`).wellFormed).toBe(true)
  })

  it('keeps the rows read before the field that is too long', () => {
    expect(read(`a,b\n${'z'.repeat(MAX_CSV_FIELD_CHARS + 1)}\n`)).toEqual({
      rows: [['a', 'b']],
      wellFormed: false,
    })
  })

  it('takes a smaller cap from the caller', () => {
    const rows: string[][] = []
    const text = 'abc,de\n'
    expect(readCsvRows(text, 9, (f) => rows.push(f) > 0, 2)).toBe(false)
    expect(rows).toEqual([])
    expect(readCsvRows(text, 9, (f) => rows.push(f) > 0, 3)).toBe(true)
    expect(rows).toEqual([['abc', 'de']])
  })
})
