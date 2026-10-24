/** The name of the activity behind a value, for a tooltip note. Null, and no note, without a name. */
export function sourceNote(
  id: string | null,
  names: Record<string, string> | undefined,
): string | undefined {
  const name = id === null ? undefined : names?.[id]
  return name === undefined ? undefined : `from ${name}`
}

/** The activity's name for a table cell. A dash where no activity set the value; blank without a name. */
export function activityCell(id: string | null, names: Record<string, string> | undefined): string {
  if (id === null) return '—'
  return names?.[id] ?? ''
}
