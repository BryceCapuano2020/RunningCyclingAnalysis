import { ACTIVITY_ENTRIES } from './methodActivity'
import { ANALYSIS_ENTRIES } from './methodCalculated'
import { RECORDED_ENTRIES } from './methodRecorded'
import type { EntryState, MethodEntry } from './methodEntryTypes'

export type { EntryState, MethodEntry }

/** The heading of each state, and the lines under it that say what the state means. */
export const STATE_COPY: Record<EntryState, { title: string; lines: readonly string[] }> = {
  calculated: {
    title: 'Calculated by this app',
    lines: [],
  },
  read: { title: 'Recorded in your files', lines: [] },
  unavailable: {
    title: 'Not available from activity files',
    lines: [],
  },
}

/** The states in the order the page lists them. */
export const STATE_ORDER: readonly EntryState[] = ['calculated', 'read', 'unavailable']

/** Every entry, the calculated ones first, in the order the page lists them. */
export const METHOD_ENTRIES: readonly MethodEntry[] = [
  ...ANALYSIS_ENTRIES,
  ...ACTIVITY_ENTRIES,
  ...RECORDED_ENTRIES,
]

/** The entries of one state, in page order. */
export function entriesOf(state: EntryState): MethodEntry[] {
  return METHOD_ENTRIES.filter((entry) => entry.state === state)
}

/** An entry by name, for the copy a test or another page quotes. */
export function entryNamed(name: string): MethodEntry {
  const entry = METHOD_ENTRIES.find((candidate) => candidate.name === name)
  if (!entry) throw new Error(`No method entry ${name}`)
  return entry
}
