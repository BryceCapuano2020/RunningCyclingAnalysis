import type { TooltipContent } from './chartTypes'

/**
 * A phone's readout row at rest, from the reading of the chart's latest point (or the one `lead` names, such as "Best"): "Latest · Week ending 25 Oct: Run
 * 64%, Ride 58%". Undefined without a reading, so the row says how to read a point instead.
 */
export function idleFrom(content: TooltipContent | null, lead = 'Latest'): string | undefined {
  if (content === null) return undefined
  const values = content.rows
    .filter((row) => row.value !== '—')
    .map((row) => `${row.label} ${row.value}`)
  return values.length === 0 ? undefined : `${lead} · ${content.title}: ${values.join(', ')}`
}

/** The index of the last row that holds something, or -1 where none does. */
export function lastIndexWhere<T>(rows: readonly T[], holds: (row: T) => boolean): number {
  for (let i = rows.length - 1; i >= 0; i--) if (holds(rows[i]!)) return i
  return -1
}
