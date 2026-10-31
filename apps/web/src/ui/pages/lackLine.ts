/**
 * A section's reason for having nothing to show, as one line of the page's "Not enough yet" list: the
 * section's name, then what it needs in the sentence it would have said under its own heading, such as
 * "Race predictions: needs a best of a mile or more, or 2 outdoor runs with a heart rate that can be trusted."
 */
export function lackLine(section: string, need: string): string {
  const lower = `${need.charAt(0).toLowerCase()}${need.slice(1)}`
  return `${section}: ${lower}${lower.endsWith('.') ? '' : '.'}`
}
