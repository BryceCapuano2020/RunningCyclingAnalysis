import { describe, expect, it } from 'vitest'
import { readCsvRows } from './csv'

/** The rows of some text, and whether the text read as well formed. */
function rowsOf(text: string): { rows: string[][]; wellFormed: boolean } {
  const rows: string[][] = []
  const wellFormed = readCsvRows(text, (fields) => {
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
    const wellFormed = readCsvRows('a\nb\nc\n', () => {
      seen++
      return seen < 2
    })
    expect(seen).toBe(2)
    expect(wellFormed).toBe(true)
  })
})
