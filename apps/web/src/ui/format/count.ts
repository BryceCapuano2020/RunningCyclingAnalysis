import { groupThousands } from '@rca/core/units'

/**
 * A whole count with its digits grouped in comma thousands, such as 1,234, as core's whole() groups
 * them. The app is English throughout, so the grouping does not follow the browser's locale. Every
 * count the app writes goes through here, so the grouping is set once.
 */
export function formatCount(count: number): string {
  return groupThousands(String(Math.round(count)))
}
