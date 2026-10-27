const BYTE_ORDER_MARK = 0xfeff

/**
 * Reads CSV text (RFC 4180) row by row, calling onRow with each row's fields in turn, so only one row
 * is held at a time. A quoted field may hold commas, line breaks and doubled quotes. Rows end in LF,
 * CRLF or CR, a leading byte order mark is dropped, and blank lines are not rows. A row holds at most
 * maxCells cells, and onRow returns false to stop early. The result is false when the text is
 * malformed: it ends inside a quoted field, or a row holds more than maxCells cells, and the read
 * stops at the cell past the cap. Stopping early is not a failure.
 */
export function readCsvRows(
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
