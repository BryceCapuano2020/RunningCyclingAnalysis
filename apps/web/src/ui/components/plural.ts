import { groupThousands } from '@rca/core/units'

/**
 * "1 file", "2 files", "1,204 files", "1,204.5 hours". The number takes the one grouping rule, so its
 * decimals stay as they are. Pass the plural form when it is not the singular with an s.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${groupThousands(String(count))} ${count === 1 ? singular : pluralForm}`
}
