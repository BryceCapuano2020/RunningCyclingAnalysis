import { formatCount } from '../format/count'

/**
 * "1 file", "2 files", "1,204 files". A whole count is grouped as formatCount writes it; a
 * fraction, such as hours or weeks, is written as it is. Pass the plural form when it is not the
 * singular with an s.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  const figure = Number.isInteger(count) ? formatCount(count) : String(count)
  return `${figure} ${count === 1 ? singular : pluralForm}`
}
