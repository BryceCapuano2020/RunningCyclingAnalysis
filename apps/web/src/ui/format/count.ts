/**
 * A whole count with its digits grouped in the browser's own locale, such as 1,234 in English and
 * 1.234 in German. Every count the app writes goes through here, so the grouping is set once.
 */
export function formatCount(count: number): string {
  return count.toLocaleString(undefined)
}
