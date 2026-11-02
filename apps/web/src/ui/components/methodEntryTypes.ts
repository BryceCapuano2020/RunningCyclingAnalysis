/** Where a number the app shows comes from. */
export type EntryState = 'calculated' | 'read' | 'unavailable'

/**
 * One thing the app shows or leaves out: its name, where it comes from, its plain lines, and the technical
 * detail behind a More detail disclosure. Every idea on How this works is one entry, said once.
 */
export interface MethodEntry {
  name: string
  state: EntryState
  /** One sentence a line, so each line holds one fact. */
  lines: readonly string[]
  detail?: readonly string[]
}
