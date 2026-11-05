/** Text as a reader sees it: runs of white space, a no-break space among them, as one space, and no space at the ends. */
const normal = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/** Whether a text is the one asked for: equal to a string, or matched by a pattern. */
const matches = (text: string, wanted: string | RegExp) =>
  typeof wanted === 'string' ? text === wanted : wanted.test(text)

/**
 * A text matcher for the element whose whole text is `text` (or matches it), however it is split across its children
 * (a figure set apart in the mono, a unit set smaller), and not for the elements that hold it.
 */
export function wholeText(text: string | RegExp) {
  return (_: string, element: Element | null): boolean =>
    element !== null &&
    matches(normal(element.textContent), text) &&
    Array.from(element.children).every((child) => !matches(normal(child.textContent), text))
}
