import { MAX_CSV_FIELD_CHARS } from './limits'

const BYTE_ORDER_MARK = 0xfeff
const QUOTE = 0x22
const COMMA = 0x2c
const LF = 0x0a
const CR = 0x0d

/**
 * Reads CSV text (RFC 4180) row by row, calling onRow with each row's fields in turn, so only one row
 * is held at a time. A quoted field may hold commas, line breaks and doubled quotes. Rows end in LF,
 * CRLF or CR, a leading byte order mark is dropped, and blank lines are not rows. A row holds at most
 * maxCells cells, and onRow returns false to stop early. The result is false when the text is
 * malformed: it ends inside a quoted field, a field holds more than maxFieldChars characters, or a
 * row holds more than maxCells cells, and the read stops at the cell past the cap. Stopping early is
 * not a failure.
 *
 * A field is cut from the text in slices, never built a character at a time, so a field costs about
 * its own length however it is written, and a field past the cap is refused before it is copied.
 */
export function readCsvRows(
  text: string,
  maxCells: number,
  onRow: (fields: string[]) => boolean,
  maxFieldChars: number = MAX_CSV_FIELD_CHARS,
): boolean {
  let row: string[] = []
  // The field being read: the slices taken so far, their length, and where the slice in progress began.
  let parts: string[] = []
  let length = 0
  let runStart = 0
  let quoted = false

  /** Takes the slice in progress, up to `end`. False when the field is now past the cap. */
  const take = (end: number): boolean => {
    if (end > runStart) {
      parts.push(text.slice(runStart, end))
      length += end - runStart
    }
    return length <= maxFieldChars
  }
  const endField = (): string => {
    const field = parts.length === 1 ? parts[0]! : parts.join('')
    parts = []
    length = 0
    return field
  }

  let i = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0
  runStart = i
  while (i < text.length) {
    if (quoted) {
      const close = text.indexOf('"', i)
      if (close === -1) return false
      if (!take(close)) return false
      if (text.charCodeAt(close + 1) === QUOTE) {
        // A doubled quote is one quote of the field: keep the first, skip the second.
        parts.push('"')
        length++
        if (length > maxFieldChars) return false
        i = runStart = close + 2
      } else {
        quoted = false
        i = runStart = close + 1
      }
      continue
    }
    const c = text.charCodeAt(i)
    if (c === QUOTE && length === 0 && i === runStart) {
      quoted = true
      i = runStart = i + 1
    } else if (c === COMMA) {
      if (!take(i)) return false
      if (!addCell(row, endField(), maxCells)) return false
      i = runStart = i + 1
    } else if (c === LF || c === CR) {
      if (!take(i)) return false
      if (!addCell(row, endField(), maxCells)) return false
      if (c === CR && text.charCodeAt(i + 1) === LF) i++
      if (!isBlank(row) && !onRow(row)) return true
      row = []
      i = runStart = i + 1
    } else {
      i++
    }
  }
  if (quoted) return false
  if (!take(text.length)) return false
  const field = endField()
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
