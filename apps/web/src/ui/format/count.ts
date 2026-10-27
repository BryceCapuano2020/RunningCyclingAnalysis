import { groupThousands } from '@rca/core/units'

/**
 * A whole count in comma thousands, such as 1,234, the rule every number the app writes follows (see
 * docs/DESIGN.md). It is core's groupThousands, so it does not follow the browser's locale. Counts in
 * the app's sentences are written through here or through plural(), so none is grouped differently.
 */
export function formatCount(count: number): string {
  return groupThousands(String(Math.round(count)))
}
