const BYTE_ORDER_MARK = 0xfeff

/**
 * Reads CSV text (RFC 4180) row by row, calling onRow with each row's fields in turn, so only one row
 * is held at a time. A quoted field may hold commas, line breaks and doubled quotes. Rows end in LF,
 * CRLF or CR, a leading byte order mark is dropped, and blank lines are not rows. onRow returns false
 * to stop early. The result is false only when the text ends inside a quoted field, which makes it
 * malformed; stopping early is not a failure.
 */
export function readCsvRows(text: string, onRow: (fields: string[]) => boolean): boolean {
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
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (!isBlank(row) && !onRow(row)) return true
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (quoted) return false
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (!isBlank(row)) onRow(row)
  }
  return true
}

function isBlank(cells: string[]): boolean {
  return cells.length === 1 && cells[0] === ''
}
