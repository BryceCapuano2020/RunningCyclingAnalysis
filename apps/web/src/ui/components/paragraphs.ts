/** The most characters a paragraph of method lines holds: about five lines at the reading measure. */
export const PARAGRAPH_CHARS = 320

/**
 * Method lines, one sentence each, grouped into paragraphs. A line joins the paragraph before it until that
 * paragraph is full, so a run of short facts reads as text and is not a column of one-line blocks. A line
 * is never split, and a line longer than the limit is a paragraph of its own.
 */
export function paragraphsOf(lines: readonly string[], maxChars = PARAGRAPH_CHARS): string[][] {
  const paragraphs: string[][] = []
  let used = 0
  for (const line of lines) {
    const last = paragraphs.at(-1)
    if (last !== undefined && used + 1 + line.length <= maxChars) {
      last.push(line)
      used += 1 + line.length
    } else {
      paragraphs.push([line])
      used = line.length
    }
  }
  return paragraphs
}
