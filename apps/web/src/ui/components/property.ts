import type { ReactNode } from 'react'

/** One fact in a detail panel: a short label and its value, which is a figure, a date or a few words. */
export interface Property {
  label: string
  value: ReactNode
  /** A row that opens something (a logged set opens its form): its label is a button with this accessible name. */
  action?: { name: string; onActivate: () => void }
}

/** No rows, as a stable default for a prop that takes rows. */
export const NO_ROWS: readonly Property[] = []

/** The rows with a text value as one string, "Label: value" a sentence each, for a caller that wants words, not a panel. */
export function rowsAsText(rows: readonly Property[]): string {
  return rows
    .flatMap((row) => (typeof row.value === 'string' ? [`${row.label}: ${row.value}.`] : []))
    .join(' ')
}
