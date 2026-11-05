import './RowList.css'

/**
 * A row's mono index, in its sport's ink: the row (or a parent) sets data-sport, and a row with no sport takes the
 * secondary ink. It is a list's own numbering, so a screen reader is not read it twice.
 */
export function RowIndex({ index }: { index: number }) {
  return (
    <span className="row__index" aria-hidden="true">
      {/* 01, 02 and on, two digits. */}
      {String(index + 1).padStart(2, '0')}
    </span>
  )
}
