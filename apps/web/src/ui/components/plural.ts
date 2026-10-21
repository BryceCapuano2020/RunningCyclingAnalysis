/** "1 file", "2 files". Pass the plural form when it is not the singular with an s. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
